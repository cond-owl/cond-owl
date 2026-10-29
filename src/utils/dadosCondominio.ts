import { supabase } from "../supabase";
import { MESES } from "./calendario";

// Acesso às tabelas comunicados, eventos (reservas), espacos_reserva (configuração
// do síndico), sugestoes e atas. Quem protege os dados é o RLS (supabase/migrations
// 0005 a 0008 e 0018 a 0019); aqui só se consulta e se traduz o erro do banco. As
// listas devolvem null em caso de erro (quem chama decide o que mostrar); as
// gravações devolvem a mensagem de erro para o usuário, ou null se deu certo.

export interface Evento {
  data: string; // AAAA-MM-DD
  tipo: string;
  titulo: string;
  detalhes: string;
  horaInicio?: string;
  horaFim?: string;
}
export interface Reuniao {
  data: string; // DD/MM/AAAA
  pauta: string;
  link: string;
}
export interface EspacoReserva {
  id: number;
  nome: string;
}
export interface Ata {
  mes: string; // "Outubro 2026"
  reunioes: Reuniao[];
}
export interface Sugestao {
  id: number;
  texto: string;
  status: string;
  motivo: string;
}

// Linha da tabela `eventos` como o PostgREST devolve (snake_case).
interface EventoRow {
  data: string;
  tipo: string;
  titulo: string;
  detalhes: string;
  hora_inicio: string | null;
  hora_fim: string | null;
}

// Linha da tabela `espacos_reserva` como o PostgREST devolve.
interface EspacoRow {
  id: number;
  nome: string;
}
// Linha de `perfis` usada para montar a lista de apartamentos.
interface UnidadeRow {
  unidade: string | null;
}
// Limites das colunas (iguais aos CHECK das migrações); o app usa em maxLength.
// Limites das colunas (iguais aos CHECK das migrações); o app usa em maxLength.
export const LIMITE = {
  detalhes: 2000,
  sugestao: 1000,
  motivo: 1000,
  pauta: 200,
  arquivo: 500,
  espaco: 60,
  comunicado: 2000,
  tituloComunicado: 120,
  unidade: 30,
};

// "18:00:00" (coluna time) -> "18:00"
const hhmm = (hora: string | null): string | undefined =>
  hora ? hora.slice(0, 5) : undefined;

// Códigos do Postgres que o usuário pode provocar de verdade. Código vazio = a requisição
// nem chegou ao banco (sem conexão): o postgrest devolve "" em vez de null.
const mensagemDoErro = (
  error: { code?: string | null },
  padrao: string,
  porCodigo: Record<string, string> = {},
): string => {
  const codigo = error.code ?? "";
  if (!codigo) return `${padrao}: verifique a conexão e tente novamente.`;
  return (
    porCodigo[codigo] ??
    (codigo === "23514"
      ? "Algum campo está fora do limite permitido."
      : `${padrao} (${codigo}).`)
  );
};

// --- EVENTOS E RESERVAS ---

export const carregarEventos = async (): Promise<Evento[] | null> => {
  const { data, error } = await supabase
    .from("eventos")
    .select("data, tipo, titulo, detalhes, hora_inicio, hora_fim")
    .order("data")
    .order("hora_inicio");
  if (error) return null;
  return (data ?? []).map((e: EventoRow) => {
    const horaInicio = hhmm(e.hora_inicio);
    const horaFim = hhmm(e.hora_fim);
    const horario = horaInicio && horaFim ? `Horário: ${horaInicio} às ${horaFim}` : "";
    return {
      data: e.data,
      tipo: e.tipo,
      titulo: e.titulo,
      detalhes: [horario, e.detalhes].filter(Boolean).join("\n"),
      horaInicio,
      horaFim,
    };
  });
};

export const criarReserva = async (reserva: {
  data: string;
  espaco: string;
  horaInicio: string;
  horaFim: string;
  detalhes: string;
}): Promise<string | null> => {
  const { error } = await supabase.from("eventos").insert({
    data: reserva.data,
    tipo: "reserva",
    titulo: reserva.espaco,
    detalhes: reserva.detalhes.trim(),
    hora_inicio: reserva.horaInicio,
    hora_fim: reserva.horaFim,
  });
  if (!error) return null;
  return mensagemDoErro(error, "Não foi possível reservar", {
    // exclusion constraint: mesmo espaço, mesmo dia, horários que se cruzam
    "23P01": "Este espaço já está reservado para este horário neste dia.",
    // RLS: data já passada ou cadastro ainda não aprovado
    "42501": "Não foi possível reservar: confira a data e se o seu acesso já foi aprovado.",
    "23514": "Horário inválido: a hora final deve ser maior que a inicial.",
  });
};

// --- ESPAÇOS DE RESERVA ---

