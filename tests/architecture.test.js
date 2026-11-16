import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("domínio não depende de HTTP/bancos; frontend não conhece credenciais", async () => {
  const domain = await readFile(
    new URL("../server/domain.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(domain, /from ['"](?:express|mongodb|pg)['"]/);
  for (const file of ["app.js", "chat.js"]) {
    const source = await readFile(
      new URL(`../public/${file}`, import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(
      source,
      /POSTGRES_PASSWORD|MONGO_PASSWORD|password_hash|mongodb:\/\//,
    );
  }
});
