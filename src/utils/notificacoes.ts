// Configuração das notificações push (Firebase Cloud Messaging). Os valores do
// Firebase vêm do .env (EXPO_PUBLIC_FIREBASE_*); nada de credencial ou URL fixa
// no código. Sem as variáveis, as notificações ficam desativadas e o app segue
// funcionando normalmente.
import { initializeApp, type FirebaseOptions } from "firebase/app";
import { getMessaging, getToken } from "firebase/messaging";
import { supabase } from "../supabase";

const configuracao: Pick<
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

const vapidKey = process.env.EXPO_PUBLIC_FIREBASE_VAPID_KEY;

const completa = Object.values(configuracao).every(
  (valor) => typeof valor === "string" && valor.length > 0,
);

// Só inicializa o mensageiro com a configuração completa e em navegador que
// suporte notificações (no nativo, o push é tratado por outra via).
const messaging =
  completa &&
  typeof window !== "undefined" &&
  "Notification" in window
    ? getMessaging(initializeApp(configuracao))
    : null;

export const solicitarPermissaoNotificacao = async (userId: string) => {
  if (!messaging || !vapidKey) return;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    // Se o utilizador aceitar, pede um token único ao Firebase e guarda no perfil.
    const token = await getToken(messaging, { vapidKey });
    if (!token) return;

    await supabase
      .from("perfis")
      .update({ fcm_token: token })
      .eq("id", userId);
  } catch {
    // Falha ao registrar notificações não impede o uso do app.
  }
};