export const carregarEspacos = async (): Promise<EspacoReserva[] | null> => {
  const { data, error } = await supabase
    .from("espacos_reserva")
    .select("id, nome")
    .order("nome");
  if (error) return null;
  return (data ?? []).map((e: EspacoRow) => ({ id: e.id, nome: e.nome }));
};

export const criarEspaco = async (nome: string): Promise<string | null> => {
  const { error } = await supabase
    .from("espacos_reserva")
    .insert({ nome: nome.trim() });
  if (!error) return null;
  return mensagemDoErro(error, "Não foi possível criar o espaço", {
    // índice único em lower(nome): nome repetido sem diferenciar maiúsculas
    "23505": "Já existe um espaço com esse nome.",
    "23514": `O nome deve ter entre 1 e ${LIMITE.espaco} caracteres.`,
    "42501": "Apenas o síndico pode criar espaços.",
  });
};

// O RLS não devolve erro quando não permite (0 linhas), então confere que a linha
// foi mesmo apagada. As reservas antigas ficam no calendário: elas guardam o nome
// do espaço, não o id.
export const removerEspaco = async (id: number): Promise<string | null> => {
  const { data, error } = await supabase
    .from("espacos_reserva")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) {
    return mensagemDoErro(error, "Não foi possível remover o espaço", {
      "42501": "Apenas o síndico pode remover espaços.",
    });
  }
  return data && data.length > 0
    ? null
    : "Apenas o síndico pode remover espaços.";
};

// --- COMUNICADOS ---

// Apartamentos cadastrados, sem repetir. O síndico usa a lista no seletor de
// destinatário do comunicado de conduta; a policy de perfis já permite que ele
// leia todos.
export const carregarUnidades = async (): Promise<string[] | null> => {
  const { data, error } = await supabase
    .from("perfis")
    .select("unidade")
    .not("unidade", "is", null)
    .order("unidade");
  if (error) return null;

  const unidades = new Set<string>();
  for (const perfil of (data ?? []) as UnidadeRow[]) {
    const unidade = (perfil.unidade ?? "").trim();
    if (unidade) unidades.add(unidade);
  }
  return [...unidades];
};

// --- SUGESTÕES ---

export const carregarSugestoes = async (): Promise<Sugestao[] | null> => {
  const { data, error } = await supabase
    .from("sugestoes")
    .select("id, texto, status, motivo")
    .order("created_at", { ascending: false });
  if (error) return null;
  return data ?? [];
};

export const criarSugestao = async (texto: string): Promise<string | null> => {
  const { error } = await supabase.from("sugestoes").insert({ texto: texto.trim() });
  if (!error) return null;
  return mensagemDoErro(error, "Não foi possível enviar a sugestão", {
    "42501": "Não foi possível enviar: o seu acesso ainda não foi aprovado.",
  });
};

// Só o síndico avalia. O RLS não devolve erro quando não permite (0 linhas), então
// confere que a linha foi mesmo alterada.
export const avaliarSugestaoNoBanco = async (
  id: number,
  status: "aprovada" | "arquivada",
  motivo: string,
): Promise<string | null> => {
  const { data, error } = await supabase
    .from("sugestoes")
    .update({ status, motivo: status === "arquivada" ? motivo.trim() : "" })
    .eq("id", id)
    .select("id");
  if (error) {
    return mensagemDoErro(error, "Não foi possível avaliar a sugestão", {
      "23514": `Informe o motivo do arquivamento (até ${LIMITE.motivo} caracteres).`,
    });
  }
  return data && data.length > 0 ? null : "Apenas o síndico pode avaliar sugestões.";
};

// --- ATAS ---

const dataBr = (iso: string) => iso.split("-").reverse().join("/");

export const carregarAtas = async (): Promise<Ata[] | null> => {
  const { data, error } = await supabase
    .from("atas")
    .select("data, pauta, arquivo")
    .order("data", { ascending: false });
  if (error) return null;

  // Agrupa por mês, mantendo a ordem (mais recente primeiro).
  const porMes = new Map<string, Reuniao[]>();
  for (const a of data ?? []) {
    const [ano, mes] = a.data.split("-").map(Number);
    const rotulo = `${MESES[mes - 1]} ${ano}`;
    const reunioes = porMes.get(rotulo) ?? [];
    reunioes.push({ data: dataBr(a.data), pauta: a.pauta, link: a.arquivo });
    porMes.set(rotulo, reunioes);
  }
  return [...porMes].map(([mes, reunioes]) => ({ mes, reunioes }));
};

export const criarAta = async (ata: {
  data: string;
  pauta: string;
  arquivo: string;
}): Promise<string | null> => {
  const { error } = await supabase.from("atas").insert({
    data: ata.data,
    pauta: ata.pauta.trim(),
    arquivo: ata.arquivo.trim(),
  });
  if (!error) return null;
  return mensagemDoErro(error, "Não foi possível salvar a ata", {
    "42501": "Apenas o síndico pode cadastrar atas.",
  });
};
