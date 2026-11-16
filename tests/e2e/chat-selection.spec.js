import { expect, test } from "@playwright/test";

for (const listed of [true, false]) {
  test(`Conexões abre o destinatário escolhido ${listed ? "entre as conversas recentes" : "fora da lista inicial"}`, async ({
    page,
  }) => {
    const selectedId = "000000000000000000000001";
    const otherId = "000000000000000000000002";
    const recent = [{ _id: otherId, peer: { full_name: "Carla" } }];
    if (listed) recent.push({ _id: selectedId, peer: { full_name: "Bruno" } });

    await page.route("**/api/me", (route) =>
      route.fulfill({
        json: { id: "1", full_name: "Alice", username: "alice" },
      }),
    );
    await page.route("**/api/posts", (route) => route.fulfill({ json: [] }));
    await page.route("**/api/users?*", (route) => route.fulfill({ json: [] }));
    await page.route("**/api/friends", (route) =>
      route.fulfill({
        json: [
          {
            id: "1",
            requester_id: "1",
            addressee_id: "2",
            status: "aceita",
            full_name: "Bruno",
          },
        ],
      }),
    );
    await page.route("**/api/conversations", (route) =>
      route.fulfill({
        json:
          route.request().method() === "POST" ? { _id: selectedId } : recent,
      }),
    );
    await page.route("**/api/conversations/*/messages*", (route) =>
      route.fulfill({ json: { items: [], hasMore: false, nextCursor: null } }),
    );

    await page.goto("/");
    await page.getByRole("button", { name: "Conversas", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Carla" })).toBeVisible();

    await page.getByRole("button", { name: "Conexões", exact: true }).click();
    await page.getByRole("button", { name: "Conversar", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Bruno", level: 2 }),
    ).toBeVisible();

    const sent = page.waitForRequest(
      (request) =>
        request.method() === "POST" && request.url().endsWith("/messages"),
    );
    await page.getByRole("textbox", { name: "Mensagem" }).fill("Olá, Bruno!");
    await page.getByRole("button", { name: "Enviar mensagem" }).click();
    expect((await sent).url()).toContain(
      `/conversations/${selectedId}/messages`,
    );
  });
}
