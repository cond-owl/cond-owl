// Registra um token push por dispositivo. O navegador usa FCM Web; os apps
// nativos usam Expo Push para encaminhar notificações a FCM e APNs.
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
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

const salvarToken = async (
  userId: string,
  plataforma: "web" | "expo",
  token: string,
): Promise<string | null> => {
  const { data, error } = await supabase
    .from("dispositivos_notificacao")
    .upsert(
      { user_id: userId, plataforma, token },
      { onConflict: "user_id,token" },
    )
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return "Não foi possível guardar o registro deste aparelho.";
  }

  return null;
};

const registrarTokenWeb = async (userId: string): Promise<string | null> => {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "Este navegador não oferece suporte a notificações push.";
  }

  if (!chaveVapid || !Object.values(configuracaoFirebase).every(Boolean)) {
    return "Notificações web não estão configuradas.";
  }

  try {
    const permissao = await Notification.requestPermission();
    if (permissao !== "granted") {
      return "A permissão para notificações não foi concedida.";
    }

    const { getMessaging, getToken } = await import("firebase/messaging");
    const app = initializeApp(configuracaoFirebase, "condo-owl-web-push");
    const token = await getToken(getMessaging(app), { vapidKey: chaveVapid });
    if (!token) return "Não foi possível registrar este navegador.";

    return salvarToken(userId, "web", token);
  } catch {
    return "Não foi possível ativar as notificações neste navegador.";
  }
};

const registrarTokenNativo = async (userId: string): Promise<string | null> => {
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Avisos do condomínio",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const permissaoAtual = await Notifications.getPermissionsAsync();
    const permissao = permissaoAtual.granted
      ? permissaoAtual
      : await Notifications.requestPermissionsAsync();
    if (!permissao.granted) {
      return "A permissão para notificações não foi concedida.";
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return "A configuração de notificações do app está incompleta.";

    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return salvarToken(userId, "expo", token.data);
  } catch {
    return "Não foi possível registrar este aparelho para notificações.";
  }
};

export const solicitarPermissaoNotificacao = (userId: string) =>
  Platform.OS === "web"
    ? registrarTokenWeb(userId)
    : registrarTokenNativo(userId);
