const root = document.querySelector("#app");
let me = null;
let screen = "feed";
let timer;
let version = 0;
export const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const date = (v) => new Date(v).toLocaleString("pt-BR");
const avatar = (name) =>
  `<span class="avatar" aria-hidden="true">${esc((name || "?").slice(0, 2).toUpperCase())}</span>`;
let noticeTimer;
export function notice(message, error = false) {
  const el = document.querySelector("#notice");
  el.textContent = message;
  el.className = `show ${error ? "error" : ""}`;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    el.className = "";
  }, 5000);
}
export async function api(path, method = "GET", body) {
  const r = await fetch(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Devconnect": "1" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({ error: "Serviço indisponível." }));
  if (!r.ok) throw new Error(data.error || "Não foi possível concluir.");
  return data;
}
function field(label, name, type = "text", value = "", required = true) {
  return `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${required ? "required" : ""} ${type === "password" ? 'minlength="10" maxlength="128" autocomplete="current-password"' : ""}></label>`;
}
function area(label, name, value = "") {
  return `<label>${label}<textarea name="${name}" maxlength="4000" required>${esc(value)}</textarea></label>`;
}
export function form(id, handler) {
  document.querySelector(`#${id}`)?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const b =
      f.querySelector("button[type=submit]") || f.querySelector("button");
    if (b.disabled) return;
    b.disabled = true;
    f.setAttribute("aria-busy", "true");
    const old = b.textContent;
    b.textContent = "Aguarde…";
    try {
      await handler(Object.fromEntries(new FormData(f)), f);
    } catch (err) {
      notice(err.message, true);
    } finally {
      b.disabled = false;
      b.textContent = old;
      f.removeAttribute("aria-busy");
    }
  });
}
export function action(selector, fn) {
  document.querySelectorAll(selector).forEach((el) => {
    el.addEventListener("click", async () => {
      el.disabled = true;
      try {
        await fn(el);
      } catch (e) {
        notice(e.message, true);
      } finally {
        el.disabled = false;
      }
    });
  });
}
function auth(register = false) {
  clearInterval(timer);
  root.innerHTML = `<div class="auth"><section class="intro"><p class="brand">dev<span>connect</span></p><h1>Conhecimento cresce em companhia.</h1><p>Compartilhe suas descobertas, encontre sua comunidade e continue a conversa com quem está construindo junto.</p></section><main class="auth-panel" id="content"><div><h2>${register ? "Faça parte da comunidade" : "Bom ter você de volta."}</h2><p class="muted">${register ? "Crie seu perfil e comece uma conexão." : "Entre para acompanhar suas conexões."}</p><form id="auth">${register ? field("Nome completo", "full_name") + field("Nome de usuário", "username") : ""}${field("E-mail", "email", "email")}${field("Senha", "password", "password")}<button type="submit">${register ? "Criar conta" : "Entrar"}</button></form><button class="secondary" id="toggle">${register ? "Já tenho uma conta" : "Criar minha conta"}</button></div></main></div>`;
  document.querySelector("#toggle").onclick = () => auth(!register);
  form("auth", async (data) => {
    me = await api(`/auth/${register ? "register" : "login"}`, "POST", data);
    shell();
  });
}
function shell() {
  root.innerHTML = `<div class="shell"><aside class="sidebar"><div class="brand">dev<span>connect</span></div><nav aria-label="Navegação principal">${[
    ["feed", "Comunidade"],
    ["people", "Conexões"],
    ["chat", "Conversas"],
    ["groups", "Grupos"],
    ["challenges", "Desafios"],
    ["ranking", "Ranking"],
    ["profile", "Meu perfil"],
  ]
    .map(([key, label]) => `<button data-page="${key}">${label}</button>`)
    .join(
      "",
    )}</nav><footer><div>${esc(me.full_name)}<br><small>@${esc(me.username)}</small></div><button id="logout" class="secondary">Sair</button></footer></aside><main class="workspace"><header class="topbar"><span>Seu espaço para construir junto</span><span class="pill">DevConnect</span></header><div id="content" tabindex="-1"></div></main></div>`;
  action("[data-page]", (el) => navigate(el.dataset.page));
  action("#logout", async () => {
    await api("/logout", "POST");
    me = null;
    auth();
  });
  navigate(screen);
}
export async function navigate(page, conversation) {
  screen = page;
  clearInterval(timer);
  const v = ++version;
  document.querySelectorAll("[data-page]").forEach((el) => {
    el.setAttribute(
      "aria-current",
      el.dataset.page === page ? "page" : "false",
    );
  });
  const previous = document.querySelector("#content");
  const content = document.createElement("div");
  content.id = "content";
  content.tabIndex = -1;
  previous.replaceWith(content);
  content.innerHTML =
    '<div role="status" class="loading">Carregando…<div class="skeleton"></div><div class="skeleton"></div></div>';
  content.classList.add("loading-view");
  try {
    if (page === "feed") await feed(content);
    if (page === "people") await people(content);
    if (page === "profile") await profile(content);
    if (page === "chat") {
      const module = await import("./chat.js");
      await module.chatView(
        content,
        me,
        api,
        esc,
        form,
        action,
        notice,
        (callback) => {
          timer = setInterval(callback, 3000);
        },
        () => version === v,
        conversation,
      );
    }
    if (["groups", "challenges", "ranking"].includes(page))
      await community(content, page);
  } catch (e) {
    if (v === version)
      content.innerHTML = `<div class="panel error-text">${esc(e.message)} <button id="retry">Tentar novamente</button></div>`;
    document
      .querySelector("#retry")
      ?.addEventListener("click", () => navigate(page, conversation));
  } finally {
    content.classList.remove("loading-view");
  }
}
async function feed(el) {
  const posts = await api("/posts");
  if (!el.isConnected) return;
  el.innerHTML = `<h1>Comunidade</h1><p class="muted">O que você está aprendendo hoje?</p><form id="publish" class="panel">${area("Compartilhe uma descoberta", "content")}${field("Link (opcional)", "link_url", "url", "", false)}<button type="submit">Publicar</button></form><section>${posts.map((p) => `<article class="panel post"><header>${avatar(p.full_name)}<div><strong>${esc(p.full_name)}</strong><br><small>${date(p.created_at)}</small></div></header><p>${esc(p.content)}</p>${p.link_url ? `<a href="${esc(p.link_url)}" target="_blank" rel="noopener noreferrer">Abrir link compartilhado</a>` : ""}<footer><button class="secondary" data-like="${p.id}" ${p.liked ? "disabled" : ""}>${p.liked ? "Curtido" : "Curtir"} (${p.likes})</button> <button class="secondary" data-comments="${p.id}">Comentários</button>${p.user_id === me.id ? `<details><summary>Editar publicação</summary><form id="edit-${p.id}">${area("Novo texto", "content", p.content)}<button>Salvar publicação</button></form></details>` : ""}<div id="comments-${p.id}"></div></footer></article>`).join("") || '<div class="empty">Ainda não há publicações. Compartilhe a primeira descoberta.</div>'}</section>`;
  form("publish", async (data) => {
    await api("/posts", "POST", data);
    notice("Publicação criada.");
    await navigate("feed");
  });
  action("[data-like]", async (b) => {
    await api(`/posts/${b.dataset.like}/like`, "POST");
    await navigate("feed");
  });
  for (const p of posts)
    form(`edit-${p.id}`, async (data) => {
      await api(`/posts/${p.id}`, "PUT", data);
      await navigate("feed");
    });
  action("[data-comments]", async (b) => {
    const id = b.dataset.comments;
    const comments = await api(`/posts/${id}/comments`);
    document.querySelector(`#comments-${id}`).innerHTML =
      comments
        .map(
          (c) =>
            `<p><strong>${esc(c.full_name)}</strong>: ${esc(c.content)}</p>`,
        )
        .join("") +
      `<form id="comment-${id}">${area("Seu comentário", "content")}<button>Comentar</button></form>`;
    form(`comment-${id}`, async (data) => {
      await api(`/posts/${id}/comments`, "POST", data);
      notice("Comentário publicado.");
      b.click();
    });
  });
}
async function people(el, q = "") {
  const [users, friends] = await Promise.all([
    api(`/users?q=${encodeURIComponent(q)}`),
    api("/friends"),
  ]);
  el.innerHTML = `<h1>Conexões</h1><p class="muted">Encontre pessoas, aceite uma amizade e comece uma conversa.</p><form id="search" class="search">${field("Buscar nome ou usuário", "q", "search", q, false)}<button>Buscar</button></form><h2>Pedidos e amizades</h2><div class="grid">${friends.map((f) => `<article class="panel"><h3>${esc(f.full_name)}</h3><small>${esc(f.status)}</small><div class="actions">${f.status === "pendente" && f.addressee_id === me.id ? `<button data-friend="${f.id}" data-status="aceita">Aceitar</button><button class="secondary" data-friend="${f.id}" data-status="recusada">Recusar</button>` : ""}${f.status === "aceita" ? `<button data-chat="${f.requester_id === me.id ? f.addressee_id : f.requester_id}">Conversar</button>` : ""}${f.status !== "bloqueada" ? `<button class="secondary" data-friend="${f.id}" data-status="bloqueada">Bloquear</button>` : ""}</div></article>`).join("") || '<p class="muted">Seus pedidos aparecerão aqui.</p>'}</div><h2>Descubra a comunidade</h2><div class="grid">${users.map((u) => `<article class="panel">${avatar(u.full_name)}<h3>${esc(u.full_name)}</h3><small>@${esc(u.username)}</small><p>${esc(u.job_title || "Novo na comunidade")}</p><div class="actions"><button data-add="${u.id}" ${friends.some((f) => [f.requester_id, f.addressee_id].includes(u.id)) ? "disabled" : ""}>Conectar</button><button class="secondary" data-follow="${u.id}">Seguir</button></div></article>`).join("") || "<p>Nenhuma pessoa encontrada.</p>"}</div>`;
  form("search", (data) => people(el, data.q));
  action("[data-add]", async (b) => {
    await api("/friends", "POST", { userId: b.dataset.add });
    notice("Pedido enviado.");
    await people(el, q);
  });
  action("[data-friend]", async (b) => {
    await api(`/friends/${b.dataset.friend}`, "PATCH", {
      status: b.dataset.status,
    });
    await people(el, q);
  });
  action("[data-chat]", async (b) => {
    const userId = b.dataset.chat;
    const conversation = await api("/conversations", "POST", { userId });
    if (!b.isConnected) return;
    const friend = friends.find(
      (f) => f.requester_id === userId || f.addressee_id === userId,
    );
    await navigate("chat", {
      _id: conversation._id,
      peer: { full_name: friend?.full_name },
    });
  });
  action("[data-follow]", async (b) => {
    await api(`/users/${b.dataset.follow}/follow`, "POST");
    notice("Você está seguindo essa pessoa.");
  });
}
async function profile(el) {
  me = await api("/me");
  if (!el.isConnected) return;
  el.innerHTML = `<h1>Meu perfil</h1><p class="muted">Apresente sua trajetória para a comunidade.</p><form id="profile" class="panel">${field("Nome completo", "full_name", "text", me.full_name)}${["city", "job_title", "company", "education"].map((key, i) => field(["Cidade", "Cargo", "Empresa", "Formação"][i], key, "text", me[key], false)).join("")}${area("Sobre você", "bio", me.bio)}<button>Salvar perfil</button></form>`;
  form("profile", async (data) => {
    me = await api("/me", "PUT", data);
    notice("Perfil atualizado.");
  });
  const skills = await api("/skills");
  el.insertAdjacentHTML(
    "beforeend",
    `<section class="panel"><h2>Habilidades</h2><p>${skills.map((s) => `${esc(s.name)} (${esc(s.proficiency_level)})`).join(", ") || "Adicione as tecnologias com que você trabalha."}</p><form id="skills">${field("Tecnologia", "name")}<label>Nível<select name="proficiency_level"><option value="iniciante">Iniciante</option><option value="intermediario">Intermediário</option><option value="avancado">Avançado</option><option value="especialista">Especialista</option></select></label><button>Salvar habilidade</button></form></section>`,
  );
  form("skills", async (data) => {
    await api("/skills", "POST", data);
    await profile(el);
  });
}
async function community(el, page) {
  const data = await api(`/${page}`);
  if (!el.isConnected) return;
  if (page === "ranking") {
    el.innerHTML = `<h1>Ranking</h1><p class="muted">10 pontos por participação, 5 por solução e a nota das soluções aceitas.</p><div class="panel"><table><thead><tr><th>Posição</th><th>Pessoa</th><th>Pontos</th></tr></thead><tbody>${data.map((r) => `<tr><td>${r.position}</td><td>${esc(r.full_name)}</td><td>${r.total_points}</td></tr>`).join("")}</tbody></table></div>`;
    return;
  }
  const groups = page === "groups";
  el.innerHTML = `<h1>${groups ? "Grupos" : "Desafios"}</h1><p class="muted">${groups ? "Encontre sua comunidade de interesse." : "Pratique, compartilhe soluções e aprenda junto."}</p><details class="panel"><summary>${groups ? "Criar grupo" : "Criar desafio"}</summary><form id="create">${field(groups ? "Nome" : "Título", groups ? "name" : "title")}${groups ? field("Tecnologia ou assunto", "topic") : ""}${area("Descrição", "description")}${groups ? "" : area("Enunciado", "statement")}<button>Criar</button></form></details><div class="grid">${data.map((d) => `<article class="panel"><h2>${esc(d.name || d.title)}</h2><p>${esc(d.description)}</p><small>${esc(d.topic || "100 pontos por solução aceita")}</small>${groups ? "" : `<details><summary>Enunciado</summary><p class="challenge-statement">${esc(d.statement)}</p></details>`}<div class="actions"><button data-join="${d.id}" ${d.joined ? "disabled" : ""}>${d.joined ? "Participando" : "Participar"}</button></div>${d.joined ? `<details><summary>${groups ? "Publicar no grupo" : "Enviar solução"}</summary><form id="entry-${d.id}">${groups ? area("Publicação", "content") : area("Código da solução", "source_code") + field("Linguagem", "language")}<button>Enviar</button></form></details>` : ""}</article>`).join("") || '<div class="empty">Crie o primeiro e convide a comunidade.</div>'}</div>`;
  form("create", async (value) => {
    await api(`/${page}`, "POST", value);
    await navigate(page);
  });
  if (!groups) {
    el.insertAdjacentHTML(
      "beforeend",
      `<section class="panel"><h2>Soluções e avaliação</h2><p>O criador do desafio pode avaliar as soluções de outros participantes.</p>${data.map((d) => `<button class="secondary" data-review="${d.id}">${esc(d.title)}</button>`).join("")}<div id="reviews"></div></section>`,
    );
    action("[data-review]", async (b) => {
      const solutions = await api(`/challenges/${b.dataset.review}/solutions`);
      document.querySelector("#reviews").innerHTML =
        solutions
          .map(
            (s) =>
              `<article><h3>${esc(s.full_name)} · ${esc(s.status)}</h3><pre>${esc(s.source_code)}</pre><button data-solution="${s.id}" data-result="aceita">Aceitar solução</button> <button class="secondary" data-solution="${s.id}" data-result="rejeitada">Rejeitar solução</button></article>`,
          )
          .join("") || "<p>Nenhuma solução disponível para você.</p>";
      action("[data-solution]", async (button) => {
        await api(`/solutions/${button.dataset.solution}`, "PATCH", {
          status: button.dataset.result,
        });
        notice("Avaliação registrada.");
        b.click();
      });
    });
  }
  action("[data-join]", async (b) => {
    await api(`/${page}/${b.dataset.join}/join`, "POST");
    await navigate(page);
  });
  for (const d of data)
    form(`entry-${d.id}`, async (value) => {
      await api(
        groups ? "/posts" : `/challenges/${d.id}/solutions`,
        "POST",
        groups ? { ...value, group_id: d.id } : value,
      );
      notice(groups ? "Publicação criada." : "Solução registrada.");
    });
}
document.addEventListener("keydown", () =>
  document.body.classList.add("keyboard"),
);
document.addEventListener("pointerdown", () =>
  document.body.classList.remove("keyboard"),
);
api("/me")
  .then((user) => {
    me = user;
    shell();
  })
  .catch(() => auth());
