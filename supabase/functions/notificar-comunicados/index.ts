/**
 * Envia o push de um comunicado recém-publicado aos aparelhos web registrados.
 * Comunicado de conduta vai só para os aparelhos do apartamento destinatário: o
 * filtro é refeito aqui porque a função lê os tokens com service_role.
 *
 * Quem chama é o gatilho `comunicados_notificar` (migração 0017), via pg_net,
 * com `Authorization: Bearer <NOTIFICAR_WEBHOOK_SECRET>`. A função roda com
 * `verify_jwt = false` porque o segredo compartilhado substitui o JWT: o
 * Database Webhook do painel manda a chave anon, nunca a service_role, e a
 * versão anterior (que exigia role service_role no JWT) respondia 401 a todo
 * disparo, sem que nenhum aviso chegasse.
 *
 * Credenciais ficam só nos secrets da função (FIREBASE_SERVICE_ACCOUNT,
 * NOTIFICAR_WEBHOOK_SECRET); nada disso existe no app.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cert, getApps, initializeApp } from "npm:firebase-admin/app";
import { getMessaging } from "npm:firebase-admin/messaging";

type Comunicado = {
  id: number;
  tipo: string;
  titulo: string;
  texto: string;
};
type PayloadDoWebhook = { record: Comunicado };

// Códigos do FCM que significam "este token não existe mais": o aparelho
// desinstalou o PWA ou revogou a permissão. Outros erros (cota, rede, payload)
// não autorizam apagar o registro.
const CODIGOS_TOKEN_MORTO = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

// O corpo do push é só uma prévia; o texto completo está no Mural.
const LIMITE_CORPO = 180;

const PAGINA_CONSULTA = 1000; // igual ao max_rows do PostgREST
const LOTE_FCM = 500; // máximo do sendEachForMulticast
const LOTE_LIMPEZA = 50; // tokens por DELETE (cabem na URL)

const ehPayloadDoWebhook = (valor: unknown): valor is PayloadDoWebhook => {
  if (typeof valor !== "object" || valor === null || !("record" in valor)) {
    return false;
  }

  const registro = valor.record;
  return (
    typeof registro === "object" &&
    registro !== null &&
    "id" in registro &&
    typeof registro.id === "number" &&
    "tipo" in registro &&
    typeof registro.tipo === "string" &&
    "titulo" in registro &&
    typeof registro.titulo === "string" &&
    "texto" in registro &&
    typeof registro.texto === "string"
  );
};

const resumo = async (texto: string) =>
  new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto)),
  );

// Compara os hashes (tamanho fixo) em tempo constante, sem vazar o tamanho
// nem o prefixo do segredo pelo tempo de resposta.
const segredoConfere = async (recebido: string, esperado: string) => {
  const [a, b] = await Promise.all([resumo(recebido), resumo(esperado)]);
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a[i] ^ b[i];
  return diferenca === 0;
};

const ehChamadaDoGatilho = async (req: Request, segredo: string) => {
  const token = req.headers
    .get("Authorization")
    ?.match(/^Bearer\s+(\S+)$/i)?.[1];
  return token !== undefined && (await segredoConfere(token, segredo));
};

const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });

serve(async (req) => {
  try {
    // Config ausente vira 500 com mensagem clara (visível em net._http_response),
    // em vez de derrubar o boot da função com um erro opaco.
    const segredoWebhook = Deno.env.get("NOTIFICAR_WEBHOOK_SECRET");
    const contaDeServico = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const chaveServico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!segredoWebhook || !contaDeServico || !supabaseUrl || !chaveServico) {
      return resposta({ error: "Configuração da função incompleta." }, 500);
    }

    if (req.method !== "POST" || !(await ehChamadaDoGatilho(req, segredoWebhook))) {
      return new Response("Não autorizado.", { status: 401 });
    }

    const payload: unknown = await req.json();
    if (!ehPayloadDoWebhook(payload)) {
      return new Response("Comunicado inválido.", { status: 400 });
    }
    const comunicado = payload.record;

    if (getApps().length === 0) {
      initializeApp({ credential: cert(JSON.parse(contaDeServico)) });
    }

    const supabase = createClient(supabaseUrl, chaveServico);

    // Conduta é sigilosa por apartamento: o RLS barra o morador no app, mas o push
    // sai com service_role e precisa do mesmo filtro. O gatilho manda só os campos
    // básicos, então o destinatário é lido da própria linha publicada.
    let unidadeDestino: string | null = null;
    if (comunicado.tipo.toUpperCase() === "CONDUTA") {
      const { data: publicado, error: erroDoComunicado } = await supabase
        .from("comunicados")
        .select("unidade_destino")
        .eq("id", comunicado.id)
        .maybeSingle();
      if (erroDoComunicado) throw erroDoComunicado;

      unidadeDestino = String(publicado?.unidade_destino ?? "")
        .trim()
        .toLowerCase();
      if (unidadeDestino === "") {
        return resposta({
          message: "Conduta sem apartamento destinatário.",
          disparos: 0,
        });
      }
    }

    // A RPC lê apenas tokens web de usuários aprovados e pagina até o limite do
    // PostgREST. AVISO e REUNIÃO vão para todos; MANUTENÇÃO e SOCIAL respeitam
    // a preferência de cada perfil.
    const todosOsTokens = new Set<string>();
    for (let inicio = 0; ; inicio += PAGINA_CONSULTA) {
      const { data: pagina, error } = await supabase.rpc(
        "tokens_notificacao_pwa",
        { p_inicio: inicio, p_limite: PAGINA_CONSULTA },
      );
      if (error) throw error;
      (pagina ?? []).forEach((d) => {
        if (
          comunicado.tipo === "MANUTENÇÃO" &&
          d.notifica_manutencao !== true
        ) return;
        if (comunicado.tipo === "SOCIAL" && d.notifica_social !== true) return;

        if (unidadeDestino !== null) {
          const unidade = String(d.unidade ?? "").trim().toLowerCase();
          if (unidade !== unidadeDestino) return;
        }
        todosOsTokens.add(String(d.token));
      });
      if ((pagina ?? []).length < PAGINA_CONSULTA) break;
    }

    const tokens = [...todosOsTokens];
    if (tokens.length === 0) {
      return resposta({ message: "Ninguém para notificar.", disparos: 0 });
    }

    // Por pontos de código, não unidades UTF-16: cortar no meio de um emoji
    // deixaria um surrogate solto no corpo do push.
    const caracteres = [...comunicado.texto];
    const corpo = caracteres.length > LIMITE_CORPO
      ? `${caracteres.slice(0, LIMITE_CORPO - 1).join("")}…`
      : comunicado.texto;

    const mensagem = {
      notification: {
        title: `[${comunicado.tipo}] ${comunicado.titulo}`,
        body: corpo,
      },
      webpush: {
        // Urgência alta: sem ela o aparelho parado pode receber o aviso horas
        // depois, quando o navegador economiza bateria.
        headers: { Urgency: "high", TTL: "86400" },
      },
    };

    // Falha de envio não pode ser silenciosa: o retorno lista os códigos (sem
    // token) e fica em net._http_response para diagnóstico. O FCM aceita no
    // máximo 500 tokens por chamada, então o envio é em lotes.
    let sucessos = 0;
    let falhas = 0;
    const falhasPorCodigo: Record<string, number> = {};
    const tokensMortos: string[] = [];
    for (let i = 0; i < tokens.length; i += LOTE_FCM) {
      const lote = tokens.slice(i, i + LOTE_FCM);
      const envio = await getMessaging().sendEachForMulticast({
        ...mensagem,
        tokens: lote,
      });
      sucessos += envio.successCount;
      falhas += envio.failureCount;
      envio.responses.forEach((r, j) => {
        if (r.success) return;
        const codigo = r.error?.code ?? "desconhecido";
        falhasPorCodigo[codigo] = (falhasPorCodigo[codigo] ?? 0) + 1;
        if (CODIGOS_TOKEN_MORTO.has(codigo)) tokensMortos.push(lote[j]);
      });
    }

    // Em lotes pequenos: o .in() vai na URL e token FCM web tem ~150 caracteres.
    let removidos = 0;
    let erroLimpeza: string | undefined;
    for (let i = 0; i < tokensMortos.length; i += LOTE_LIMPEZA) {
      const { error: erro, count } = await supabase
        .from("dispositivos_notificacao")
        .delete({ count: "exact" })
        .in("token", tokensMortos.slice(i, i + LOTE_LIMPEZA));
      if (erro) erroLimpeza = erro.message;
      else removidos += count ?? 0;
    }

    // Tudo falhou: HTTP 502, para o status em net._http_response refletir a
    // falha em vez de parecer sucesso.
    return resposta(
      {
        success: sucessos > 0,
        disparos: sucessos,
        falhas,
        falhasPorCodigo,
        removidos,
        erroLimpeza,
      },
      sucessos === 0 && falhas > 0 ? 502 : 200,
    );
  } catch (erro: unknown) {
    return resposta(
      { error: erro instanceof Error ? erro.message : "Erro inesperado." },
      500,
    );
  }
});
