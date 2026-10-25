// src/utils/notificacoes.ts
import { initializeApp } from "firebase/app";
import { getMessaging, getToken } from "firebase/messaging";
import { supabase } from "../supabase";

// 1. COLE AQUI O SEU FIREBASE CONFIG (Gerado no Passo 1)
const firebaseConfig = {
  apiKey: "AIzaSyAUx9F3aQ4dxXl7zto9xW3YGS8GpaERZNg",
  authDomain: "condoowl-f9e5a.firebaseapp.com",
  projectId: "condoowl-f9e5a",
  storageBucket: "condoowl-f9e5a.firebasestorage.app",
  messagingSenderId: "558383550095",
  appId: "1:558383550095:web:a9410035ffcbce519c6afa",
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// Só inicializa o mensageiro se estiver num navegador que suporte notificações
const messaging =
  typeof window !== "undefined" && "Notification" in window
    ? getMessaging(app)
    : null;

export const solicitarPermissaoNotificacao = async (userId: string) => {
  if (!messaging) return;

  try {
    // Abre aquele pop-up nativo do navegador: "Este site deseja enviar notificações (Permitir/Bloquear)"
    const permission = await Notification.requestPermission();

    if (permission === "granted") {
      // Se o utilizador aceitar, pede um Token único ao Firebase
      const token = await getToken(messaging, {
        vapidKey:
          "BDDepkjfgX9zmD_sYtWzYfr1SUbdeLqHXUPORavLEySAs73qijWTB8CDwvRmhljXXL53glsCLCc0sOXcrfjRndI",
      });

      if (token) {
        // Guarda o token na tabela perfis do Supabase associado a este utilizador
        const { error } = await supabase
          .from("perfis")
          .update({ fcm_token: token })
          .eq("id", userId);

        if (error) {
          console.error("Erro ao guardar token no Supabase:", error);
        } else {
          console.log("Notificações ativadas! Token guardado com sucesso.");
        }
      }
    } else {
      console.log("O utilizador recusou as notificações.");
    }
  } catch (error) {
    console.error("Erro ao configurar notificações:", error);
  }
};
