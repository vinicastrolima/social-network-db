import { createHash, randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { trace } from "@opentelemetry/api";
import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { ObjectId } from "mongodb";
import { Counter, Histogram, Registry } from "prom-client";
import { checkPassword, fail, hashPassword, id, pair, text } from "./domain.js";

const publicUser =
  "id, username, full_name, bio, city, job_title, company, education";
const digest = (t) => createHash("sha256").update(t).digest("hex");
function objectId(v) {
  if (typeof v !== "string" || !/^[a-f\d]{24}$/i.test(v))
    fail(400, "Identificador de conversa inválido.");
  return new ObjectId(v);
}
export function createApp(
  { pool, chat },
  { origin = process.env.APP_ORIGIN || "http://localhost:3000" } = {},
) {
  const app = express();
  const registry = new Registry();
  const requests = new Counter({
    name: "devconnect_http_requests_total",
    help: "HTTP responses",
    labelNames: ["method", "route", "status"],
    registers: [registry],
  });
  const latency = new Histogram({
    name: "devconnect_http_duration_seconds",
    help: "HTTP latency",
    labelNames: ["route"],
    registers: [registry],
  });
  app.use((req, res, next) => {
    const span = trace.getTracer("devconnect").startSpan("http.request");
    const start = performance.now();
    res.on("finish", () => {
      const route = req.route?.path || "unmatched";
      requests.inc({
        method: req.method,
        route,
        status: String(res.statusCode),
      });
      latency.observe({ route }, (performance.now() - start) / 1000);
      span.setAttributes({
        "http.route": route,
        "http.response.status_code": res.statusCode,
      });
      span.end();
    });
    next();
  });
  app.get("/metrics", async (req, res) => {
    if (
      !process.env.METRICS_TOKEN ||
      req.headers.authorization !== `Bearer ${process.env.METRICS_TOKEN}`
    )
      return res.sendStatus(404);
    res.type(registry.contentType).send(await registry.metrics());
  });
  app.use(helmet());
  app.use(express.json({ limit: "32kb" }));
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.setHeader("X-Request-Id", req.requestId);
    const started = performance.now();
    res.on("finish", () =>
      console.log(
        JSON.stringify({
          event: "http",
          requestId: req.requestId,
          method: req.method,
          route: req.route?.path || "unmatched",
          status: res.statusCode,
          durationMs: Math.round(performance.now() - started),
        }),
      ),
    );
    next();
  });
  app.get("/health", async (_req, res) => {
    await pool.query("SELECT 1");
    await chat.command({ ping: 1 });
    res.json({ status: "ok" });
  });
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 300,
      standardHeaders: "draft-7",
      legacyHeaders: false,
    }),
  );
  app.use("/api", (req, _res, next) => {
    if (
      !["GET", "HEAD"].includes(req.method) &&
      (req.headers.origin !== origin || req.headers["x-devconnect"] !== "1")
    )
      fail(403, "Origem da requisição não autorizada.");
    next();
  });
  app.use(
    "/api/auth",
    rateLimit({
      windowMs: 60000,
      limit: 20,
      standardHeaders: "draft-7",
      legacyHeaders: false,
    }),
  );
  async function session(res, user) {
    const token = randomBytes(32).toString("hex");
    await pool.query(
      "INSERT INTO app_sessions VALUES ($1,$2,NOW()+INTERVAL '7 days')",
      [digest(token), user.id],
    );
    res.cookie("session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: origin.startsWith("https:"),
      maxAge: 604800000,
      path: "/",
    });
    return user;
  }
  app.post("/api/auth/register", async (req, res) => {
    const username = text(req.body.username, 50);
    if (!/^[A-Za-z0-9_.]{3,50}$/.test(username)) fail(400, "Usuário inválido.");
    const email = text(req.body.email, 255).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      fail(400, "E-mail inválido.");
    const password = await hashPassword(req.body.password);
    const { rows } = await pool.query(
      `INSERT INTO users(username,email,password_hash,full_name) VALUES($1,$2,$3,$4) RETURNING ${publicUser}`,
      [username, email, password, text(req.body.full_name, 150)],
    );
    res.status(201).json(await session(res, rows[0]));
  });
  app.post("/api/auth/login", async (req, res) => {
    const { rows } = await pool.query("SELECT * FROM users WHERE email=$1", [
      text(req.body.email, 255).toLowerCase(),
    ]);
    if (
      !rows[0] ||
      !(await checkPassword(req.body.password, rows[0].password_hash))
    )
      fail(401, "E-mail ou senha inválidos.");
    const user = (
      await pool.query(`SELECT ${publicUser} FROM users WHERE id=$1`, [
        rows[0].id,
      ])
    ).rows[0];
    res.json(await session(res, user));
  });
  app.use("/api", async (req, _res, next) => {
    const token = req.headers.cookie
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("session="))
      ?.slice(8);
    if (!token) fail(401, "Entre na sua conta.");
    req.tokenHash = digest(token);
    const { rows } = await pool.query(
      "SELECT user_id FROM app_sessions WHERE token_hash=$1 AND expires_at>NOW()",
      [req.tokenHash],
    );
    if (!rows[0]) fail(401, "Sessão expirada. Entre novamente.");
    req.uid = rows[0].user_id;
    next();
  });
  app.post("/api/logout", async (req, res) => {
    await pool.query("DELETE FROM app_sessions WHERE token_hash=$1", [
      req.tokenHash,
    ]);
    res.clearCookie("session", { path: "/" });
    res.json({ ok: true });
  });
  app.get("/api/me", async (req, res) => {
    res.json(
      (
        await pool.query(`SELECT ${publicUser} FROM users WHERE id=$1`, [
          req.uid,
        ])
      ).rows[0],
    );
  });
  app.put("/api/me", async (req, res) => {
    const values = [
      "full_name",
      "bio",
      "city",
      "job_title",
      "company",
      "education",
    ].map((key, i) =>
      i === 0
        ? text(req.body[key], 150)
        : String(req.body[key] || "").slice(0, i === 1 ? 1000 : 100),
    );
    res.json(
      (
        await pool.query(
          `UPDATE users SET full_name=$1,bio=$2,city=$3,job_title=$4,company=$5,education=$6 WHERE id=$7 RETURNING ${publicUser}`,
          [...values, req.uid],
        )
      ).rows[0],
    );
  });
  app.get("/api/users", async (req, res) => {
    res.json(
      (
        await pool.query(
          `SELECT ${publicUser} FROM users WHERE id<>$1 AND (full_name ILIKE $2 OR username ILIKE $2) ORDER BY full_name LIMIT 50`,
          [req.uid, `%${String(req.query.q || "").slice(0, 100)}%`],
        )
      ).rows,
    );
  });
  app.get("/api/friends", async (req, res) => {
    res.json(
      (
        await pool.query(
          "SELECT f.*, u.full_name,u.username FROM friends f JOIN users u ON u.id=CASE WHEN f.requester_id=$1 THEN f.addressee_id ELSE f.requester_id END WHERE requester_id=$1 OR addressee_id=$1 ORDER BY f.updated_at DESC",
          [req.uid],
        )
      ).rows,
    );
  });
  app.post("/api/friends", async (req, res) => {
    const other = id(req.body.userId);
    pair(req.uid, other);
    res
      .status(201)
      .json(
        (
          await pool.query(
            "INSERT INTO friends(requester_id,addressee_id) VALUES($1,$2) RETURNING *",
            [req.uid, other],
          )
        ).rows[0],
      );
  });
  app.patch("/api/friends/:id", async (req, res) => {
    const status = req.body.status;
    if (!["aceita", "recusada", "bloqueada"].includes(status))
      fail(400, "Status inválido.");
    const { rows } = await pool.query(
      `UPDATE friends SET status=$1 WHERE id=$2 AND ((status='pendente' AND addressee_id=$3 AND $1 IN ('aceita','recusada')) OR ($1='bloqueada' AND (requester_id=$3 OR addressee_id=$3))) RETURNING *`,
      [status, id(req.params.id), req.uid],
    );
    if (!rows[0]) fail(403, "Você não pode alterar este pedido.");
    res.json(rows[0]);
  });
  async function accepted(a, b) {
    return (
      (
        await pool.query(
          `SELECT id FROM friends WHERE status='aceita' AND ((requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1))`,
          [a, b],
        )
      ).rowCount > 0
    );
  }
  async function conversation(req, writing = false) {
    const c = await chat
      .collection("conversations")
      .findOne({ _id: objectId(req.params.id), participantIds: req.uid });
    if (!c) fail(404, "Conversa não encontrada.");
    if (writing && !(await accepted(...c.participantIds)))
      fail(403, "É necessário ter uma amizade aceita para enviar.");
    return c;
  }
  app.post("/api/conversations", async (req, res) => {
    const other = id(req.body.userId);
    const key = pair(req.uid, other);
    if (!(await accepted(req.uid, other)))
      fail(403, "Aceite a amizade antes de conversar.");
    const collection = chat.collection("conversations");
    try {
      await collection.updateOne(
        { pairKey: key },
        {
          $setOnInsert: {
            pairKey: key,
            participantIds: key.split(":"),
            createdAt: new Date(),
          },
        },
        { upsert: true },
      );
    } catch (e) {
      if (e.code !== 11000) throw e;
    }
    res.json(await collection.findOne({ pairKey: key }));
  });
  app.get("/api/conversations", async (req, res) => {
    const list = await chat
      .collection("conversations")
      .find({ participantIds: req.uid })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
    for (const c of list) {
      c.peer = (
        await pool.query(`SELECT ${publicUser} FROM users WHERE id=$1`, [
          c.participantIds.find((x) => x !== req.uid),
        ])
      ).rows[0];
    }
    res.json(list);
  });
  app.get("/api/conversations/:id/messages", async (req, res) => {
    const c = await conversation(req);
    const limit = Number(req.query.limit || 50);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      fail(400, "Limite inválido.");
    const filter = { conversationId: c._id };
    if (req.query.cursor) {
      let cursor;
      try {
        cursor = JSON.parse(
          Buffer.from(req.query.cursor, "base64url").toString(),
        );
      } catch {
        fail(400, "Cursor inválido.");
      }
      const date = new Date(cursor.date);
      if (Number.isNaN(date.getTime())) fail(400, "Cursor inválido.");
      const oid = objectId(cursor.id);
      filter.$or = [
        { createdAt: { $gt: date } },
        { createdAt: date, _id: { $gt: oid } },
      ];
    }
    const docs = await chat
      .collection("messages")
      .find(filter)
      .sort({ createdAt: 1, _id: 1 })
      .limit(limit + 1)
      .toArray();
    const hasMore = docs.length > limit;
    const items = docs.slice(0, limit);
    const last = items.at(-1);
    res.json({
      items,
      hasMore,
      nextCursor: last
        ? Buffer.from(
            JSON.stringify({ date: last.createdAt, id: last._id }),
          ).toString("base64url")
        : req.query.cursor || null,
    });
  });
  app.post("/api/conversations/:id/messages", async (req, res) => {
    const c = await conversation(req, true);
    const body = text(req.body.body);
    const clientMessageId = text(req.body.clientMessageId, 100);
    const collection = chat.collection("messages");
    const filter = {
      conversationId: c._id,
      senderId: req.uid,
      clientMessageId,
    };
    try {
      await collection.insertOne({ ...filter, body, createdAt: new Date() });
    } catch (e) {
      if (e.code !== 11000) throw e;
    }
    const message = await collection.findOne(filter);
    if (message.body !== body)
      fail(409, "Chave de envio já usada com outro conteúdo.");
    res.status(201).json(message);
  });
  app.get("/api/posts", async (req, res) => {
    res.json(
      (
        await pool.query(
          `SELECT p.*,u.full_name,u.username,(SELECT count(*) FROM likes l WHERE l.post_id=p.id) AS likes, EXISTS(SELECT 1 FROM likes l WHERE l.post_id=p.id AND l.user_id=$1) AS liked FROM posts p JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT 50`,
          [req.uid],
        )
      ).rows,
    );
  });
  app.post("/api/posts", async (req, res) => {
    const link = req.body.link_url || null;
    if (link && !/^https?:\/\/[^\s]+$/.test(link)) fail(400, "Link inválido.");
    res
      .status(201)
      .json(
        (
          await pool.query(
            "INSERT INTO posts(user_id,content,link_url,group_id) VALUES($1,$2,$3,$4) RETURNING *",
            [
              req.uid,
              text(req.body.content),
              link,
              req.body.group_id ? id(req.body.group_id) : null,
            ],
          )
        ).rows[0],
      );
  });
  app.put("/api/posts/:id", async (req, res) => {
    const r = await pool.query(
      "UPDATE posts SET content=$1 WHERE id=$2 AND user_id=$3 RETURNING *",
      [text(req.body.content), id(req.params.id), req.uid],
    );
    if (!r.rowCount) fail(403, "Somente o autor pode editar.");
    res.json(r.rows[0]);
  });
  app.post("/api/posts/:id/like", async (req, res) => {
    await pool.query(
      "INSERT INTO likes(user_id,post_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [req.uid, id(req.params.id)],
    );
    res.json({ ok: true });
  });
  app.get("/api/posts/:id/comments", async (req, res) => {
    res.json(
      (
        await pool.query(
          "SELECT c.*,u.full_name FROM comments c JOIN users u ON u.id=c.user_id WHERE post_id=$1 ORDER BY c.created_at,c.id LIMIT 100",
          [id(req.params.id)],
        )
      ).rows,
    );
  });
  app.post("/api/posts/:id/comments", async (req, res) => {
    res
      .status(201)
      .json(
        (
          await pool.query(
            "INSERT INTO comments(post_id,user_id,content) VALUES($1,$2,$3) RETURNING *",
            [id(req.params.id), req.uid, text(req.body.content)],
          )
        ).rows[0],
      );
  });
  app.post("/api/users/:id/follow", async (req, res) => {
    pair(req.uid, id(req.params.id));
    await pool.query(
      "INSERT INTO follows VALUES($1,$2) ON CONFLICT DO NOTHING",
      [req.uid, req.params.id],
    );
    res.json({ ok: true });
  });
  app.get("/api/groups", async (req, res) => {
    res.json(
      (
        await pool.query(
          "SELECT g.*,EXISTS(SELECT 1 FROM group_members m WHERE m.group_id=g.id AND m.user_id=$1) AS joined FROM groups g ORDER BY g.created_at DESC LIMIT 50",
          [req.uid],
        )
      ).rows,
    );
  });
  app.post("/api/groups", async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const g = (
        await client.query(
          "INSERT INTO groups(name,topic,description,created_by) VALUES($1,$2,$3,$4) RETURNING *",
          [
            text(req.body.name, 120),
            text(req.body.topic, 80),
            text(req.body.description, 1000),
            req.uid,
          ],
        )
      ).rows[0];
      await client.query(
        "INSERT INTO group_members(group_id,user_id,role) VALUES($1,$2,'admin')",
        [g.id, req.uid],
      );
      await client.query("COMMIT");
      res.status(201).json(g);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  });
  app.post("/api/groups/:id/join", async (req, res) => {
    await pool.query(
      "INSERT INTO group_members(group_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [id(req.params.id), req.uid],
    );
    res.json({ ok: true });
  });
  app.get("/api/challenges", async (req, res) => {
    res.json(
      (
        await pool.query(
          "SELECT c.*, EXISTS(SELECT 1 FROM challenge_participants p WHERE p.challenge_id=c.id AND p.user_id=$1) AS joined FROM challenges c ORDER BY created_at DESC LIMIT 50",
          [req.uid],
        )
      ).rows,
    );
  });
  app.post("/api/challenges", async (req, res) => {
    res
      .status(201)
      .json(
        (
          await pool.query(
            `INSERT INTO challenges(title,description,statement,difficulty,points,created_by) VALUES($1,$2,$3,'medio',100,$4) RETURNING *`,
            [
              text(req.body.title, 150),
              text(req.body.description),
              text(req.body.statement),
              req.uid,
            ],
          )
        ).rows[0],
      );
  });
  app.post("/api/challenges/:id/join", async (req, res) => {
    await pool.query(
      "INSERT INTO challenge_participants(challenge_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [id(req.params.id), req.uid],
    );
    res.json({ ok: true });
  });
  app.post("/api/challenges/:id/solutions", async (req, res) => {
    res
      .status(201)
      .json(
        (
          await pool.query(
            "INSERT INTO solutions(challenge_id,user_id,source_code,language) VALUES($1,$2,$3,$4) RETURNING *",
            [
              id(req.params.id),
              req.uid,
              text(req.body.source_code, 15000),
              text(req.body.language, 40),
            ],
          )
        ).rows[0],
      );
  });
  app.get("/api/ranking", async (_req, res) => {
    res.json(
      (await pool.query("SELECT * FROM vw_ranking ORDER BY position LIMIT 100"))
        .rows,
    );
  });
  app.get("/api/skills", async (req, res) => {
    res.json(
      (
        await pool.query(
          "SELECT s.name,us.proficiency_level FROM user_skills us JOIN skills s ON s.id=us.skill_id WHERE us.user_id=$1 ORDER BY s.name",
          [req.uid],
        )
      ).rows,
    );
  });
  app.post("/api/skills", async (req, res) => {
    const name = text(req.body.name, 80);
    const level = req.body.proficiency_level;
    if (
      !["iniciante", "intermediario", "avancado", "especialista"].includes(
        level,
      )
    )
      fail(400, "Nível inválido.");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const skill = (
        await client.query(
          `INSERT INTO skills(name,category) VALUES($1,'outra') ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
          [name],
        )
      ).rows[0];
      await client.query(
        "INSERT INTO user_skills(user_id,skill_id,proficiency_level) VALUES($1,$2,$3) ON CONFLICT(user_id,skill_id) DO UPDATE SET proficiency_level=EXCLUDED.proficiency_level",
        [req.uid, skill.id, level],
      );
      await client.query("COMMIT");
      res.json({ ok: true });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  });
  app.get("/api/challenges/:id/solutions", async (req, res) => {
    res.json(
      (
        await pool.query(
          "SELECT s.*,u.full_name FROM solutions s JOIN challenges c ON c.id=s.challenge_id JOIN users u ON u.id=s.user_id WHERE c.id=$1 AND (c.created_by=$2 OR s.user_id=$2) ORDER BY s.submitted_at DESC",
          [id(req.params.id), req.uid],
        )
      ).rows,
    );
  });
  app.patch("/api/solutions/:id", async (req, res) => {
    if (!["aceita", "rejeitada"].includes(req.body.status))
      fail(400, "Status inválido.");
    const r = await pool.query(
      "UPDATE solutions s SET status=$1 FROM challenges c WHERE s.id=$2 AND c.id=s.challenge_id AND c.created_by=$3 AND s.user_id<>$3 RETURNING s.*",
      [req.body.status, id(req.params.id), req.uid],
    );
    if (!r.rowCount)
      fail(
        403,
        "Somente o criador do desafio pode avaliar soluções de outras pessoas.",
      );
    res.json(r.rows[0]);
  });
  app.use("/api", (_req, _res) => fail(404, "Rota não encontrada."));
  app.use(express.static(fileURLToPath(new URL("../public", import.meta.url))));
  app.use((err, req, res, _next) => {
    const status =
      err.status ||
      (["23505", "P0001"].includes(err.code)
        ? 409
        : ["23503", "23514", "22P02", 121].includes(err.code)
          ? 400
          : 503);
    res.status(status).json({
      error: err.status
        ? err.message
        : status === 409
          ? "Registro já existe ou operação não permitida."
          : status === 400
            ? "Dados inválidos para esta operação."
            : "Serviço indisponível. Tente novamente.",
      requestId: req.requestId,
    });
  });
  return app;
}
