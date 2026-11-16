export async function chatView(
  el,
  me,
  api,
  esc,
  form,
  action,
  notice,
  startPoll,
  isActive,
  initialConversation,
) {
  const list = await api("/conversations");
  if (!isActive()) return;
  if (
    initialConversation &&
    !list.some((c) => c._id === initialConversation._id)
  ) {
    list.unshift(initialConversation);
  }
  el.innerHTML = `<h1>Conversas</h1><p class="muted">Conversas privadas com suas conexões. Atualização a cada 3 segundos.</p><div class="chat-layout"><aside class="panel conversation-list" aria-label="Conversas">${list.map((c) => `<button class="secondary" data-conversation="${c._id}">${esc(c.peer?.full_name || "Usuário")}</button>`).join("") || "<p>Vá em Conexões e aceite uma amizade para iniciar.</p>"}</aside><section class="panel" id="thread"><div class="empty">Selecione uma conversa.</div></section></div>`;
  let selected = null,
    cursor = null,
    busy = false,
    threadVersion = 0;
  const shown = new Set();
  let draftKey = null,
    draftBody = null;
  async function poll() {
    if (!selected || busy || !isActive() || document.hidden) return;
    busy = true;
    const token = threadVersion;
    try {
      const result = await api(
        `/conversations/${selected}/messages?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      if (token !== threadVersion || !isActive()) return;
      const box = document.querySelector("#messages");
      for (const m of result.items) {
        if (shown.has(m._id)) continue;
        shown.add(m._id);
        box.insertAdjacentHTML(
          "beforeend",
          `<div class="bubble ${m.senderId === me.id ? "mine" : ""}">${esc(m.body)}<small>${new Date(m.createdAt).toLocaleString("pt-BR")} · salvo</small></div>`,
        );
      }
      cursor = result.nextCursor;
      document.querySelector("#chat-state").textContent = result.hasMore
        ? "Há mais mensagens. Carregue a próxima página."
        : shown.size
          ? "Histórico atualizado."
          : "Nenhuma mensagem. Comece a conversa.";
      document.querySelector("#more").hidden = !result.hasMore;
    } catch (e) {
      if (isActive()) notice(e.message, true);
    } finally {
      busy = false;
    }
  }
  action("[data-conversation]", async (b) => {
    threadVersion++;
    selected = b.dataset.conversation;
    cursor = null;
    shown.clear();
    draftKey = null;
    draftBody = null;
    const c = list.find((x) => x._id === selected);
    document.querySelector("#thread").innerHTML =
      `<h2>${esc(c.peer?.full_name)}</h2><p id="chat-state" role="status">Carregando histórico…</p><div class="messages" id="messages" aria-label="Histórico de mensagens" role="log" aria-live="polite"></div><button id="more" class="secondary" hidden>Carregar mais</button><form id="send" class="compose"><label>Mensagem<textarea name="body" maxlength="4000" required></textarea></label><button>Enviar mensagem</button></form>`;
    document.querySelector("#more").onclick = poll;
    form("send", async (data, f) => {
      const sendingThread = threadVersion;
      const body = data.body.trim();
      if (!body) throw new Error("Escreva uma mensagem.");
      if (body !== draftBody) {
        draftKey = crypto.randomUUID();
        draftBody = body;
      }
      await api(`/conversations/${selected}/messages`, "POST", {
        body,
        clientMessageId: draftKey,
      });
      if (sendingThread !== threadVersion || !isActive()) return;
      draftKey = null;
      draftBody = null;
      f.reset();
      await poll();
      const box = document.querySelector("#messages");
      box.scrollTop = box.scrollHeight;
    });
    await poll();
  });
  startPoll(poll);
  const initialId = initialConversation?._id ?? list[0]?._id;
  if (initialId)
    el.querySelector(`[data-conversation="${initialId}"]`)?.click();
}
