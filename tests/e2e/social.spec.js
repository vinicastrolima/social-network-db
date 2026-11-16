import { expect, test } from "@playwright/test";

test("dois usuários conectam-se, conversam e recuperam o histórico", async ({
  browser,
}) => {
  const alice = await browser.newContext();
  const bob = await browser.newContext();
  const a = await alice.newPage();
  const b = await bob.newPage();
  const stamp = Date.now();
  for (const [page, name] of [
    [a, "Alice"],
    [b, "Bruno"],
  ]) {
    await page.goto("/");
    await page.getByRole("button", { name: "Criar minha conta" }).click();
    await page.getByLabel("Nome completo").fill(`${name} ${stamp}`);
    await page.getByLabel("Nome de usuário").fill(`${name}${stamp}`);
    await page.getByLabel("E-mail").fill(`${name}${stamp}@example.test`);
    await page
      .getByLabel("Senha", { exact: true })
      .fill("playwright-password-123");
    await page
      .getByRole("button", { name: "Criar conta", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Comunidade", exact: true }),
    ).toBeVisible();
  }
  await a.getByRole("button", { name: "Conexões", exact: true }).click();
  await a.getByLabel("Buscar nome ou usuário").fill(`Bruno ${stamp}`);
  await a.getByRole("button", { name: "Buscar", exact: true }).click();
  await a
    .getByRole("article")
    .filter({ hasText: `Bruno ${stamp}` })
    .getByRole("button", { name: "Conectar", exact: true })
    .click();
  await b.getByRole("button", { name: "Conexões", exact: true }).click();
  await b.getByRole("button", { name: "Aceitar", exact: true }).click();
  await b.getByRole("button", { name: "Conversar", exact: true }).click();
  await a.getByRole("button", { name: "Conversas", exact: true }).click();
  await a
    .getByLabel("Mensagem", { exact: true })
    .fill("Olá, vamos construir juntos?");
  await a.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(
    b.locator(".bubble").filter({ hasText: "Olá, vamos construir juntos?" }),
  ).toBeVisible({ timeout: 10000 });
  await b.getByLabel("Mensagem", { exact: true }).fill("Vamos sim!");
  await b.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(
    a.locator(".bubble").filter({ hasText: "Vamos sim!" }),
  ).toBeVisible({ timeout: 10000 });
  await a.reload();
  await a.getByRole("button", { name: "Conversas", exact: true }).click();
  await expect(
    a.locator(".bubble").filter({ hasText: "Vamos sim!" }),
  ).toBeVisible();
  await a.setViewportSize({ width: 390, height: 844 });
  await expect(
    a.getByRole("button", { name: "Enviar mensagem" }),
  ).toBeVisible();
  await a.emulateMedia({ reducedMotion: "reduce" });
  await a.screenshot({ path: "test-results/chat-mobile.png", fullPage: true });
  await alice.close();
  await bob.close();
});
