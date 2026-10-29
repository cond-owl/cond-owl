import { chromium, expect, test, type Page } from "@playwright/test";

// Fluxo logado do cartão de notificações no Mural. Tudo que sai para o
// Supabase é interceptado (nenhum dado real é lido ou gravado) e o objeto
// Notification do navegador é substituído para controlar a permissão.
type PermissaoSimulada = "default" | "denied" | "granted" | "ausente";

const base64url = (texto: string) =>
  btoa(texto).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const jwtDeTeste = `${base64url('{"alg":"HS256","typ":"JWT"}')}.${base64url(
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',
)}.assinatura`;

const sessaoMorador = {
  access_token: jwtDeTeste,
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(new Date().getTime() / 1000) + 3600,
  refresh_token: "refresh-de-teste",
  user: {
    id: "00000000-0000-0000-0000-000000000001",
    aud: "authenticated",
    role: "authenticated",
    email: "morador@teste.local",
    app_metadata: { role: "morador", status_aprovacao: "aprovado" },
    user_metadata: { nome_completo: "Morador Teste" },
    created_at: "2026-01-01T00:00:00Z",
  },
};

const json = (corpo: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(corpo),
});

const simularNotification = (page: Page, permissao: PermissaoSimulada) =>
  page.addInitScript((inicial) => {
    const janela = window as unknown as Record<string, unknown>;
    if (inicial === "ausente") {
      delete janela.Notification;
      return;
    }
    const simulada = {
      permission: inicial,
      requestPermission: async () => {
        simulada.permission = "granted";
        return "granted";
      },
    };
    janela.Notification = simulada;
  }, permissao);

const entrarComoMorador = async (page: Page) => {
  page.on("dialog", (dialogo) => void dialogo.dismiss());

  await page.route("**/rest/v1/rpc/validar_codigo_condominio", (r) =>
    r.fulfill(json(true)),
  );
  await page.route("**/rest/v1/rpc/usuario_pertence_ao_condominio", (r) =>
    r.fulfill(json(true)),
  );
  await page.route("**/rest/v1/rpc/usuario_e_do_tipo", (r) =>
    r.fulfill(json(true)),
  );
  await page.route("**/auth/v1/token**", (r) => r.fulfill(json(sessaoMorador)));
  await page.route("**/rest/v1/perfis**", (r) =>
    r.fulfill(
      json({ notifica_manutencao: true, notifica_social: true }),
    ),
  );
  await page.route("**/rest/v1/dispositivos_notificacao**", (r) =>
    r.fulfill(json([{ id: "1" }], 201)),
  );
  await page.route(
    /\/rest\/v1\/(comunicados|eventos|atas|sugestoes)/,
    (r) => r.fulfill(json([])),
  );

  await page.goto("/");
  await page.getByPlaceholder("Digite o código").fill("colinas-de-roma");
  await page.getByText("Acessar Condomínio").click();
  await page.getByPlaceholder("E-mail").fill("morador@teste.local");
  await page.getByPlaceholder("Senha").fill("senha-de-teste");
  await page.getByText("Entrar no App").click();
};

test.describe("cartão de notificações no Mural", () => {
  // O Chromium do teste é anônimo (sem Push API), então o registro do token
  // falha depois da permissão concedida. É o cenário que importa: o cartão
  // não pode sumir, senão a pessoa fica sem receber e sem pista na tela.
  test("permissão concedida sem registro mantém o cartão com nova tentativa", async ({
    page,
  }) => {
    await simularNotification(page, "default");
    await entrarComoMorador(page);

    await expect(page.getByText("Quer receber avisos neste PWA?")).toBeVisible();
    await page.getByText("Ativar notificações", { exact: true }).click();

    await expect(
      page.getByText(/permissão foi concedida, mas não foi possível registrar/),
    ).toBeVisible();
    await expect(
      page.getByText("Ativar notificações", { exact: true }),
    ).toBeVisible();
  });

  test("permissão negada explica como liberar", async ({ page }) => {
    await simularNotification(page, "denied");
    await entrarComoMorador(page);

    await expect(
      page.getByText(/As notificações estão bloqueadas para este app/),
    ).toBeVisible();
  });

  test("navegador sem Notification orienta instalar o PWA, sem botão", async ({
    page,
  }) => {
    await simularNotification(page, "ausente");
    await entrarComoMorador(page);

    await expect(
      page.getByText(/Adicionar à Tela de Início e abra o app pelo ícone/),
    ).toBeVisible();
    await expect(
      page.getByText("Ativar notificações", { exact: true }),
    ).toBeHidden();
  });

  // Perfil persistente: o contexto padrão do Playwright é anônimo e o Chrome
  // desliga o Push API em anônimo, o que impediria o registro de chegar ao FCM.
  test("permissão já concedida não mostra o cartão e reregistra o aparelho", async ({
    baseURL,
  }) => {
    // outputPath fica na pasta de resultados do Playwright, que ele mesmo limpa.
    const contexto = await chromium.launchPersistentContext(
      test.info().outputPath("perfil"),
      {
        baseURL,
        viewport: { width: 420, height: 900 },
      },
    );
    try {
      const page = contexto.pages()[0] ?? (await contexto.newPage());
      await simularNotification(page, "granted");
      // Sem novo prompt, o login sozinho precisa tentar registrar o token. O
      // app só registra o service worker do FCM nesse caminho, então a
      // presença do registro prova que o reregistro rodou. O token em si não
      // é obtido: o Chromium headless não tem serviço de push (getToken falha
      // com "push service not available"), e o fluxo termina em silêncio.
      await entrarComoMorador(page);

      await expect(page.getByText("Mural de Avisos")).toBeVisible();
      await expect
        .poll(
          () =>
            page.evaluate(
              async () =>
                (await navigator.serviceWorker.getRegistrations()).length,
            ),
          { timeout: 15_000 },
        )
        .toBeGreaterThan(0);
      await expect(
        page.getByText("Quer receber avisos neste PWA?"),
      ).toBeHidden();
    } finally {
      await contexto.close();
    }
  });
});
