/* =============================================================
   Quant Paper Library — app logic (vanilla JS, 외부 의존성 없음)
   library/index.json(메타+그래프)과 library/html/<id>.html(본문)을 읽어 렌더링.
   ============================================================= */
"use strict";

const TOPIC_SLOTS = ["--t1", "--t2", "--t3", "--t4", "--t5", "--t6", "--t7", "--t8", "--t9", "--t10"];
// 알려진 주제는 고정 슬롯(색이 엔티티를 따라감), 새 주제는 남는 슬롯 순서대로
const TOPIC_FIXED = { "자산배분": "--t1", "팩터투자": "--t2", "모멘텀": "--t3", "시스템트레이딩": "--t7", "리스크관리": "--t4", "머신러닝": "--t5", "채권": "--t6", "옵션/변동성": "--t8", "마켓타이밍": "--t9", "실증검증": "--t10" };
const REL_LABEL = { "builds-on": "토대로 발전", "extends": "확장", "contradicts": "반박·충돌", "related": "관련" };

const state = {
  data: null, view: "shelf", q: "", topic: null, diff: null,
  topicColor: {}, graph: null, openNote: null,
};

const $ = (s, r = document) => r.querySelector(s);
function el(tag, attrs = {}, kids = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const kid of [].concat(kids)) if (kid != null) n.append(kid.nodeType ? kid : document.createTextNode(kid));
  return n;
}
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function assignTopicColors() {
  const used = new Set();
  for (const t of state.data.meta.topics.map((x) => x.name)) {
    if (TOPIC_FIXED[t]) { state.topicColor[t] = TOPIC_FIXED[t]; used.add(TOPIC_FIXED[t]); }
  }
  let free = TOPIC_SLOTS.filter((s) => !used.has(s));
  for (const t of state.data.meta.topics.map((x) => x.name)) {
    if (!state.topicColor[t]) state.topicColor[t] = free.shift() || "--t1";
  }
}
const topicVar = (t) => `var(${state.topicColor[t] || "--t1"})`;

