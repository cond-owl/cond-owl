import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";

// Atesta o service worker do push: o FCM entrega o payload no evento `push` e o
// worker precisa exibir a notificação mesmo com o app aberto e visível (o app
// não tem handler de mensagem em primeiro plano, então ocultar o aviso nesse
// caso deixava o morador sem nenhum sinal). `showNotification` é interceptado
// no worker porque o Chromium headless não concede permissão de notificação ao
// service worker; o que se prova é a decisão do handler, não o desenho do SO.
const registrarServiceWorker = async (
  page: Page,
  context: BrowserContext,
): Promise<Worker> => {
  const worker = context.waitForEvent("serviceworker");
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    await navigator.serviceWorker.ready;
  });
  return worker;
};

// O tsconfig do projeto não carrega os tipos de service worker; só o que o
// teste usa do escopo do worker é descrito aqui.
interface EscopoDoWorker {
  registration: {
    showNotification: (
      titulo: string,
      opcoes?: { body?: string },
    ) => Promise<void>;
  };
  PushEvent: new (tipo: string, init: { data: Uint8Array }) => Event;
  dispatchEvent: (evento: Event) => boolean;
}

const enviarPush = (worker: Worker, payload: unknown) =>
  worker.evaluate(async (corpo) => {
    const escopo = globalThis as unknown as EscopoDoWorker;
    const exibidas: { title: string; body?: string }[] = [];
    escopo.registration.showNotification = (title, opcoes) => {
      exibidas.push({ title, body: opcoes?.body });
      return Promise.resolve();
    };

    let pendente: Promise<unknown> = Promise.resolve();
    const evento = new escopo.PushEvent("push", {
      data: new TextEncoder().encode(JSON.stringify(corpo)),
    });
    // waitUntil real só existe em evento despachado pelo navegador; aqui o
    // listener é chamado direto e a promessa dele é capturada.
    Object.defineProperty(evento, "waitUntil", {
      value: (p: Promise<unknown>) => {
        pendente = p;
      },
    });
    escopo.dispatchEvent(evento);
    await pendente;

    return exibidas;
  }, payload);

test.describe("service worker de notificações", () => {
  test("exibe a notificação do FCM com o app aberto e visível", async ({
    page,
    context,
  }) => {
    const worker = await registrarServiceWorker(page, context);

    const exibidas = await enviarPush(worker, {
      notification: { title: "[AVISO] Teste", body: "Corpo do aviso" },
    });

    expect(exibidas).toEqual([{ title: "[AVISO] Teste", body: "Corpo do aviso" }]);
  });

  test("payload sem notification usa o título padrão do app", async ({
    page,
    context,
  }) => {
    const worker = await registrarServiceWorker(page, context);

    const exibidas = await enviarPush(worker, { data: { body: "So dados" } });

    expect(exibidas).toEqual([{ title: "CondoOwl", body: "So dados" }]);
  });
});
