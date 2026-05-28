const byId = (id) => document.getElementById(id);
const USER_STORAGE_KEY = "travel-concierge-user-ui-v1";

function prettyJson(value) {
  return JSON.stringify(value, null, 2);
}

function randomUserId() {
  return `user_${Math.random().toString(36).slice(2, 10)}`;
}

function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function loadUserState() {
  const parsed = safeParseJson(localStorage.getItem(USER_STORAGE_KEY) || "");
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  return parsed;
}

function saveUserState(state) {
  const payload = {
    userId: state.userId,
    userApiKey: state.userApiKey,
    sessions: state.sessions,
    activeSessionId: state.activeSessionId,
    activeVisualTab: state.activeVisualTab,
  };
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(payload));
}

function detectDestinationText(text) {
  const match = text.match(/to\s+([a-zA-Z\s]{3,40})/i);
  if (!match) {
    return "travel destination";
  }
  return match[1].trim();
}

function nextSessionLabel(existingSessions) {
  let max = 0;
  for (const session of existingSessions) {
    const match = (session.label || "").match(/^Session\s+(\d+)$/);
    if (match) {
      const n = Number(match[1]);
      if (!Number.isNaN(n)) {
        max = Math.max(max, n);
      }
    }
  }
  return `Session ${max + 1}`;
}

function describeEvent(item, index) {
  if (item && item.author) {
    return `${item.author} event #${index + 1}`;
  }
  if (item && item.role) {
    return `${item.role} event #${index + 1}`;
  }
  return `event #${index + 1}`;
}

function extractTravelCards(text) {
  if (!text || typeof text !== "string") {
    return [];
  }

  const lines = text
    .split("\n")
    .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
    .filter((line) => line.length > 0);

  const keywordMatchers = [
    { title: "Flight", regex: /\b(flight|airline|departure|arrival|seat)\b/i },
    { title: "Hotel", regex: /\b(hotel|room|check-?in|check-?out|stay)\b/i },
    { title: "Itinerary", regex: /\b(itinerary|day\s*\d+|plan|schedule|activity|tour)\b/i },
    { title: "Booking", regex: /\b(booking|reservation|confirm|payment)\b/i },
  ];

  const cards = [];
  for (const line of lines) {
    for (const matcher of keywordMatchers) {
      if (matcher.regex.test(line)) {
        cards.push({ title: matcher.title, detail: line });
        break;
      }
    }
    if (cards.length >= 8) {
      break;
    }
  }

  if (cards.length > 0) {
    return cards;
  }

  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 4);

  return sentences.map((s, idx) => ({
    title: idx === 0 ? "Summary" : `Note ${idx}`,
    detail: s,
  }));
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, options);
  const raw = await response.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { raw };
  }

  if (!response.ok) {
    const detail = data && data.detail ? data.detail : raw || response.statusText;
    throw new Error(`${response.status}: ${detail}`);
  }
  return data;
}

