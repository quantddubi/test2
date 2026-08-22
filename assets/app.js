/* =============================================================
   연구 Vault 관계망 — app logic (vanilla JS, 외부 의존성 없음)

   data/exchange.json (vault-exchange/1) 하나만 읽는다.
   이 파일은 프라이빗 vault(test1)가 내보낸 "최소 컨텍스트"다:
   출처 + 권한 + 키워드 + 관계 엣지. 노트 본문은 여기 없고, 오지도 않는다.

   물리엔진의 장력(스프링)은 vault 쌍의 연결강도(affinity.strength)를
   그대로 옮긴 것이다 — 진위 판단이 아니라 연결·보완·충돌·공백 탐색용.
   ============================================================= */
"use strict";

const SCHEMA = "vault-exchange/1";
const VAULT_SLOTS = ["--t1", "--t2", "--t3", "--t4", "--t5", "--t6", "--t7", "--t8", "--t9", "--t10"];
const REL_LABEL = { "builds-on": "토대로 발전", "extends": "확장", "contradicts": "반박·충돌", "related": "관련", "mentions": "언급" };
const PERM_LABEL = { none: "봉인", keywords: "키워드만", metadata: "메타데이터", summary: "요약까지" };
const PERM_RANK = { none: 0, keywords: 1, metadata: 2, summary: 3 };

const state = {
  ex: null,            // exchange.json
  vaultById: new Map(),
  noteById: new Map(), // 공개된(metadata+) 노트만
  affinity: [],        // {a,b,shared_keywords,edge_counts,strength,total}
  view: "network",     // network | shelf  (drill은 network의 하위 상태)
  drill: null,         // vault id | null
  q: "",
  showGaps: true,
  gated: false,
  vaultColor: {},      // vault id → css var name
  sim: null,
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
const setAppState = (v) => { document.documentElement.dataset.appState = v; };
window.addEventListener("error", (e) => setAppState("error:" + (e.message || "unknown")));

/* =============================================================
   데이터 준비
   ============================================================= */
function indexData() {
  const ex = state.ex;
  const ids = ex.vaults.map((v) => v.id);
  ids.forEach((id, i) => { state.vaultColor[id] = VAULT_SLOTS[i % VAULT_SLOTS.length]; });
  for (const v of ex.vaults) {
    state.vaultById.set(v.id, v);
    for (const n of v.notes || []) state.noteById.set(n.id, n);
  }
  state.affinity = ex.affinity.map((p) => ({
    ...p,
    total: Object.values(p.edge_counts).reduce((s, x) => s + x, 0),
  }));
  state.gated = ex.stats.vault_count < ex.threshold.min_vaults
    || ex.stats.note_count < ex.threshold.min_total_notes;
}
const vaultColor = (id) => {
  const v = state.vaultById.get(id);
  if (v && v.permission === "none") return cssVar("--ink-3");
  return cssVar(state.vaultColor[id] || "--t1");
};
const noteLabel = (n) => `${String(n.authors[0]).split(" ").pop()} ${n.year}`;
function edgesOf(noteId) {
  return state.ex.edges.filter((e) => e.source === noteId || e.target === noteId);
}
function matchedVaults() {
  // 검색어에 걸리는 vault 집합 (vault 제목·키워드·노트 제목·저자)
  const q = state.q.trim().toLowerCase();
  if (!q) return null;
  const hit = new Set();
  for (const v of state.ex.vaults) {
    const hayV = [v.title, v.title_ko, ...(v.keywords || [])].join(" ").toLowerCase();
    if (hayV.includes(q)) { hit.add(v.id); continue; }
    for (const n of v.notes || []) {
      const hay = [n.title, n.title_ko, n.authors.join(" "), (n.keywords || []).join(" "), String(n.year)].join(" ").toLowerCase();
      if (hay.includes(q)) { hit.add(v.id); break; }
    }
  }
  return hit;
}

/* =============================================================
   물리 시뮬레이션 (공용)
   nodes: {id, kind, x, y, vx, vy, r, fixed, ...payload}
   springs: {a, b, L, k}   (a·b는 node 참조)
   ============================================================= */
function makeSim(nodes, springs, drawFn) {
  const sim = {
    nodes, springs, draw: drawFn,
    alpha: 1, raf: 0, running: false,
    view: { ox: 0, oy: 0, scale: 1 },
  };
  sim.tick = () => {
    const a = sim.alpha;
    // 반발
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const p = nodes[i], q = nodes[j];
        let dx = p.x - q.x, dy = p.y - q.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1e-4) { dx = ((i * 7 + j) % 13 - 6) * 0.01 || 0.01; dy = ((i * 5 + j) % 11 - 5) * 0.01 || 0.01; d2 = dx * dx + dy * dy; }
        const d = Math.sqrt(d2);
        const f = Math.min((170 * (p.r + q.r)) / d2, 9) * a;
        const fx = (dx / d) * f, fy = (dy / d) * f;
        if (!p.fixed) { p.vx += fx; p.vy += fy; }
        if (!q.fixed) { q.vx -= fx; q.vy -= fy; }
      }
    }
    // 스프링 (장력)
    for (const s of sim.springs) {
      let dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - s.L) * s.k * a;
      const fx = (dx / d) * f, fy = (dy / d) * f;
      if (!s.a.fixed) { s.a.vx += fx; s.a.vy += fy; }
      if (!s.b.fixed) { s.b.vx -= fx; s.b.vy -= fy; }
    }
    // 중심 인력 + 적분 (노드별 가중 — 드릴다운의 미니 노드는 조금 더 세게 붙잡는다)
    for (const n of nodes) {
      if (!n.fixed) {
        const g = n.gravity || 0.012;
        n.vx -= n.x * g * a; n.vy -= n.y * g * a;
        n.vx *= 0.82; n.vy *= 0.82;
        n.x += n.vx; n.y += n.vy;
        if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) { n.x = 0; n.y = 0; n.vx = 0; n.vy = 0; }
      }
    }
    // 겹침 해소
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const p = nodes[i], q = nodes[j];
        const dx = q.x - p.x, dy = q.y - p.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        // 라벨이 노드 아래에 그려지므로 반지름 합보다 넉넉히 띄워야 글자가 겹치지 않는다
        const min = p.r + q.r + (p.kind === "vault" || q.kind === "vault" ? 52 : 22);
        if (d < min) {
          const push = (min - d) / 2, ux = dx / d, uy = dy / d;
          if (!p.fixed) { p.x -= ux * push; p.y -= uy * push; }
          if (!q.fixed) { q.x += ux * push; q.y += uy * push; }
        }
      }
    }
    sim.alpha *= 0.986;
  };
  sim.loop = () => {
    sim.tick();
    sim.draw();
    if (sim.alpha > 0.015) sim.raf = requestAnimationFrame(sim.loop);
    else { sim.running = false; sim.draw(); }
  };
  sim.heat = (v = 0.6) => {
    sim.alpha = Math.max(sim.alpha, v);
    if (!sim.running) { sim.running = true; sim.raf = requestAnimationFrame(sim.loop); }
  };
  sim.stop = () => { cancelAnimationFrame(sim.raf); sim.running = false; };
  return sim;
}

