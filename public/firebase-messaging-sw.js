/**
 * Exibe mensagens FCM sem duplicar a configuração pública do Firebase no
 * arquivo estático, que também é analisado pelo scanner da Netlify.
 *
 * A notificação aparece mesmo com o app aberto: o app não tem tempo real nem
 * handler de mensagem em primeiro plano, então suprimir o aviso quando há
 * janela visível deixava quem estava com o PWA aberto sem sinal algum.
 */
self.addEventListener("install", () => {
  // Versão nova assume sem esperar todas as abas fecharem.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { notification: { body: event.data?.text() ?? "" } };
  }
  const notificacao = payload.notification ?? {};
  const dados = payload.data ?? {};

  event.waitUntil(
    self.registration.showNotification(
      notificacao.title ?? dados.title ?? "CondoOwl",
      {
        body: notificacao.body ?? dados.body ?? "",
        icon: notificacao.icon ?? "/pwa-icon-192.png",
        badge: notificacao.badge ?? "/pwa-icon-192.png",
        data: { url: dados.url ?? payload.fcmOptions?.link ?? "/" },
      },
    ),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url ?? "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((janelas) => {
        for (const janela of janelas) {
          if (janela.url.startsWith(self.location.origin) && "focus" in janela) {
            return janela.focus();
          }
        }

        return self.clients.openWindow(targetUrl);
      }),
  );
});