/* ---------- filtering ---------- */
function visibleNotes() {
  const q = state.q.trim().toLowerCase();
  return state.data.notes.filter((n) => {
    if (state.topic && !n.topics.includes(state.topic)) return false;
    if (state.diff && n.difficulty !== state.diff) return false;
    if (!q) return true;
    const hay = [n.title, n.title_ko, n.one_liner, n.authors.join(" "), n.topics.join(" "), String(n.year)].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

/* ---------- chips ---------- */
function renderChips() {
  const tc = $("#topicChips"); tc.innerHTML = "";
  for (const t of state.data.meta.topics) {
    const b = el("button", {
      class: "chip", type: "button", "aria-pressed": String(state.topic === t.name),
      onclick: () => { state.topic = state.topic === t.name ? null : t.name; renderChips(); renderCurrentView(); },
    }, [el("span", { class: "dot", style: `--c:${topicVar(t.name)}` }), `${t.name} `, el("span", { style: "opacity:.55", text: String(t.count) })]);
    tc.append(b);
  }
  const dc = $("#diffChips"); dc.innerHTML = "";
  for (const d of state.data.meta.difficulties) {
    dc.append(el("button", {
      class: "chip", type: "button", "aria-pressed": String(state.diff === d),
      onclick: () => { state.diff = state.diff === d ? null : d; renderChips(); renderCurrentView(); },
      text: d,
    }));
  }
}

/* ---------- badges ---------- */
function badges(n, { withTopics = true } = {}) {
  const out = [el("span", { class: `badge d-${n.difficulty}`, text: n.difficulty })];
  if (withTopics) for (const t of n.topics) out.push(el("span", { class: "badge topic", text: t }));
  out.push(el("span", {
    class: `badge st-${n.status}`,
    text: n.status === "verified" ? "원문 검증" : "지식 기반",
    title: n.status === "verified" ? "원문 PDF를 대조해 검증한 노트" : "Claude의 지식 기반 요약 (원문 PDF 대조 전)",
  }));
  return out;
}

/* ---------- shelf ---------- */
function renderShelf() {
  const host = $("#view-shelf"); host.innerHTML = "";
  const notes = visibleNotes();
  if (!notes.length) { host.append(el("div", { class: "empty", text: "조건에 맞는 논문이 없습니다." })); return; }

  const groups = new Map();
  for (const n of notes) {
    const key = n.topics[0];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  }
  const order = state.data.meta.topics.map((t) => t.name).filter((t) => groups.has(t));

  for (const topic of order) {
    const shelf = el("section", { class: "shelf" });
    shelf.append(el("div", { class: "shelf-head", style: `--c:${topicVar(topic)}` }, [
      el("span", { class: "dot" }),
      el("h2", { text: topic }),
      el("span", { class: "n", text: `${groups.get(topic).length}권 · 입문부터 순서대로` }),
    ]));
    const grid = el("div", { class: "card-grid" });
    for (const n of groups.get(topic)) {
      const card = el("button", { class: "card", style: `--c:${topicVar(topic)}`, type: "button", onclick: () => openNote(n.id) }, [
        el("div", { class: "c-title", text: n.title_ko }),
        el("div", { class: "c-meta", text: `${n.authors.join(", ")} · ${n.year}${n.venue ? " · " + n.venue : ""}` }),
        el("div", { class: "c-one", text: n.one_liner }),
        el("div", { class: "c-foot" }, badges(n, { withTopics: n.topics.length > 1 })),
      ]);
      grid.append(card);
    }
    shelf.append(grid);
    host.append(shelf);
  }
}

/* ---------- ideas ---------- */
function renderIdeas() {
  const host = $("#view-ideas"); host.innerHTML = "";
  const notes = visibleNotes().filter((n) => n.ideas.length);
  if (!notes.length) { host.append(el("div", { class: "empty", text: "연구 아이디어가 없습니다." })); return; }
  for (const n of notes) {
    host.append(el("div", { class: "idea-group", style: `--c:${topicVar(n.topics[0])}` }, [
      el("h3", {}, [el("button", { type: "button", onclick: () => openNote(n.id), text: n.title_ko })]),
      el("div", { class: "src", text: `${n.authors.join(", ")} (${n.year}) 에서 출발하는 아이디어` }),
      el("ul", {}, n.ideas.map((i) => el("li", { text: i }))),
    ]));
  }
}

/* ---------- graph (canvas force layout) ---------- */
function buildGraph() {
  const notes = state.data.notes;
  const nodes = notes.map((n, i) => ({
    id: n.id, note: n,
    x: Math.cos((i / notes.length) * Math.PI * 2) * 160,
    y: Math.sin((i / notes.length) * Math.PI * 2) * 160,
    vx: 0, vy: 0,
  }));
  const byId = new Map(nodes.map((nd) => [nd.id, nd]));
  const edges = state.data.edges
    .filter((e) => byId.has(e.source) && byId.has(e.target))
    .map((e) => ({ ...e, s: byId.get(e.source), t: byId.get(e.target) }));
  // 시뮬레이션 (반발 + 스프링 + 중심)
  for (let iter = 0; iter < 500; iter++) {
    const k = 1 - iter / 500;
    for (const a of nodes) {
      for (const b of nodes) {
        if (a === b) continue;
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy || 1;
        const f = Math.min(12000 / d2, 8) * k;
        const d = Math.sqrt(d2);
        a.vx += (dx / d) * f; a.vy += (dy / d) * f;
      }
      a.vx -= a.x * 0.012 * k; a.vy -= a.y * 0.012 * k;
    }
    for (const e of edges) {
      const dx = e.t.x - e.s.x, dy = e.t.y - e.s.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - 170) * 0.02 * k;
      e.s.vx += (dx / d) * f; e.s.vy += (dy / d) * f;
      e.t.vx -= (dx / d) * f; e.t.vy -= (dy / d) * f;
    }
    for (const n of nodes) { n.x += n.vx * 0.5; n.y += n.vy * 0.5; n.vx *= 0.6; n.vy *= 0.6; }
  }
  state.graph = { nodes, edges, byId, ox: 0, oy: 0, scale: 1 };
}

function drawGraph() {
  const g = state.graph; if (!g) return;
  const canvas = $("#graphCanvas");
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const cx = rect.width / 2 + g.ox, cy = rect.height / 2 + g.oy;
  const X = (n) => cx + n.x * g.scale, Y = (n) => cy + n.y * g.scale;
  const edgeColors = { "builds-on": cssVar("--e-builds"), extends: cssVar("--e-builds"), contradicts: cssVar("--e-contradicts"), related: cssVar("--e-related") };

  for (const e of g.edges) {
    ctx.beginPath();
    ctx.moveTo(X(e.s), Y(e.s)); ctx.lineTo(X(e.t), Y(e.t));
    ctx.strokeStyle = edgeColors[e.type] || edgeColors.related;
    ctx.lineWidth = e.type === "related" ? 1.4 : 2.2;
    ctx.globalAlpha = e.type === "extends" ? 0.55 : 0.85;
    ctx.setLineDash(e.type === "contradicts" ? [7, 5] : e.type === "related" ? [2, 5] : []);
    ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    // 방향 화살표 (target 쪽)
    if (e.type !== "related") {
      const dx = X(e.t) - X(e.s), dy = Y(e.t) - Y(e.s);
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const ax = X(e.t) - (dx / d) * 30, ay = Y(e.t) - (dy / d) * 30;
      const ang = Math.atan2(dy, dx);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax - 9 * Math.cos(ang - 0.45), ay - 9 * Math.sin(ang - 0.45));
      ctx.lineTo(ax - 9 * Math.cos(ang + 0.45), ay - 9 * Math.sin(ang + 0.45));
      ctx.closePath();
      ctx.fillStyle = edgeColors[e.type] || edgeColors.related;
      ctx.fill();
    }
  }

  const ink = cssVar("--ink"), surface = cssVar("--surface");
  for (const n of g.nodes) {
    const color = cssVar(state.topicColor[n.note.topics[0]] || "--t1");
    ctx.beginPath();
    ctx.arc(X(n), Y(n), 17, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = surface; ctx.stroke();
    // 라벨 (짧은 제목: 저자-연도)
    ctx.font = "600 12px -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
    ctx.textAlign = "center";
    const label = `${n.note.authors[0].split(" ").pop()} ${n.note.year}`;
    const w = ctx.measureText(label).width;
    ctx.fillStyle = surface; ctx.globalAlpha = 0.82;
    ctx.fillRect(X(n) - w / 2 - 4, Y(n) + 22, w + 8, 17);
    ctx.globalAlpha = 1;
    ctx.fillStyle = ink;
    ctx.fillText(label, X(n), Y(n) + 35);
  }
}

function hitNode(evt) {
  const g = state.graph; if (!g) return null;
  const rect = $("#graphCanvas").getBoundingClientRect();
  const mx = evt.clientX - rect.left, my = evt.clientY - rect.top;
  const cx = rect.width / 2 + g.ox, cy = rect.height / 2 + g.oy;
  for (const n of g.nodes) {
    const dx = mx - (cx + n.x * g.scale), dy = my - (cy + n.y * g.scale);
    if (dx * dx + dy * dy <= 22 * 22) return n;
  }
  return null;
}

function wireGraph() {
  const canvas = $("#graphCanvas");
  let drag = null, moved = false;
  canvas.addEventListener("pointerdown", (e) => {
    const n = hitNode(e);
    drag = { node: n, sx: e.clientX, sy: e.clientY, ox: state.graph.ox, oy: state.graph.oy, nx: n?.x, ny: n?.y };
    moved = false;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    const g = state.graph; if (!g) return;
    if (drag) {
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      if (drag.node) { drag.node.x = drag.nx + dx / g.scale; drag.node.y = drag.ny + dy / g.scale; }
      else { g.ox = drag.ox + dx; g.oy = drag.oy + dy; }
      drawGraph();
    } else {
      const n = hitNode(e);
      canvas.style.cursor = n ? "pointer" : "grab";
      const tt = $("#tooltip");
      if (n) {
        tt.textContent = `${n.note.title_ko} — ${n.note.one_liner}`;
        tt.classList.add("show");
        tt.style.left = Math.min(e.clientX + 14, window.innerWidth - 320) + "px";
        tt.style.top = e.clientY + 16 + "px";
      } else tt.classList.remove("show");
    }
  });
  canvas.addEventListener("pointerup", (e) => {
    if (drag && drag.node && !moved) openNote(drag.node.id);
    drag = null;
  });
  canvas.addEventListener("pointerleave", () => $("#tooltip").classList.remove("show"));
  window.addEventListener("resize", () => { if (state.view === "graph") drawGraph(); });
}

/* ---------- note detail ---------- */
async function openNote(id, { pushHash = true } = {}) {
  const n = state.data.notes.find((x) => x.id === id);
  if (!n) return;
  state.openNote = id;
  if (pushHash && location.hash !== `#note/${id}`) location.hash = `#note/${id}`;

  $("#panelTitle").textContent = n.title_ko;
  $("#panelEn").textContent = `${n.title} · ${n.venue} (${n.year})`;
  const meta = $("#panelMeta"); meta.innerHTML = "";
  meta.append(el("span", { class: "authors", text: n.authors.join(", ") }), ...badges(n));

  // 관계 (양방향)
  const rel = $("#panelRel"); rel.innerHTML = ""; let has = false;
  for (const e of state.data.edges) {
    let line = null;
    if (e.source === id) {
      const t = state.data.notes.find((x) => x.id === e.target);
      if (t) line = ["이 연구는 ", el("b", {}, [noteLink(t)]), ` 를(을) `, relBadge(e.type), e.note ? ` — ${e.note}` : ""];
    } else if (e.target === id) {
      const s = state.data.notes.find((x) => x.id === e.source);
      if (s) line = [el("b", {}, [noteLink(s)]), ` 가(이) 이 연구를 `, relBadge(e.type), e.note ? ` — ${e.note}` : ""];
    }
    if (line) { rel.append(el("div", { class: "rel-line" }, line)); has = true; }
  }
  rel.hidden = !has;

  $("#panelBody").textContent = "불러오는 중…";
  $("#noteOverlay").hidden = false;
  document.body.style.overflow = "hidden";
  try {
    const res = await fetch(`./library/html/${id}.html`, { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    $("#panelBody").innerHTML = await res.text();
    $(".panel").scrollTop = 0;
  } catch (err) {
    $("#panelBody").textContent = "본문을 불러오지 못했습니다: " + err.message;
  }
}
function relBadge(type) { return el("span", { class: `rel-type ${type}`, text: REL_LABEL[type] || type }); }
function noteLink(n) {
  return el("a", { href: `#note/${n.id}`, class: "wikilink", onclick: (e) => { e.preventDefault(); openNote(n.id); } }, [n.title_ko]);
}
function closeNote() {
  state.openNote = null;
  $("#noteOverlay").hidden = true;
  document.body.style.overflow = "";
  if (location.hash.startsWith("#note/")) history.replaceState(null, "", `#/${state.view}`);
}

/* ---------- views / routing ---------- */
function renderCurrentView() {
  if (state.view === "shelf") renderShelf();
  else if (state.view === "ideas") renderIdeas();
  else if (state.view === "graph") drawGraph();
}
function switchView(view, { pushHash = true } = {}) {
  state.view = view;
  for (const tab of document.querySelectorAll(".tab")) tab.setAttribute("aria-selected", String(tab.dataset.view === view));
  $("#view-shelf").hidden = view !== "shelf";
  $("#view-graph").hidden = view !== "graph";
  $("#view-ideas").hidden = view !== "ideas";
  $("#controls").style.display = view === "graph" ? "none" : "";
  if (pushHash && location.hash !== `#/${view}`) history.replaceState(null, "", `#/${view}`);
  renderCurrentView();
}
function handleHash() {
  const h = location.hash;
  if (h.startsWith("#note/")) { openNote(h.slice(6), { pushHash: false }); return; }
  if (!$("#noteOverlay").hidden) closeNote();
  const v = h.replace("#/", "");
  if (["shelf", "graph", "ideas"].includes(v)) switchView(v, { pushHash: false });
}

/* ---------- theme ---------- */
function initTheme() {
  const saved = localStorage.getItem("library-theme");
  if (saved === "dark" || saved === "light") document.documentElement.setAttribute("data-theme", saved);
  $("#themeBtn").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const isDark = cur ? cur === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    const next = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("library-theme", next);
    if (state.view === "graph") drawGraph(); // 캔버스는 CSS 변수를 다시 읽어야 함
  });
}

/* ---------- boot ---------- */
async function boot() {
  initTheme();
  for (const tab of document.querySelectorAll(".tab")) {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  }
  let t;
  $("#searchBox").addEventListener("input", (e) => {
    clearTimeout(t);
    t = setTimeout(() => { state.q = e.target.value; renderCurrentView(); }, 120);
  });
  $("#panelClose").addEventListener("click", closeNote);
  $("#noteOverlay").addEventListener("click", (e) => { if (e.target === $("#noteOverlay")) closeNote(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#noteOverlay").hidden) closeNote(); });
  window.addEventListener("hashchange", handleHash);

  try {
    const res = await fetch("./library/index.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    state.data = await res.json();
  } catch (err) {
    $("#view-shelf").innerHTML = `<div class="empty">library/index.json 을 불러오지 못했습니다 (${err.message}).<br>아직 노트가 빌드되지 않았을 수 있습니다.</div>`;
    return;
  }

  assignTopicColors();
  $("#countBadge").textContent = `논문 ${state.data.meta.note_count}편 · 연결 ${state.data.meta.edge_count}개`;
  renderChips();
  buildGraph();
  wireGraph();
  handleHash();
  if (!location.hash) switchView("shelf", { pushHash: false });
  else if (location.hash.startsWith("#note/")) renderShelf(); // 배경 뷰
  document.title = `퀀트 연구 서재 · ${state.data.meta.note_count}편`;
}
document.addEventListener("DOMContentLoaded", boot);
