// Registra um token FCM para cada instalação do PWA que autoriza notificações.
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

export const solicitarPermissaoNotificacao = async (
  userId: string,
): Promise<string | null> => {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "Este navegador não oferece suporte a notificações push.";
  }

  if (!chaveVapid || !Object.values(configuracaoFirebase).every(Boolean)) {
    return "Notificações não estão configuradas neste navegador.";
  }

  try {
    const { getMessaging, getToken, isSupported } = await import(
      "firebase/messaging"
    );
    if (!(await isSupported())) {
      return "Este navegador não oferece suporte ao Firebase Push.";
    }

    const permissao = await Notification.requestPermission();
    if (permissao !== "granted") {
      return "A permissão para notificações não foi concedida.";
    }

    const registroServiceWorker = await navigator.serviceWorker.register(
      "/firebase-messaging-sw.js",
    );
    const app = initializeApp(configuracaoFirebase, "condo-owl-web-push");
    const token = await getToken(getMessaging(app), {
      vapidKey: chaveVapid,
      serviceWorkerRegistration: registroServiceWorker,
    });

    if (!token) return "Não foi possível registrar este navegador.";

    const { data, error } = await supabase
      .from("dispositivos_notificacao")
      .upsert(
        { user_id: userId, plataforma: "web", token },
        { onConflict: "user_id,token" },
      )
      .select("id")
      .maybeSingle();

    if (error || !data) {
      return "Não foi possível guardar o registro deste aparelho.";
    }

    return null;
  } catch {
    return "Não foi possível ativar as notificações neste navegador.";
  }
};
