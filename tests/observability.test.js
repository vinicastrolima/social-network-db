import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../server/app.js";

test("health sinaliza falha real; métricas exigem token e não expõem payloads", async () => {
  const old = process.env.METRICS_TOKEN;
  process.env.METRICS_TOKEN = "test-metrics-token";
  let down = false;
  const app = createApp({
    pool: {
      query: async () => {
        if (down) throw new Error("private-connection-secret");
      },
    },
    chat: { command: async () => ({ ok: 1 }) },
  });
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://localhost:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.equal((await fetch(`${base}/metrics`)).status, 404);
    const metrics = await fetch(`${base}/metrics`, {
      headers: { Authorization: "Bearer test-metrics-token" },
    });
    assert.equal(metrics.status, 200);
    assert.match(await metrics.text(), /devconnect_http_requests_total/);
    down = true;
    const result = await fetch(`${base}/health`);
    assert.equal(result.status, 503);
    assert.doesNotMatch(await result.text(), /private-connection-secret/);
  } finally {
    await new Promise((r) => server.close(r));
    if (old === undefined) delete process.env.METRICS_TOKEN;
    else process.env.METRICS_TOKEN = old;
  }
});
