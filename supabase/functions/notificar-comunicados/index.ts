import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cert, getApps, initializeApp } from "npm:firebase-admin/app";
import { getMessaging } from "npm:firebase-admin/messaging";

const serviceAccountStr = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
if (!serviceAccountStr) throw new Error("Configuração do Firebase ausente.");

const serviceAccount = JSON.parse(serviceAccountStr);

if (getApps().length === 0) {
  initializeApp({ credential: cert(serviceAccount) });
}

type Comunicado = { tipo: string; titulo: string; texto: string };
type PayloadDoWebhook = { record: Comunicado };
type DispositivoNotificacaoRow = {
  token: string;
  perfil: { notifica_manutencao: boolean; notifica_social: boolean };
};

const ehPayloadDoWebhook = (valor: unknown): valor is PayloadDoWebhook => {
  if (typeof valor !== "object" || valor === null || !("record" in valor)) {
    return false;
  }

  const registro = valor.record;
  return (
    typeof registro === "object" &&
    registro !== null &&
    "tipo" in registro &&
    typeof registro.tipo === "string" &&
    "titulo" in registro &&
    typeof registro.titulo === "string" &&
    "texto" in registro &&
    typeof registro.texto === "string"
  );
};

const ehChamadaDeServico = (req: Request) => {
  const autorizacao = req.headers.get("Authorization");
  const token = autorizacao?.match(/^Bearer\s+([^.]+\.[^.]+\.[^.]+)$/i)?.[1];
  if (!token) return false;

  try {
    const parte = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(parte)) as { role?: string };
    return payload.role === "service_role";
  } catch {
    return false;
  }
};

serve(async (req) => {
  try {
    if (req.method !== "POST" || !ehChamadaDeServico(req)) {
      return new Response("Não autorizado.", { status: 401 });
    }

    const payload: unknown = await req.json();
    if (!ehPayloadDoWebhook(payload)) {
      return new Response("Comunicado inválido.", { status: 400 });
    }
    const comunicado = payload.record;

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const chaveServico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !chaveServico) {
      throw new Error("Configuração do Supabase ausente.");
    }

    const supabase = createClient(supabaseUrl, chaveServico);
    let query = supabase
      .from("dispositivos_notificacao")
      .select(
        "token, perfil:perfis!dispositivos_notificacao_user_id_fkey!inner(notifica_manutencao, notifica_social)",
      );

    if (comunicado.tipo === "MANUTENÇÃO") {
      query = query.eq("perfil.notifica_manutencao", true);
    } else if (comunicado.tipo === "SOCIAL") {
      query = query.eq("perfil.notifica_social", true);
    }

    const { data: dispositivos, error } = await query;
    if (error) throw error;

    const tokens = [...new Set(
      ((dispositivos ?? []) as DispositivoNotificacaoRow[]).map(
        (dispositivo) => dispositivo.token,
      ),
    )];

    if (tokens.length === 0) {
      return new Response(
        JSON.stringify({ message: "Ninguém para notificar.", disparos: 0 }),
        { status: 200 },
      );
    }

    const resposta = await getMessaging().sendEachForMulticast({
      notification: {
        title: `[${comunicado.tipo}] ${comunicado.titulo}`,
        body: comunicado.texto,
      },
      webpush: {
        notification: {
          icon: `${supabaseUrl}/storage/v1/object/public/assets/altadef1024.png`,
        },
      },
      tokens,
    });

    return new Response(
      JSON.stringify({ success: true, disparos: resposta.successCount }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (erro: unknown) {
    return new Response(
      JSON.stringify({
        error: erro instanceof Error ? erro.message : "Erro inesperado.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
