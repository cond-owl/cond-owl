/**
 * Push do PWA via Firebase Cloud Messaging Web.
 *
 * Cada instalação do PWA tem o seu token FCM, guardado em
 * `dispositivos_notificacao`. Dois caminhos chegam ao mesmo registro:
 * - `solicitarPermissaoNotificacao`: a pessoa toca no botão, o navegador
 *   pergunta e, concedido, o token é gravado. O pedido de permissão precisa
 *   ser a primeira coisa do toque (antes de qualquer await) ou o navegador
 *   recusa o prompt.
 * - `sincronizarNotificacao`: roda sozinho após o login quando a permissão já
 *   foi concedida; a tela mostra uma falha e deixa tentar de novo quando o
 *   registro não termina. O token também atualiza o campo legado do perfil.
 */
import { initializeApp, type FirebaseOptions } from "firebase/app";
import { supabase } from "../supabase";

const configuracaoFirebase: Pick<
  FirebaseOptions,
  | "apiKey"
  | "authDomain"
  | "projectId"
  | "storageBucket"
  | "messagingSenderId"
  | "appId"
> = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const chaveVapid = process.env.EXPO_PUBLIC_FIREBASE_VAPID_KEY;
const variaveisFirebase = [
  ["EXPO_PUBLIC_FIREBASE_API_KEY", configuracaoFirebase.apiKey],
  ["EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN", configuracaoFirebase.authDomain],
  ["EXPO_PUBLIC_FIREBASE_PROJECT_ID", configuracaoFirebase.projectId],
  ["EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET", configuracaoFirebase.storageBucket],
  [
    "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    configuracaoFirebase.messagingSenderId,
  ],
  ["EXPO_PUBLIC_FIREBASE_APP_ID", configuracaoFirebase.appId],
  ["EXPO_PUBLIC_FIREBASE_VAPID_KEY", chaveVapid],
] as const;

export type EstadoNotificacao =
  | "origem-insegura"
  | "nao-suportado"
  | "pendente"
  | "negada"
  | "concedida";

// O push depende da API web; ambientes sem Notification não recebem token.
export const estadoNotificacao = (): EstadoNotificacao => {
  if (typeof window === "undefined") {
    return "nao-suportado";
  }
  if (window.isSecureContext === false) return "origem-insegura";
  if (!("Notification" in window)) return "nao-suportado";
  if (Notification.permission === "granted") return "concedida";
  if (Notification.permission === "denied") return "negada";
  return "pendente";
};

const variaveisAusentes = () =>
  variaveisFirebase.filter(([, valor]) => !valor).map(([nome]) => nome);

const obterToken = async (
  registroServiceWorker: ServiceWorkerRegistration,
): Promise<string | null> => {
  const { getMessaging, getToken } = await import("firebase/messaging");
  const app = initializeApp(configuracaoFirebase, "condo-owl-web-push");
  return getToken(getMessaging(app), {
    vapidKey: chaveVapid,
    serviceWorkerRegistration: registroServiceWorker,
  });
};

// Obtém o token FCM da instalação e grava para o usuário. Devolve a mensagem
// de erro para a tela, ou null se o registro ficou guardado.
const registrarToken = async (userId: string): Promise<string | null> => {
  const ausentes = variaveisAusentes();
  if (ausentes.length > 0) {
    return `Esta publicação do PWA está sem configuração de notificações. Variáveis ausentes: ${ausentes.join(", ")}.`;
  }

  try {
    const { isSupported } = await import("firebase/messaging");
    if (!(await isSupported())) {
      return "Este navegador não oferece suporte ao Firebase Push.";
    }

    const registroServiceWorker = await navigator.serviceWorker.register(
      "/firebase-messaging-sw.js",
    );
    // getToken exige um service worker ativo; register() pode devolver o
    // registro ainda instalando na primeira visita.
    await navigator.serviceWorker.ready;

    const token = await obterToken(registroServiceWorker);

    if (!token) return "Não foi possível registrar este navegador.";

    const { data, error } = await supabase
      .from("dispositivos_notificacao")
      .upsert(
        { user_id: userId, plataforma: "web", token },
        { onConflict: "user_id,token" },
      )
      .select("id")
      .maybeSingle();

    // 23503: o usuário não tem linha em `perfis` (conta anterior ao gatilho de
    // cadastro); o token não pode ser gravado até o perfil existir.
    if (error?.code === "23503") {
      return "Seu perfil ainda não está completo; não foi possível registrar este aparelho.";
    }
    if (error || !data) {
      return "Não foi possível guardar o registro deste aparelho.";
    }

    // `dispositivos_notificacao` é a fonte por aparelho. Mantemos também o
    // campo legado preenchido para contas e ferramentas que ainda o consultam.
    const { data: perfil, error: erroPerfil } = await supabase
      .from("perfis")
      .update({ fcm_token: token })
      .eq("id", userId)
      .select("id")
      .maybeSingle();

    if (erroPerfil || !perfil) {
      return "O aparelho foi registrado, mas não foi possível atualizar o token FCM do perfil. Aplique as migrações 0015, 0016 e 0020 do Supabase.";
    }

    return null;
  } catch {
    return "Não foi possível ativar as notificações neste navegador.";
  }
};

export const solicitarPermissaoNotificacao = async (
  userId: string,
): Promise<string | null> => {
  if (estadoNotificacao() === "nao-suportado") {
    return "Este navegador não oferece suporte a notificações push.";
  }

  if (variaveisAusentes().length > 0) return registrarToken(userId);

  try {
    // Primeira chamada assíncrona do toque: não pode vir depois de await.
    const permissao = await Notification.requestPermission();
    if (permissao !== "granted") {
      return "A permissão para notificações não foi concedida.";
    }
  } catch {
    return "Não foi possível ativar as notificações neste navegador.";
  }

  return registrarToken(userId);
};

// Reregistra o token quando a permissão já foi concedida, sem novo prompt.
// Devolve falhas para a tela manter uma nova tentativa disponível.
export const sincronizarNotificacao = async (
  userId: string,
): Promise<string | null> => {
  if (estadoNotificacao() !== "concedida") return null;
  return registrarToken(userId);
};

// Apaga o registro deste aparelho para o usuário que está saindo. Sem isso o
// token continuaria ligado à conta antiga e o aparelho seguiria recebendo os
// avisos dela (e as preferências dela valeriam no envio, que deduplica por
// token). Nunca bloqueia nem falha o logout: é melhor esforço.
export const removerRegistroNotificacao = async (
  userId: string,
): Promise<void> => {
  if (estadoNotificacao() !== "concedida" || variaveisAusentes().length > 0) {
    return;
  }

  try {
    const { isSupported } = await import("firebase/messaging");
    if (!(await isSupported())) return;

    const registro = await navigator.serviceWorker.getRegistration("/");
    if (!registro) return;

    const token = await obterToken(registro);
    if (!token) return;

    await Promise.all([
      supabase
        .from("dispositivos_notificacao")
        .delete()
        .eq("user_id", userId)
        .eq("token", token),
      supabase
        .from("perfis")
        .update({ fcm_token: null })
        .eq("id", userId)
        .eq("fcm_token", token),
    ]);
  } catch {
    // Melhor esforço: o token morto é limpo pelo envio quando o FCM o recusar.
  }
};
