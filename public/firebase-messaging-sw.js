/**
 * Exibe mensagens FCM em segundo plano sem duplicar a configuração pública do
 * Firebase no arquivo estático, que também é analisado pelo scanner da Netlify.
 */
self.addEventListener("push", (event) => {
  const payload = event.data?.json() ?? {};
  const notificacao = payload.notification ?? {};
  const dados = payload.data ?? {};

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((janelas) => {
        if (janelas.some((janela) => janela.visibilityState === "visible")) {
          return;
        }

        return self.registration.showNotification(
          notificacao.title ?? dados.title ?? "CondoOwl",
          {
            body: notificacao.body ?? dados.body ?? "",
            icon: notificacao.icon ?? "/favicon.ico",
            badge: notificacao.badge ?? "/favicon.ico",
            data: { url: dados.url ?? payload.fcmOptions?.link ?? "/" },
          },
        );
      }),
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
