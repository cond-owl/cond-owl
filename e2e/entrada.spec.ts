import { expect, test, type Page } from "@playwright/test";

// Intercepta só o RPC que a tela de código consulta: o teste fica
// determinístico e não toca no Supabase real.
const responderCodigo = (page: Page, existe: boolean) =>
  page.route("**/rest/v1/rpc/validar_codigo_condominio", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(existe),
    }),
  );

test.describe("entrada no app", () => {
  test("abre na barreira de código do condomínio", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByText(/Informe o código de acesso do seu condomínio/),
    ).toBeVisible();
    await expect(page.getByPlaceholder("Digite o código")).toBeVisible();
    await expect(page.getByText("Acessar Condomínio")).toBeVisible();
  });

  test("código vazio é recusado sem consultar o servidor", async ({ page }) => {
    await page.goto("/");
    await page.getByText("Acessar Condomínio").click();

    await expect(
      page.getByText("Digite o código do seu condomínio."),
    ).toBeVisible();
  });

  test("código inexistente mostra a mensagem de erro", async ({ page }) => {
    await responderCodigo(page, false);
    await page.goto("/");

    await page.getByPlaceholder("Digite o código").fill("nao-existe");
    await page.getByText("Acessar Condomínio").click();

    await expect(
      page.getByText("Código de condomínio não encontrado."),
    ).toBeVisible();
  });

  test("código válido leva ao login com as abas Morador e Síndico", async ({
    page,
  }) => {
    await responderCodigo(page, true);
    await page.goto("/");

    await page.getByPlaceholder("Digite o código").fill("colinas-de-roma");
    await page.getByText("Acessar Condomínio").click();

    await expect(page.getByText("Trocar condomínio")).toBeVisible();
    await expect(page.getByText("Morador", { exact: true })).toBeVisible();
    await expect(page.getByText("Síndico", { exact: true })).toBeVisible();
  });
});