/* ---------- 캔버스 공통 ---------- */
function canvasCtx() {
  const canvas = $("#graphCanvas");
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) return null;
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { canvas, ctx, W: rect.width, H: rect.height };
}
const SX = (sim, W, x) => W / 2 + sim.view.ox + x * sim.view.scale;
const SY = (sim, H, y) => H / 2 + sim.view.oy + y * sim.view.scale;
const WX = (sim, W, sx) => (sx - W / 2 - sim.view.ox) / sim.view.scale;
const WY = (sim, H, sy) => (sy - H / 2 - sim.view.oy) / sim.view.scale;

function drawArrowHead(ctx, x, y, ang, size, color) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - size * Math.cos(ang - 0.45), y - size * Math.sin(ang - 0.45));
  ctx.lineTo(x - size * Math.cos(ang + 0.45), y - size * Math.sin(ang + 0.45));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}
function drawLabel(ctx, text, x, y, ink, surface) {
  ctx.font = "600 12px -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
  ctx.textAlign = "center";
  const w = ctx.measureText(text).width;
  ctx.fillStyle = surface; ctx.globalAlpha = 0.85;
  ctx.fillRect(x - w / 2 - 4, y - 8, w + 8, 16);
  ctx.globalAlpha = 1;
  ctx.fillStyle = ink;
  ctx.fillText(text, x, y + 4);
}

/* =============================================================
   ① 관계망 뷰 — vault 노드 + affinity 스프링(장력)
   ============================================================= */
