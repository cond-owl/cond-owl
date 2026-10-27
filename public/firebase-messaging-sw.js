// public/firebase-messaging-sw.js

// Importa os scripts do Firebase diretamente do Google
importScripts(
  "https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js",
);
importScripts(
  "https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js",
);

// Configuração do Firebase
firebase.initializeApp({
  apiKey: "AIzaSyAUx9F3aQ4dxXl7zto9xW3YGS8GpaERZNg",
  authDomain: "condoowl-f9e5a.firebaseapp.com",
  projectId: "condoowl-f9e5a",
  storageBucket: "condoowl-f9e5a.firebasestorage.app",
  messagingSenderId: "558383550095",
  appId: "1:558383550095:web:a9410035ffcbce519c6afa",
});

const messaging = firebase.messaging();

// Processa notificações em segundo plano / app fechado
messaging.onBackgroundMessage(function (payload) {
  console.log("[sw.js] Mensagem recebida em background: ", payload);

  // Pega título e corpo (seja enviado via 'notification' ou 'data' do backend)
  const title =
    payload.notification?.title || payload.data?.title || "CondoOwl";
  const options = {
    body: payload.notification?.body || payload.data?.body || "",
    icon: "/favicon.png",
    badge: "/favicon.png",
    vibrate: [200, 100, 200],
    data: {
      url: payload.data?.url || "/",
    },
  };

  // EXIGIDO NO ANDROID: Força a renderização do banner nativo
  return self.registration.showNotification(title, options);
});

// Ação executada ao tocar na notificação no celular
self.addEventListener("notificationclick", function (event) {
  event.notification.close(); // Fecha o banner da notificação

  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clientList) {
        // Se o PWA já estiver aberto, traz ele para frente (foco)
        for (let i = 0; i < clientList.length; i++) {
          let client = clientList[i];
          if (client.url.includes(self.location.origin) && "focus" in client) {
            return client.focus();
          }
        }
        // Se estiver totalmente fechado, abre o PWA
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      }),
  );
});
