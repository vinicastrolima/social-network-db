import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createApp } from "../../server/app.js";
import { connect } from "../../server/db.js";

test("fluxo real: amizade, chat NoSQL, autorização, paginação, idempotência e persistência", async () => {
  const db = await connect();
  const server = createApp(db).listen(0);
  await new Promise((r) => server.once("listening", r));
  const url = `http://localhost:${server.address().port}`;
  const suffix = Date.now();
  const users = [];
  let cid;
  async function call(cookie, path, method = "GET", body, extra = {}) {
    const r = await fetch(`${url}/api${path}`, {
      method,
      headers: {
        Origin: "http://localhost:3000",
        "X-Devconnect": "1",
        "Content-Type": "application/json",
        Cookie: cookie || "",
        ...extra,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: r.status,
      body: await r.json(),
      cookie: r.headers.get("set-cookie")?.split(";")[0],
    };
  }
  try {
    for (let i = 0; i < 3; i++) {
      const r = await call("", "/auth/register", "POST", {
        username: `test${suffix}_${i}`,
        email: `test${suffix}_${i}@example.test`,
        full_name: `Teste ${i}`,
        password: "testing-password-123",
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      users.push(r);
    }
    const [a, b, c] = users;
    assert.equal((await call("", "/me")).status, 401);
    assert.equal(
      (await call(a.cookie, "/conversations", "POST", { userId: b.body.id }))
        .status,
      403,
    );
    const f = await call(a.cookie, "/friends", "POST", { userId: b.body.id });
    assert.equal(f.status, 201);
    assert.equal(
      (
        await call(a.cookie, `/friends/${f.body.id}`, "PATCH", {
          status: "aceita",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await call(b.cookie, `/friends/${f.body.id}`, "PATCH", {
          status: "aceita",
        })
      ).status,
      200,
    );
    const convo = await call(a.cookie, "/conversations", "POST", {
      userId: b.body.id,
    });
    assert.equal(convo.status, 200);
    cid = convo.body._id;
    assert.equal(
      (await call(b.cookie, "/conversations", "POST", { userId: a.body.id }))
        .body._id,
      cid,
    );
    assert.equal(
      (await call(c.cookie, `/conversations/${cid}/messages`)).status,
      404,
    );
    assert.equal(
      (
        await call(c.cookie, `/conversations/${cid}/messages`, "POST", {
          body: "intruso",
          clientMessageId: "x",
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await call(a.cookie, `/conversations/${cid}/messages`, "POST", {
          body: " ",
          clientMessageId: "x",
        })
      ).status,
      400,
    );
    const payload = {
      body: "Mensagem persistida",
      clientMessageId: randomUUID(),
      senderId: c.body.id,
    };
    const msg = await call(
      a.cookie,
      `/conversations/${cid}/messages`,
      "POST",
      payload,
    );
    assert.equal(msg.status, 201);
    assert.equal(msg.body.senderId, a.body.id);
    assert.equal(
      (await call(a.cookie, `/conversations/${cid}/messages`, "POST", payload))
        .body._id,
      msg.body._id,
    );
    assert.equal(
      (
        await call(a.cookie, `/conversations/${cid}/messages`, "POST", {
          ...payload,
          body: "outro",
        })
      ).status,
      409,
    );
    for (let i = 0; i < 3; i++)
      assert.equal(
        (
          await call(b.cookie, `/conversations/${cid}/messages`, "POST", {
            body: `Resposta ${i}`,
            clientMessageId: randomUUID(),
          })
        ).status,
        201,
      );
    const { ObjectId } = await import("mongodb");
    await db.chat
      .collection("messages")
      .updateMany(
        { conversationId: new ObjectId(cid) },
        { $set: { createdAt: new Date("2026-01-01T00:00:00Z") } },
      );
    const page = await call(b.cookie, `/conversations/${cid}/messages?limit=2`);
    assert.equal(page.body.items.length, 2);
    assert.ok(page.body.hasMore);
    const page2 = await call(
      b.cookie,
      `/conversations/${cid}/messages?limit=2&cursor=${page.body.nextCursor}`,
    );
    assert.equal(page2.body.items.length, 2);
    assert.equal(
      new Set([...page.body.items, ...page2.body.items].map((m) => m._id)).size,
      4,
    );
    assert.equal(
      (await call(b.cookie, `/conversations/${cid}/messages?cursor=bad`))
        .status,
      400,
    );
    await call(a.cookie, "/logout", "POST");
    assert.equal((await call(a.cookie, "/me")).status, 401);
    const login = await call("", "/auth/login", "POST", {
      email: `test${suffix}_0@example.test`,
      password: "testing-password-123",
    });
    a.cookie = login.cookie;
    assert.equal(
      (await call(a.cookie, `/conversations/${cid}/messages`)).body.items
        .length,
      4,
    );
    assert.equal(
      (
        await call(
          a.cookie,
          "/posts",
          "POST",
          { content: "Hello" },
          { Origin: "https://evil.test" },
        )
      ).status,
      403,
    );
    const post = await call(a.cookie, "/posts", "POST", {
      content: "Teste publicação",
    });
    assert.equal(post.status, 201);
    assert.equal(
      (
        await call(b.cookie, `/posts/${post.body.id}`, "PUT", {
          content: "alteração indevida",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await call(b.cookie, `/posts/${post.body.id}/comments`, "POST", {
          content: "Comentário",
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await call(b.cookie, `/friends/${f.body.id}`, "PATCH", {
          status: "bloqueada",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await call(a.cookie, `/conversations/${cid}/messages`, "POST", {
          body: "bloqueado",
          clientMessageId: randomUUID(),
        })
      ).status,
      403,
    );
    assert.equal(
      (await call(a.cookie, `/conversations/${cid}/messages`)).status,
      200,
    );
    assert.equal(
      (
        await db.pool.query(
          "SELECT count(*) FROM messages WHERE sender_id=ANY($1::bigint[])",
          [users.map((u) => u.body.id)],
        )
      ).rows[0].count,
      "0",
    );
    const group = await call(a.cookie, "/groups", "POST", {
      name: `grupo${suffix}`,
      topic: "SQL",
      description: "Teste de integração",
    });
    assert.equal(group.status, 201);
    assert.equal(
      (
        await call(b.cookie, "/posts", "POST", {
          content: "sem acesso",
          group_id: group.body.id,
        })
      ).status,
      409,
    );
    assert.equal(
      (await call(b.cookie, `/groups/${group.body.id}/join`, "POST")).status,
      200,
    );
    assert.equal(
      (
        await call(b.cookie, "/posts", "POST", {
          content: "com acesso",
          group_id: group.body.id,
        })
      ).status,
      201,
    );
    const challenge = await call(a.cookie, "/challenges", "POST", {
      title: `desafio${suffix}`,
      description: "Praticar SQL",
      statement: "SELECT 1",
    });
    assert.equal(challenge.status, 201);
    await call(b.cookie, `/challenges/${challenge.body.id}/join`, "POST");
    const solution = await call(
      b.cookie,
      `/challenges/${challenge.body.id}/solutions`,
      "POST",
      { source_code: "SELECT 1;", language: "sql" },
    );
    assert.equal(solution.status, 201);
    assert.equal(
      (
        await call(c.cookie, `/solutions/${solution.body.id}`, "PATCH", {
          status: "aceita",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await call(a.cookie, `/solutions/${solution.body.id}`, "PATCH", {
          status: "aceita",
        })
      ).status,
      200,
    );
    const ranking = await call(b.cookie, "/ranking");
    assert.equal(
      ranking.body.find((r) => r.user_id === b.body.id).total_points,
      115,
    );
    assert.equal(
      (
        await call(a.cookie, "/skills", "POST", {
          name: `SQL${suffix}`,
          proficiency_level: "intermediario",
        })
      ).status,
      200,
    );
    assert.ok(
      (await call(a.cookie, "/skills")).body.some(
        (s) => s.name === `SQL${suffix}`,
      ),
    );
    await db.pool.query("DELETE FROM groups WHERE id=$1", [group.body.id]);
    await db.pool.query("DELETE FROM challenges WHERE id=$1", [
      challenge.body.id,
    ]);
    await db.pool.query("DELETE FROM skills WHERE name=$1", [`SQL${suffix}`]);
  } finally {
    // Remove somente fixtures criadas por este teste, nunca o esquema ou dados da aplicação.
    if (cid) {
      const { ObjectId } = await import("mongodb");
      await db.chat
        .collection("messages")
        .deleteMany({ conversationId: new ObjectId(cid) });
      await db.chat
        .collection("conversations")
        .deleteOne({ _id: new ObjectId(cid) });
    }
    for (const u of users)
      await db.pool.query("DELETE FROM users WHERE id=$1", [u.body.id]);
    await new Promise((r) => server.close(r));
    await db.close();
  }
});