function buildNetworkSim() {
  const vaults = state.ex.vaults;
  const nodes = vaults.map((v, i) => ({
    id: v.id, kind: "vault", vault: v,
    r: Math.min(16 + 9 * Math.sqrt(v.note_count || 1), 52),
    x: Math.cos((i / vaults.length) * Math.PI * 2) * 190,
    y: Math.sin((i / vaults.length) * Math.PI * 2) * 190,
    vx: 0, vy: 0, fixed: false,
  }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const links = [];   // 그려지는 연결 (스프링 有)
  const gaps = [];    // 공백 — 물리력 없음, 점선만
  // 장력은 절대값이 아니라 이 데이터셋 안에서의 상대값으로 매핑한다.
  // 절대 스케일을 쓰면 vault가 쌓일수록 모든 쌍이 하한에 붙어 차이가 사라진다.
  const maxS = Math.max(1, ...state.affinity.map((p) => p.strength));
  for (const p of state.affinity) {
    const a = byId.get(p.a), b = byId.get(p.b);
    if (!a || !b) continue;
    if (p.total > 0) {
      const rel = p.strength / maxS;               // 0…1
      links.push({
        a, b, pair: p,
        L: 300 - 150 * rel,                        // 가장 센 쌍 150, 가장 약한 쌍 300 근처
        k: 0.010 * (0.4 + 1.1 * rel),
        width: 1.3 + 5 * rel,
        conflict: p.edge_counts.contradicts > 0,
        develop: (p.edge_counts["builds-on"] + p.edge_counts.extends) >= (p.edge_counts.related + p.edge_counts.mentions),
      });
    } else if (p.shared_keywords.length >= 2) {
      gaps.push({ a, b, pair: p });
    }
  }
  const sim = makeSim(nodes, links, drawNetwork);
  sim.links = links; sim.gaps = gaps; sim.mode = "network";
  sim.hover = null; // {type:'node'|'link'|'gap', obj}
  return sim;
}

function drawNetwork() {
  const sim = state.sim; if (!sim || sim.mode !== "network") return;
  const c = canvasCtx(); if (!c) return;
  const { ctx, W, H } = c;
  ctx.clearRect(0, 0, W, H);
  const ink = cssVar("--ink"), surface = cssVar("--surface");
  const cDev = cssVar("--e-develop"), cRel = cssVar("--e-related"), cCon = cssVar("--e-contradicts"), cGap = cssVar("--e-gap");
  const matched = matchedVaults();
  const dim = (id) => (matched && !matched.has(id) ? 0.22 : 1);

  // 공백 (물리력 없음)
  if (state.showGaps) {
    for (const g of sim.gaps) {
      ctx.beginPath();
      ctx.moveTo(SX(sim, W, g.a.x), SY(sim, H, g.a.y));
      ctx.lineTo(SX(sim, W, g.b.x), SY(sim, H, g.b.y));
      ctx.strokeStyle = cGap; ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.4 * Math.min(dim(g.a.id), dim(g.b.id)) * (sim.hover && sim.hover.obj === g ? 2 : 1);
      ctx.setLineDash([4, 7]);
      ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
  }
  // 연결 (장력)
  for (const l of sim.links) {
    const x1 = SX(sim, W, l.a.x), y1 = SY(sim, H, l.a.y), x2 = SX(sim, W, l.b.x), y2 = SY(sim, H, l.b.y);
    const hot = sim.hover && sim.hover.obj === l;
    ctx.globalAlpha = Math.min(dim(l.a.id), dim(l.b.id)) * (hot ? 1 : 0.8);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = l.develop ? cDev : cRel;
    ctx.lineWidth = l.width + (hot ? 1.2 : 0);
    ctx.stroke();
    if (l.conflict) {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.strokeStyle = cCon; ctx.lineWidth = Math.max(1.4, l.width * 0.55);
      ctx.setLineDash([6, 6]); ctx.stroke(); ctx.setLineDash([]);
      // 충돌 배지
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      ctx.beginPath(); ctx.arc(mx, my, 9, 0, Math.PI * 2);
      ctx.fillStyle = surface; ctx.fill();
      ctx.lineWidth = 1.6; ctx.strokeStyle = cCon; ctx.stroke();
      ctx.font = "10px sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = cCon;
      ctx.fillText("⚡", mx, my + 3.5);
    }
    ctx.globalAlpha = 1;
  }
  // vault 노드
  for (const n of sim.nodes) {
    const x = SX(sim, W, n.x), y = SY(sim, H, n.y);
    const sealed = n.vault.permission === "none";
    ctx.globalAlpha = dim(n.id);
    ctx.beginPath(); ctx.arc(x, y, n.r * sim.view.scale, 0, Math.PI * 2);
    ctx.fillStyle = vaultColor(n.id); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = surface; ctx.stroke();
    ctx.font = `700 ${Math.max(11, 13 * sim.view.scale)}px -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`;
    ctx.textAlign = "center"; ctx.fillStyle = surface;
    ctx.fillText(sealed ? "🔒" : String(n.vault.note_count), x, y + 4.5);
    drawLabel(ctx, `${n.vault.title_ko} · ${n.vault.note_count}편`, x, y + n.r * sim.view.scale + 16, ink, surface);
    ctx.globalAlpha = 1;
  }
}

/* =============================================================
   ② 드릴다운 뷰 — 한 vault의 노트 + 이웃 vault 미니 노드
   ============================================================= */
function buildDrillSim(vaultId) {
  const v = state.vaultById.get(vaultId);
  const notes = v.notes || [];
  const nodes = notes.map((n, i) => ({
    id: n.id, kind: "note", note: n, r: 13,
    x: Math.cos((i / Math.max(notes.length, 1)) * Math.PI * 2) * 120,
    y: Math.sin((i / Math.max(notes.length, 1)) * Math.PI * 2) * 120,
    vx: 0, vy: 0, fixed: false,
  }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // 이 vault의 노트가 얽힌 cross 엣지 → 이웃 vault 미니 노드
  const intraEdges = [], crossEdges = [];
  for (const e of state.ex.edges) {
    const sIn = byId.has(e.source), tIn = byId.has(e.target);
    if (sIn && tIn) intraEdges.push(e);
    else if (sIn || tIn) crossEdges.push(e);
  }
  const miniIds = [...new Set(crossEdges.map((e) => (byId.has(e.source) ? e.target_vault : e.source_vault)))].sort();
  const minis = miniIds.map((id, i) => ({
    id: `vault:${id}`, kind: "mini", vault: state.vaultById.get(id), r: 16,
    x: Math.cos((i / Math.max(miniIds.length, 1)) * Math.PI * 2 + 0.5) * 280,
    y: Math.sin((i / Math.max(miniIds.length, 1)) * Math.PI * 2 + 0.5) * 280,
    vx: 0, vy: 0, fixed: false, gravity: 0.028,
  }));
  const miniById = new Map(minis.map((m) => [m.vault.id, m]));
  const springs = [];
  for (const e of intraEdges) {
    springs.push({ a: byId.get(e.source), b: byId.get(e.target), L: 150, k: e.type === "mentions" ? 0.008 : 0.014 });
  }
  const agg = new Map(); // noteId|vault → count (미니 스프링은 노트-이웃당 1개)
  for (const e of crossEdges) {
    const noteN = byId.get(e.source) || byId.get(e.target);
    const mini = miniById.get(byId.has(e.source) ? e.target_vault : e.source_vault);
    const key = noteN.id + "|" + mini.vault.id;
    if (!agg.has(key)) { agg.set(key, 0); springs.push({ a: noteN, b: mini, L: 195, k: 0.01 }); }
    agg.set(key, agg.get(key) + 1);
  }
  const allNodes = nodes.concat(minis);
  const sim = makeSim(allNodes, springs, drawDrill);
  sim.mode = "drill"; sim.vault = v;
  sim.noteNodes = byId; sim.miniById = miniById;
  sim.intraEdges = intraEdges; sim.crossEdges = crossEdges;
  sim.hover = null;
  return sim;
}

function edgeStyle(type) {
  const cDev = cssVar("--e-develop"), cRel = cssVar("--e-related"), cCon = cssVar("--e-contradicts");
  switch (type) {
    case "builds-on": return { color: cDev, width: 2.2, dash: [], alpha: 0.9, arrow: true };
    case "extends": return { color: cDev, width: 2.2, dash: [], alpha: 0.55, arrow: true };
    case "contradicts": return { color: cCon, width: 2.2, dash: [7, 5], alpha: 0.9, arrow: true };
    case "related": return { color: cRel, width: 1.5, dash: [2, 5], alpha: 0.85, arrow: false };
    default: return { color: cRel, width: 1.2, dash: [1, 5], alpha: 0.5, arrow: false }; // mentions
  }
}

function drawDrill() {
  const sim = state.sim; if (!sim || sim.mode !== "drill") return;
  const c = canvasCtx(); if (!c) return;
  const { ctx, W, H } = c;
  ctx.clearRect(0, 0, W, H);
  const ink = cssVar("--ink"), surface = cssVar("--surface");

  const endpoints = (e) => {
    const s = sim.noteNodes.get(e.source) || sim.miniById.get(e.source_vault);
    const t = sim.noteNodes.get(e.target) || sim.miniById.get(e.target_vault);
    return [s, t];
  };
  const drawEdge = (e, isCross) => {
    const [s, t] = endpoints(e); if (!s || !t) return;
    const st = edgeStyle(e.type);
    const x1 = SX(sim, W, s.x), y1 = SY(sim, H, s.y), x2 = SX(sim, W, t.x), y2 = SY(sim, H, t.y);
    const hot = sim.hover && sim.hover.obj === e;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = st.color;
    ctx.lineWidth = (isCross ? st.width * 0.8 : st.width) + (hot ? 1 : 0);
    ctx.globalAlpha = st.alpha * (hot ? 1.4 : 1);
    ctx.setLineDash(st.dash); ctx.stroke(); ctx.setLineDash([]);
    if (st.arrow) {
      const dx = x2 - x1, dy = y2 - y1, d = Math.sqrt(dx * dx + dy * dy) || 1;
      const back = (t.r * sim.view.scale) + 8;
      drawArrowHead(ctx, x2 - (dx / d) * back, y2 - (dy / d) * back, Math.atan2(dy, dx), 8, st.color);
    }
    ctx.globalAlpha = 1;
  };
  for (const e of sim.intraEdges) drawEdge(e, false);
  for (const e of sim.crossEdges) drawEdge(e, true);

  for (const n of sim.nodes) {
    const x = SX(sim, W, n.x), y = SY(sim, H, n.y);
    if (n.kind === "note") {
      ctx.beginPath(); ctx.arc(x, y, n.r * sim.view.scale, 0, Math.PI * 2);
      ctx.fillStyle = vaultColor(sim.vault.id); ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = surface; ctx.stroke();
      drawLabel(ctx, noteLabel(n.note), x, y + n.r * sim.view.scale + 15, ink, surface);
    } else {
      // 이웃 vault 미니 노드 — 링 스타일
      ctx.beginPath(); ctx.arc(x, y, n.r * sim.view.scale, 0, Math.PI * 2);
      ctx.fillStyle = surface; ctx.fill();
      ctx.lineWidth = 3.5; ctx.strokeStyle = vaultColor(n.vault.id); ctx.stroke();
      ctx.font = "700 10.5px sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = vaultColor(n.vault.id);
      ctx.fillText(String(n.vault.note_count), x, y + 3.5);
      drawLabel(ctx, n.vault.title_ko, x, y + n.r * sim.view.scale + 15, ink, surface);
    }
  }
}

/* =============================================================
   캔버스 상호작용 (두 모드 공용)
   ============================================================= */
function hitTest(mx, my) {
  const sim = state.sim; if (!sim) return null;
  const c = $("#graphCanvas").getBoundingClientRect();
  const W = c.width, H = c.height;
  for (const n of sim.nodes) {
    const dx = mx - SX(sim, W, n.x), dy = my - SY(sim, H, n.y);
    const rr = n.r * sim.view.scale + 5;
    if (dx * dx + dy * dy <= rr * rr) return { type: "node", obj: n };
  }
  const segDist = (x1, y1, x2, y2) => {
    const L2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
    if (!L2) return Math.hypot(mx - x1, my - y1);
    let t = ((mx - x1) * (x2 - x1) + (my - y1) * (y2 - y1)) / L2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(mx - (x1 + t * (x2 - x1)), my - (y1 + t * (y2 - y1)));
  };
  if (sim.mode === "network") {
    for (const l of sim.links) {
      if (segDist(SX(sim, W, l.a.x), SY(sim, H, l.a.y), SX(sim, W, l.b.x), SY(sim, H, l.b.y)) < 7) return { type: "link", obj: l };
    }
    if (state.showGaps) {
      for (const g of sim.gaps) {
        if (segDist(SX(sim, W, g.a.x), SY(sim, H, g.a.y), SX(sim, W, g.b.x), SY(sim, H, g.b.y)) < 7) return { type: "gap", obj: g };
      }
    }
  } else {
    const ep = (e) => {
      const s = sim.noteNodes.get(e.source) || sim.miniById.get(e.source_vault);
      const t = sim.noteNodes.get(e.target) || sim.miniById.get(e.target_vault);
      return [s, t];
    };
    for (const e of sim.intraEdges.concat(sim.crossEdges)) {
      const [s, t] = ep(e); if (!s || !t) continue;
      if (segDist(SX(sim, W, s.x), SY(sim, H, s.y), SX(sim, W, t.x), SY(sim, H, t.y)) < 6) return { type: "edge", obj: e };
    }
  }
  return null;
}

function tensionTooltip(pair, isGap) {
  const tt = $("#tooltip"); tt.textContent = "";
  const A = state.vaultById.get(pair.a), B = state.vaultById.get(pair.b);
  tt.append(el("div", { class: "tt-title", text: `${A.title_ko} ↔ ${B.title_ko}` }));
  if (isGap) {
    tt.append(el("div", { class: "tt-sub", text: "공백 — 키워드는 겹치는데 아직 잇는 연구가 없다" }));
  } else {
    tt.append(el("div", { class: "tt-sub", text: `장력(연결강도) ${pair.strength}` }));
    const rows = [["builds-on", "토대로 발전"], ["extends", "확장·보완"], ["contradicts", "충돌"], ["related", "관련"], ["mentions", "본문 언급"]];
    const table = el("table");
    for (const [k, label] of rows) {
      if (!pair.edge_counts[k]) continue;
      table.append(el("tr", {}, [
        el("td", { text: label, class: k === "contradicts" ? "warn" : null }),
        el("td", { class: "num", text: String(pair.edge_counts[k]) }),
      ]));
    }
    tt.append(table);
  }
  if (pair.shared_keywords.length) {
    tt.append(el("div", { class: "tt-kws", text: "공유 키워드: " + pair.shared_keywords.join(" · ") }));
  }
  return tt;
}

function nodeTooltip(n) {
  const tt = $("#tooltip"); tt.textContent = "";
  if (n.kind === "vault" || n.kind === "mini") {
    const v = n.vault;
    tt.append(el("div", { class: "tt-title", text: v.title_ko }));
    tt.append(el("div", { class: "tt-sub", text: `노트 ${v.note_count}편 · 공개 범위: ${PERM_LABEL[v.permission]}` }));
    if (v.description_ko) tt.append(el("div", { text: v.description_ko }));
  } else {
    tt.append(el("div", { class: "tt-title", text: n.note.title_ko }));
    tt.append(el("div", { class: "tt-sub", text: `${n.note.authors.join(", ")} (${n.note.year})` }));
    if (n.note.one_liner) tt.append(el("div", { text: n.note.one_liner }));
  }
  return tt;
}

function edgeTooltip(e) {
  const tt = $("#tooltip"); tt.textContent = "";
  const name = (id) => state.noteById.get(id) ? state.noteById.get(id).title_ko : id;
  tt.append(el("div", { class: "tt-title", text: `${name(e.source)} → ${name(e.target)}` }));
  tt.append(el("div", { class: "tt-sub", text: REL_LABEL[e.type] || e.type }));
  if (e.note) tt.append(el("div", { text: e.note }));
  return tt;
}

function wireCanvas() {
  const canvas = $("#graphCanvas");
  let drag = null, moved = false;
  canvas.addEventListener("pointerdown", (e) => {
    const sim = state.sim; if (!sim) return;
    const hit = hitTest(e.clientX - canvas.getBoundingClientRect().left, e.clientY - canvas.getBoundingClientRect().top);
    drag = {
      node: hit && hit.type === "node" ? hit.obj : null,
      sx: e.clientX, sy: e.clientY, ox: sim.view.ox, oy: sim.view.oy,
    };
    if (drag.node) drag.node.fixed = true;
    moved = false;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    const sim = state.sim; if (!sim) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    if (drag) {
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      if (drag.node) {
        drag.node.x = WX(sim, rect.width, mx); drag.node.y = WY(sim, rect.height, my);
        drag.node.vx = 0; drag.node.vy = 0;
        sim.heat(0.45);
      } else {
        sim.view.ox = drag.ox + dx; sim.view.oy = drag.oy + dy;
        sim.draw();
      }
      return;
    }
    const hit = hitTest(mx, my);
    sim.hover = hit && hit.type !== "node" ? hit : null;
    canvas.style.cursor = hit && hit.type === "node" ? "pointer" : "grab";
    const tt = $("#tooltip");
    if (hit) {
      let elTT = null;
      if (hit.type === "node") elTT = nodeTooltip(hit.obj);
      else if (hit.type === "link") elTT = tensionTooltip(hit.obj.pair, false);
      else if (hit.type === "gap") elTT = tensionTooltip(hit.obj.pair, true);
      else if (hit.type === "edge") elTT = edgeTooltip(hit.obj);
      if (elTT) {
        elTT.classList.add("show");
        elTT.style.left = Math.min(e.clientX + 14, window.innerWidth - 340) + "px";
        elTT.style.top = Math.min(e.clientY + 16, window.innerHeight - 160) + "px";
      }
    } else tt.classList.remove("show");
    if (!sim.running) sim.draw();
  });
  canvas.addEventListener("pointerup", () => {
    const sim = state.sim;
    if (drag && drag.node) {
      drag.node.fixed = false;
      if (!moved) onNodeClick(drag.node);
      else if (sim) sim.heat(0.3);
    }
    drag = null;
  });
  canvas.addEventListener("pointerleave", () => $("#tooltip").classList.remove("show"));
  canvas.addEventListener("wheel", (e) => {
    const sim = state.sim; if (!sim) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const wx = WX(sim, rect.width, mx), wy = WY(sim, rect.height, my);
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    sim.view.scale = Math.max(0.4, Math.min(2.6, sim.view.scale * factor));
    sim.view.ox = mx - rect.width / 2 - wx * sim.view.scale;
    sim.view.oy = my - rect.height / 2 - wy * sim.view.scale;
    sim.draw();
  }, { passive: false });
  window.addEventListener("resize", () => { if (state.sim) { state.sim.draw(); } });
}

function onNodeClick(n) {
  if (n.kind === "vault" || n.kind === "mini") {
    const v = n.vault;
    if (PERM_RANK[v.permission] >= PERM_RANK.metadata) location.hash = `#vault/${v.id}`;
    else openVaultCard(v);
  } else if (n.kind === "note") {
    location.hash = `#note/${n.id}`;
  }
}

/* =============================================================
   뷰 전환 / 드릴다운
   ============================================================= */
function startSim(sim) {
  if (state.sim) state.sim.stop();
  state.sim = sim;
  sim.heat(1);
}

function showNetwork() {
  state.drill = null;
  $("#drillCrumb").hidden = true;
  if (state.gated) return; // 게이트가 캔버스를 대신함
  startSim(buildNetworkSim());
}

function enterDrill(vaultId) {
  const v = state.vaultById.get(vaultId);
  if (!v) { location.hash = "#/network"; return; }
  if (PERM_RANK[v.permission] < PERM_RANK.metadata) { openVaultCard(v); return; }
  setTab("network");
  state.drill = vaultId;
  $("#drillCrumb").hidden = false;
  $("#crumbLabel").textContent = `${v.title_ko} — 노트 ${v.note_count}편`;
  startSim(buildDrillSim(vaultId));
}

function setTab(view) {
  state.view = view;
  for (const tab of document.querySelectorAll(".tab")) tab.setAttribute("aria-selected", String(tab.dataset.view === view));
  $("#view-network").hidden = view !== "network";
  $("#view-shelf").hidden = view !== "shelf";
}

function switchView(view, { pushHash = true } = {}) {
  setTab(view);
  if (pushHash && location.hash !== `#/${view}`) history.replaceState(null, "", `#/${view}`);
  if (view === "network") showNetwork();
  else { if (state.sim) state.sim.stop(); renderShelf(); }
}

/* =============================================================
   ③ 서가 뷰 — vault 카드
   ============================================================= */
function renderShelf() {
  const host = $("#view-shelf"); host.textContent = "";
  const q = state.q.trim().toLowerCase();
  const grid = el("div", { class: "vault-grid" });
  let any = false;
  for (const v of state.ex.vaults) {
    const notes = (v.notes || []).filter((n) => {
      if (!q) return true;
      return [n.title, n.title_ko, n.authors.join(" "), (n.keywords || []).join(" "), String(n.year)].join(" ").toLowerCase().includes(q);
    });
    if (q && !notes.length && ![v.title, v.title_ko, ...(v.keywords || [])].join(" ").toLowerCase().includes(q)) continue;
    any = true;
    const card = el("div", { class: "vault-card", style: `--c:${cssVar(state.vaultColor[v.id])}` });
    card.append(el("div", { class: "v-head" }, [
      el("span", { class: "dot" }),
      el("h2", { text: v.title_ko }),
      el("span", { class: "v-count", text: `${v.note_count}편` }),
    ]));
    const permBadge = el("span", { class: `badge ${v.permission === "none" ? "sealed" : "perm"}`, text: `공개: ${PERM_LABEL[v.permission]}` });
    if (v.permission === "none") {
      card.append(el("div", { class: "v-sealed", text: "🔒 봉인된 Vault — 존재와 규모만 공개됩니다." }), el("div", {}, [permBadge]));
    } else {
      if (v.description_ko) card.append(el("div", { class: "v-desc", text: v.description_ko }));
      card.append(el("div", { class: "v-kws" }, (v.keywords || []).map((k) => el("span", { class: "kw-chip", text: k }))));
      card.append(el("div", {}, [permBadge]));
      if (v.notes) {
        const list = el("div");
        for (const n of notes) {
          list.append(el("button", { class: "note-row", type: "button", onclick: () => { location.hash = `#note/${n.id}`; } }, [
            el("span", { class: "nr-title", text: n.title_ko }),
            el("span", { class: "nr-meta", text: `${noteLabel(n)} · ${n.difficulty}` }),
            el("span", { class: `badge st-${n.status}`, text: n.status === "verified" ? "원문 검증" : "지식 기반" }),
          ]));
        }
        card.append(list);
      } else {
        card.append(el("div", { class: "lock-note", text: "노트 목록은 공개 범위(keywords) 밖입니다." }));
      }
    }
    grid.append(card);
  }
  if (!any) host.append(el("div", { class: "empty", text: "조건에 맞는 Vault·노트가 없습니다." }));
  else host.append(grid);
}

/* =============================================================
   최소 컨텍스트 카드 (노트 / 봉인·키워드 vault)
   ============================================================= */
function openCard() {
  $("#cardOverlay").hidden = false;
  document.body.style.overflow = "hidden";
}
function closeCard({ restoreHash = true } = {}) {
  $("#cardOverlay").hidden = true;
  document.body.style.overflow = "";
  if (restoreHash && location.hash.startsWith("#note/")) {
    history.replaceState(null, "", state.drill ? `#vault/${state.drill}` : `#/${state.view}`);
  }
}

function openVaultCard(v) {
  $("#cardTitle").textContent = v.title_ko;
  $("#cardSub").textContent = v.title;
  const meta = $("#cardMeta"); meta.textContent = "";
  meta.append(el("span", { class: `badge ${v.permission === "none" ? "sealed" : "perm"}`, text: `공개 범위: ${PERM_LABEL[v.permission]}` }));
  const body = $("#cardBody"); body.textContent = "";
  body.append(el("p", { class: "lock-note", text: v.permission === "none"
    ? `🔒 봉인된 Vault입니다. 존재와 규모(노트 ${v.note_count}편)만 공개됩니다.`
    : `이 Vault는 키워드까지만 공개합니다 (노트 ${v.note_count}편).` }));
  if (v.description_ko) body.append(el("p", { text: v.description_ko }));
  if (v.keywords) body.append(el("div", { class: "kws-row" }, v.keywords.map((k) => el("span", { class: "kw-chip", text: k }))));
  openCard();
}

function openNoteCard(id) {
  const n = state.noteById.get(id);
  if (!n) { closeCard({ restoreHash: false }); return; }
  const v = state.vaultById.get(n.vault);
  $("#cardTitle").textContent = n.title_ko;
  $("#cardSub").textContent = `${n.title} · ${n.venue || "―"} (${n.year})`;
  const meta = $("#cardMeta"); meta.textContent = "";
  meta.append(
    el("span", { class: "authors", text: n.authors.join(", ") }),
    el("span", { class: `badge d-${n.difficulty}`, text: n.difficulty }),
    el("span", {
      class: `badge st-${n.status}`,
      text: n.status === "verified" ? "원문 검증" : "지식 기반",
      title: n.status === "verified" ? "원문 PDF를 대조해 검증한 노트" : "지식 기반 요약 (원문 PDF 대조 전)",
    }),
    el("span", { class: "badge perm", text: `공개: ${PERM_LABEL[v.permission]}` }),
  );
  const body = $("#cardBody"); body.textContent = "";

  if (n.one_liner) body.append(el("p", { class: "one-liner", text: n.one_liner }));

  body.append(el("div", { class: "kws-row" }, (n.keywords || []).map((k) => el("span", { class: "kw-chip", text: k }))));

  body.append(el("h3", { text: "출처" }));
  const src = el("div", { class: "src-block" });
  src.append(el("div", { class: "src-line" }, [
    el("span", { class: "src-key", text: "Vault" }),
    el("span", { class: "src-val", text: `${v.title_ko} — ${v.source ? v.source.repo : "private"} · vaults/${n.vault}` }),
  ]));
  src.append(el("div", { class: "src-line" }, [
    el("span", { class: "src-key", text: "PDF" }),
    el("span", { class: "src-val", text: n.source && n.source.pdf ? n.source.pdf : "지식 기반 — 원본 PDF 미보관" }),
  ]));
  const noteUrl = `https://github.com/quantddubi/test1/blob/main/vaults/${encodeURIComponent(n.vault)}/notes/${encodeURIComponent(n.id)}.md`;
  src.append(el("div", { class: "src-line" }, [
    el("span", { class: "src-key", text: "본문" }),
    el("span", { class: "src-val" }, [
      el("a", { href: noteUrl, target: "_blank", rel: "noopener", text: "프라이빗 vault의 원본 노트" }),
      " (접근 권한 필요 — 본문은 공개되지 않습니다)",
    ]),
  ]));
  body.append(src);

  const rels = edgesOf(id);
  if (rels.length) {
    body.append(el("h3", { text: `연결 (${rels.length})` }));
    const list = el("div", { class: "rel-list" });
    const nameBtn = (nid) => {
      const t = state.noteById.get(nid);
      if (!t) return el("span", { text: nid });
      return el("button", { type: "button", text: t.title_ko, onclick: () => openNoteCard(nid) });
    };
    const typeBadge = (t) => el("span", { class: `rel-type ${t}`, text: REL_LABEL[t] || t });
    for (const e of rels) {
      let line;
      if (e.source === id) {
        line = e.type === "mentions"
          ? el("div", { class: "rel-line" }, ["이 노트가 본문에서 ", nameBtn(e.target), " 을(를) ", typeBadge(e.type)])
          : el("div", { class: "rel-line" }, ["이 연구는 ", nameBtn(e.target), " 를(을) ", typeBadge(e.type), e.note ? ` — ${e.note}` : ""]);
      } else {
        line = e.type === "mentions"
          ? el("div", { class: "rel-line" }, [nameBtn(e.source), " 의 본문이 이 연구를 ", typeBadge(e.type)])
          : el("div", { class: "rel-line" }, [nameBtn(e.source), " 가(이) 이 연구를 ", typeBadge(e.type), e.note ? ` — ${e.note}` : ""]);
      }
      list.append(line);
    }
    body.append(list);
  }
  openCard();
}

/* =============================================================
   임계치 게이트
   ============================================================= */
function renderGate() {
  const { stats, threshold } = state.ex;
  const gate = $("#gate");
  const canvas = $("#graphCanvas");
  if (!state.gated) { gate.hidden = true; canvas.style.display = ""; return; }
  gate.hidden = false;
  canvas.style.display = "none";
  $("#gateVaultLabel").textContent = `Vault ${stats.vault_count} / ${threshold.min_vaults}개`;
  $("#gateNoteLabel").textContent = `노트 ${stats.note_count} / ${threshold.min_total_notes}편`;
  $("#gateVaultFill").style.width = Math.min(100, (stats.vault_count / threshold.min_vaults) * 100) + "%";
  $("#gateNoteFill").style.width = Math.min(100, (stats.note_count / threshold.min_total_notes) * 100) + "%";
}

/* =============================================================
   라우팅 / 테마 / 부트
   ============================================================= */
function handleHash() {
  const h = location.hash;
  if (h.startsWith("#note/")) {
    if (state.view === "shelf") renderShelf();
    else {
      setTab("network");
      if (!state.sim && !state.gated) showNetwork(); // 직접 진입 시 배경 그래프 기동
    }
    openNoteCard(h.slice(6));
    return;
  }
  if (!$("#cardOverlay").hidden) closeCard({ restoreHash: false });
  if (h.startsWith("#vault/")) { enterDrill(h.slice(7)); return; }
  const v = h.replace("#/", "");
  switchView(v === "shelf" ? "shelf" : "network", { pushHash: false });
}

function initTheme() {
  const saved = localStorage.getItem("vault-theme");
  if (saved === "dark" || saved === "light") document.documentElement.setAttribute("data-theme", saved);
  $("#themeBtn").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const isDark = cur ? cur === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    const next = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("vault-theme", next);
    if (state.sim) state.sim.draw(); // 캔버스는 CSS 변수를 다시 읽어야 함
    if (state.view === "shelf") renderShelf();
  });
}

function fail(title, detail) {
  $("#view-network").hidden = true;
  $("#controls").style.display = "none";
  $(".tabs").style.display = "none"; // 데이터 없이는 어떤 뷰도 성립하지 않는다
  const host = $("#view-shelf"); host.hidden = false; host.textContent = "";
  host.append(el("div", { class: "empty" }, [el("h2", { text: title }), el("div", { text: detail })]));
}

async function boot() {
  initTheme();
  for (const tab of document.querySelectorAll(".tab")) {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  }
  let t;
  $("#searchBox").addEventListener("input", (e) => {
    clearTimeout(t);
    t = setTimeout(() => {
      state.q = e.target.value;
      if (state.view === "shelf") renderShelf();
      else if (state.sim) state.sim.draw();
    }, 120);
  });
  $("#backBtn").addEventListener("click", () => { location.hash = "#/network"; });
  $("#cardClose").addEventListener("click", () => closeCard());
  $("#cardOverlay").addEventListener("click", (e) => { if (e.target === $("#cardOverlay")) closeCard(); });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("#cardOverlay").hidden) closeCard();
    else if (state.drill) location.hash = "#/network";
  });
  $("#gapToggle").addEventListener("change", (e) => {
    state.showGaps = e.target.checked;
    if (state.sim) state.sim.draw();
  });
  window.addEventListener("hashchange", handleHash);
  wireCanvas();

  let ex;
  try {
    const res = await fetch("./data/exchange.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    ex = await res.json();
  } catch (err) {
    fail("아직 교환 데이터가 배달되지 않았습니다",
      `프라이빗 vault(test1)의 build-exchange 워크플로가 data/exchange.json 을 푸시하면 관계망이 열립니다. (${err.message})`);
    setAppState("error:fetch");
    return;
  }
  if (!ex || ex.schema !== SCHEMA) {
    fail("알 수 없는 교환 스키마입니다",
      `이 대시보드는 ${SCHEMA} 를 읽습니다 (받은 값: ${ex && ex.schema}). test1/EXCHANGE_SPEC.md 버전 규칙을 확인하세요.`);
    setAppState("error:schema");
    return;
  }
  state.ex = ex;
  indexData();

  $("#countBadge").textContent = `Vault ${ex.stats.vault_count} · 노트 ${ex.stats.note_count}편 · 연결 ${ex.stats.edge_count}개`;
  $("#srcBadge").textContent = `${ex.source.repo}@${ex.source.commit}`;
  document.title = `연구 Vault 관계망 · ${ex.stats.vault_count} vaults`;
  renderGate();

  handleHash();
  if (!location.hash) switchView("network", { pushHash: false });
  setAppState("ready");
}
document.addEventListener("DOMContentLoaded", boot);