function initUserPage() {
  const newSessionBtn = byId("newSessionBtn");
  if (!newSessionBtn) {
    return;
  }

  const storedState = loadUserState();
  const state = {
    userId: storedState && typeof storedState.userId === "string" ? storedState.userId : randomUserId(),
    userApiKey:
      storedState && typeof storedState.userApiKey === "string" && storedState.userApiKey
        ? storedState.userApiKey
        : "demo-user-key",
    sessions: storedState && Array.isArray(storedState.sessions) ? storedState.sessions : [],
    activeSessionId:
      storedState && typeof storedState.activeSessionId === "string" ? storedState.activeSessionId : null,
    activeVisualTab:
      storedState && typeof storedState.activeVisualTab === "string" ? storedState.activeVisualTab : "photos",
  };

  const sessionListEl = byId("sessionList");
  const messagesEl = byId("messages");
  const eventListEl = byId("eventList");
  const itineraryCardsEl = byId("itineraryCards");
  const heroImageEl = byId("heroImage");
  const messageInputEl = byId("messageInput");
  const userApiKeyEl = byId("userApiKey");
  const userIdentityEl = byId("userIdentity");
  const tabButtons = Array.from(document.querySelectorAll(".tab-btn"));
  const tabPanels = {
    photos: byId("panelPhotos"),
    itinerary: byId("panelItinerary"),
    trace: byId("panelTrace"),
  };

  userApiKeyEl.value = state.userApiKey;

  function activeSession() {
    return state.sessions.find((session) => session.sessionId === state.activeSessionId) || null;
  }

  function renderSessions() {
    sessionListEl.innerHTML = "";
    for (const session of state.sessions) {
      const li = document.createElement("li");
      li.className = "session-item";
      if (session.sessionId === state.activeSessionId) {
        li.classList.add("active");
      }
      li.innerHTML = `<strong>${session.label}</strong><br/><small>${session.sessionId}</small>`;
      li.addEventListener("click", () => {
        state.activeSessionId = session.sessionId;
        saveUserState(state);
        renderAll();
      });
      sessionListEl.appendChild(li);
    }
  }

  function renderMessages() {
    const session = activeSession();
    messagesEl.innerHTML = "";
    if (!session) {
      messagesEl.innerHTML = "<p class='subtitle'>Create a session to start chatting.</p>";
      return;
    }

    for (const message of session.messages) {
      const div = document.createElement("div");
      div.className = `message ${message.role}`;
      div.textContent = message.text;
      messagesEl.appendChild(div);
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function renderEvents() {
    const session = activeSession();
    eventListEl.innerHTML = "";
    if (!session || !session.events.length) {
      eventListEl.innerHTML = "<p class='subtitle'>Trace events will appear after a reply.</p>";
      return;
    }

    const recentEvents = session.events.slice(-12).reverse();
    for (let i = 0; i < recentEvents.length; i += 1) {
      const item = recentEvents[i];
      const wrapper = document.createElement("details");
      wrapper.className = "trace-item";

      const summary = document.createElement("summary");
      const ts = item._receivedAt ? new Date(item._receivedAt).toLocaleTimeString() : "unknown time";
      summary.textContent = `${describeEvent(item, i)} - ${ts}`;

      const pre = document.createElement("pre");
      pre.textContent = prettyJson(item);

      wrapper.appendChild(summary);
      wrapper.appendChild(pre);
      eventListEl.appendChild(wrapper);
    }
  }

  function renderItineraryCards() {
    const session = activeSession();
    itineraryCardsEl.innerHTML = "";
    if (!session) {
      itineraryCardsEl.innerHTML = "<p class='subtitle'>Create a session to build an itinerary.</p>";
      return;
    }

    const latestAssistant = [...session.messages].reverse().find((m) => m.role === "assistant");
    if (!latestAssistant) {
      itineraryCardsEl.innerHTML = "<p class='subtitle'>Assistant highlights will appear here.</p>";
      return;
    }

    const cards = extractTravelCards(latestAssistant.text);
    if (!cards.length) {
      itineraryCardsEl.innerHTML = "<p class='subtitle'>No itinerary signals detected yet.</p>";
      return;
    }

    for (const card of cards) {
      const el = document.createElement("article");
      el.className = "itinerary-card";
      el.innerHTML = `<h3>${card.title}</h3><p>${card.detail}</p>`;
      itineraryCardsEl.appendChild(el);
    }
  }

  function renderUserIdentity() {
    const sessionCount = state.sessions.length;
    userIdentityEl.textContent = `User ID: ${state.userId} | ${sessionCount} session${sessionCount === 1 ? "" : "s"}`;
  }

  function renderTabs() {
    for (const [tabName, panel] of Object.entries(tabPanels)) {
      const isActive = state.activeVisualTab === tabName;
      panel.hidden = !isActive;
      panel.classList.toggle("active", isActive);
    }
    for (const button of tabButtons) {
      const isActive = button.dataset.tab === state.activeVisualTab;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    }
  }

  function updateHeroImage() {
    const session = activeSession();
    if (!session || !session.messages.length) {
      return;
    }
    const lastUser = [...session.messages].reverse().find((m) => m.role === "user");
    if (!lastUser) {
      return;
    }

    const topic = detectDestinationText(lastUser.text);
    const url = `https://source.unsplash.com/1200x800/?${encodeURIComponent(topic)}`;
    heroImageEl.style.backgroundImage = `linear-gradient(140deg, rgba(14, 124, 134, 0.3), rgba(240, 109, 61, 0.24)), url("${url}")`;
  }

  function renderAll() {
    renderUserIdentity();
    renderTabs();
    renderSessions();
    renderMessages();
    renderItineraryCards();
    renderEvents();
    updateHeroImage();
    saveUserState(state);
  }

  async function createSession() {
    const created = await apiFetch("/api/v1/user/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": userApiKeyEl.value,
      },
      body: JSON.stringify({ user_id: state.userId }),
    });

    state.sessions.unshift({
      label: nextSessionLabel(state.sessions),
      sessionId: created.session_id,
      messages: [],
      events: [],
    });
    state.activeSessionId = created.session_id;
    saveUserState(state);
    renderAll();
  }

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.activeVisualTab = button.dataset.tab || "photos";
      saveUserState(state);
      renderTabs();
    });
  });

  userApiKeyEl.addEventListener("change", () => {
    state.userApiKey = userApiKeyEl.value.trim() || "demo-user-key";
    userApiKeyEl.value = state.userApiKey;
    saveUserState(state);
  });

  newSessionBtn.addEventListener("click", async () => {
    try {
      await createSession();
    } catch (error) {
      alert(`Unable to create session: ${error.message}`);
    }
  });

  byId("chatForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const session = activeSession();
    if (!session) {
      alert("Create a session first.");
      return;
    }

    const text = messageInputEl.value.trim();
    if (!text) {
      return;
    }

    session.messages.push({ role: "user", text });
    renderAll();
    messageInputEl.value = "";

    try {
      const response = await apiFetch(`/api/v1/user/sessions/${session.sessionId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": userApiKeyEl.value,
        },
        body: JSON.stringify({ user_id: state.userId, message: text }),
      });

      session.messages.push({ role: "assistant", text: response.assistant_text || "(No text response)" });
      for (const rawEvent of response.events || []) {
        session.events.push({ ...rawEvent, _receivedAt: new Date().toISOString() });
      }
      session.events = session.events.slice(-60);
      renderAll();
    } catch (error) {
      session.messages.push({ role: "assistant", text: `Error: ${error.message}` });
      renderAll();
    }
  });

  if (!state.sessions.length) {
    createSession().catch(() => {
      renderAll();
    });
    return;
  }

  if (!activeSession()) {
    state.activeSessionId = state.sessions[0].sessionId;
  }

  renderAll();
}

function initAdminPage() {
  const runBtn = byId("runOperationBtn");
  if (!runBtn) {
    return;
  }

  const operationEl = byId("operation");
  const resultEl = byId("adminResult");
  const bookingIdRowEl = byId("bookingIdRow");
  const guestIdRowEl = byId("guestIdRow");
  const statusRowEl = byId("statusRow");
  const paymentStatusRowEl = byId("paymentStatusRow");

  function updateVisibility() {
    const operation = operationEl.value;
    bookingIdRowEl.style.display = operation === "bookingById" ? "flex" : "none";
    guestIdRowEl.style.display = operation === "bookingsByGuest" ? "flex" : "none";
    const showBookingFilters = operation === "bookings";
    statusRowEl.style.display = showBookingFilters ? "flex" : "none";
    paymentStatusRowEl.style.display = showBookingFilters ? "flex" : "none";
  }

  async function runOperation() {
    const adminKey = byId("adminKey").value.trim();
    if (!adminKey) {
      alert("Admin API key is required.");
      return;
    }

    const operation = operationEl.value;
    let endpoint = "/api/v1/admin/guests";

    if (operation === "bookings") {
      const statusFilter = byId("statusFilter").value;
      const paymentStatusFilter = byId("paymentStatusFilter").value;
      const query = new URLSearchParams();
      if (statusFilter) {
        query.set("status", statusFilter);
      }
      if (paymentStatusFilter) {
        query.set("payment_status", paymentStatusFilter);
      }
      endpoint = `/api/v1/admin/bookings${query.toString() ? `?${query.toString()}` : ""}`;
    } else if (operation === "bookingById") {
      const bookingId = byId("bookingId").value.trim();
      if (!bookingId) {
        alert("Booking ID is required for this operation.");
        return;
      }
      endpoint = `/api/v1/admin/bookings/${encodeURIComponent(bookingId)}`;
    } else if (operation === "bookingsByGuest") {
      const guestId = byId("guestId").value.trim();
      if (!guestId) {
        alert("Guest ID is required for this operation.");
        return;
      }
      endpoint = `/api/v1/admin/guests/${encodeURIComponent(guestId)}/bookings`;
    } else if (operation === "paymentSummary") {
      endpoint = "/api/v1/admin/payments/summary";
    }

    resultEl.textContent = "Loading...";
    try {
      const data = await apiFetch(endpoint, {
        method: "GET",
        headers: {
          "x-admin-api-key": adminKey,
        },
      });
      resultEl.textContent = prettyJson(data);
    } catch (error) {
      resultEl.textContent = `Error: ${error.message}`;
    }
  }

  operationEl.addEventListener("change", updateVisibility);
  runBtn.addEventListener("click", runOperation);
  updateVisibility();
}

initUserPage();
initAdminPage();
