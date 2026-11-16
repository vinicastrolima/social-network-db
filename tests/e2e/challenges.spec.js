import { expect, test } from "@playwright/test";

test("participante pode ler o enunciado antes de se inscrever", async ({
  page,
}) => {
  const statement = "Leia a entrada.\nRetorne <resultado>.";
  await page.route("**/api/me", (route) =>
    route.fulfill({ json: { id: "1", full_name: "Alice", username: "alice" } }),
  );
  await page.route("**/api/posts", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/challenges", (route) =>
    route.fulfill({
      json: [
        {
          id: "1",
          title: "Processar entrada",
          description: "Pratique leitura de dados.",
          statement,
          joined: false,
        },
      ],
    }),
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Desafios", exact: true }).click();
  const challenge = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Processar entrada" }),
  });
  await challenge.getByText("Enunciado", { exact: true }).click();
  const content = challenge.locator(".challenge-statement");
  await expect(content).toBeVisible();
  expect(await content.textContent()).toBe(statement);
});
