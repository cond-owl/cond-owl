import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../supabase";

// Código de condomínio validado na primeira tela, guardado só para pular a tela nas
// próximas aberturas. Quem decide se ele existe, e se o usuário pertence a ele, é o banco.
// AsyncStorage (já usado pela sessão do Supabase) funciona no celular e no web.
const CHAVE_STORAGE = "@condoowl:codigo_validado";

// Cópia em memória: se o storage falhar (ex.: navegador em modo restrito), o código
// validado ainda vale até fechar o app, e a conferência pós-login não nega em silêncio.
let codigoEmMemoria: string | null = null;

export const lerCodigoSalvo = async (): Promise<string | null> => {
  if (codigoEmMemoria) return codigoEmMemoria;
  try {
    return await AsyncStorage.getItem(CHAVE_STORAGE);
  } catch {
    return null;
  }
};

// Devolve false se não conseguiu gravar no aparelho (a cópia em memória fica de qualquer jeito).
export const salvarCodigo = async (codigo: string | null): Promise<boolean> => {
  codigoEmMemoria = codigo;
  try {
    if (codigo) await AsyncStorage.setItem(CHAVE_STORAGE, codigo);
    else await AsyncStorage.removeItem(CHAVE_STORAGE);
    return true;
  } catch {
    return false;
  }
};

// Os dois retornam true/false = resposta do servidor; null = não foi possível
// perguntar (rede, erro). Quem chama não deve tratar null como "código errado".

// O código existe? Pode ser chamada sem login.
export const codigoExiste = async (codigo: string): Promise<boolean | null> => {
  const { data, error } = await supabase.rpc("validar_codigo_condominio", {
    codigo_informado: codigo,
  });
  if (error) return null;
  return data === true;
};

// Aba escolhida na tela de login (Morador ou Síndico), guardada só em memória até a
// conferência pós-login. Sessão restaurada na abertura do app não tem escolha: fica null e
// a conferência de tipo não se aplica.
export type TipoUsuario = "morador" | "sindico";
let tipoDoLogin: TipoUsuario | null = null;
export const definirTipoDoLogin = (tipo: TipoUsuario | null) => {
  tipoDoLogin = tipo;
};
export const lerTipoDoLogin = (): TipoUsuario | null => tipoDoLogin;

// O usuário logado é do tipo escolhido na tela? Exige login.
export const usuarioEhDoTipo = async (tipo: TipoUsuario): Promise<boolean | null> => {
  const { data, error } = await supabase.rpc("usuario_e_do_tipo", {
    tipo_informado: tipo,
  });
  if (error) return null;
  return data === true;
};

// O usuário logado pertence ao condomínio desse código? Exige login.
export const usuarioPertence = async (codigo: string): Promise<boolean | null> => {
  const { data, error } = await supabase.rpc("usuario_pertence_ao_condominio", {
    codigo_informado: codigo,
  });
  if (error) return null;
  return data === true;
};
