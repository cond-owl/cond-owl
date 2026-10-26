// public/firebase-messaging-sw.js

// Importa os scripts do Firebase diretamente do Google
importScripts(
  "https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js",
);
importScripts(
  "https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js",
);

// COLOQUE AQUI AS SUAS CHAVES DO PASSO 1
firebase.initializeApp({
  apiKey: "AIzaSyAUx9F3aQ4dxXl7zto9xW3YGS8GpaERZNg",
  authDomain: "condoowl-f9e5a.firebaseapp.com",
  projectId: "condoowl-f9e5a",
  storageBucket: "condoowl-f9e5a.firebasestorage.app",
  messagingSenderId: "558383550095",
  appId: "1:558383550095:web:a9410035ffcbce519c6afa",
});

const messaging = firebase.messaging();

// Como o Firebase já exibe automaticamente as notificações enviadas pelo painel,
// deixamos esta função apenas para registar no console, sem chamar o showNotification!
messaging.onBackgroundMessage(function (payload) {
  console.log("Mensagem recebida em background: ", payload);
});
