/* =============================================================
   Market Dashboard — app logic (vanilla JS, no external deps)
   summary.json(결과값)만 읽어 렌더링. 원본 시계열 없음.
   ============================================================= */
"use strict";

const HORIZON_LABELS = { "1D": "1일", "1W": "1주", "1M": "1개월", "3M": "3개월", "6M": "6개월", "YTD": "연초대비", "1Y": "1년" };
const CAT_ORDER = ["RATE", "CREDIT", "FX", "HEDGE", "MACRO"];
const state = { data: null, cat: "ALL", horizon: "1M", q: "", sort: { col: null, dir: -1 }, expanded: {} };

/* ---------- utils ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
function el(tag, attrs = {}, kids = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (k === "style") n.setAttribute("style", v);
    else n.setAttribute(k, v);
  }
  for (const kid of [].concat(kids)) if (kid != null) n.append(kid.nodeType ? kid : document.createTextNode(kid));
  return n;
}
const catVar = (c) => `var(--cat-${c})`;

function levelDecimals(a) {
  a = Math.abs(a);
  return a >= 1000 ? 1 : a >= 10 ? 2 : a >= 1 ? 3 : a >= 0.1 ? 3 : 4;
}
function fmtLevel(unit, v) {
  if (v == null || !isFinite(v)) return "—";
  if (unit === "%") return v.toFixed(2) + "%";
  if (unit === "%p") return v.toFixed(2) + "%p";
  if (unit === "bp") return Math.round(v).toLocaleString() + " bp";
  const d = levelDecimals(v); // level (FX / index)
  return v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}
/* s: 시리즈(레벨 소수자리 결정용), v: 변화값 */
function fmtChangeVal(s, v) {
  if (v == null || !isFinite(v)) return null;
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  if (s.change_unit === "bp") {
    const str = Math.abs(v) >= 100 ? Math.abs(v).toFixed(0) : Math.abs(v).toFixed(1);
    return sign + str + " bp";
  }
  return sign + Math.abs(v).toFixed(levelDecimals(s.latest)); // level
}
function fmtPct(v) { return v == null || !isFinite(v) ? null : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(2) + "%"; }
const dirClass = (v) => (v == null ? "flat" : v > 0 ? "up" : v < 0 ? "down" : "flat");
const arrow = (v) => (v == null || v === 0 ? "" : v > 0 ? "▲" : "▼");

/* tint metric: 금리계열은 bp(changes), 레벨은 %변화로 정규화 */
function tintMetric(s, h) {
  if (s.unit === "level") { const p = s.changes_pct?.[h]; return p == null ? null : Math.abs(p); }
  const c = s.changes?.[h]; return c == null ? null : Math.abs(c);
}

/* ---------- render: header/meta ---------- */
function renderMeta() {
  const m = state.data.meta;
  $("#asof").textContent = m.as_of || "—";
  $("#footasof").textContent = m.as_of || "—";
  $("#scount").textContent = (m.series_count + (m.derived_count ? " (+" + m.derived_count + " 파생)" : ""));
  $("#genat").textContent = (m.generated_at || "").replace("T", " ").replace("Z", " UTC");
  $("#privNote").innerHTML =
    '<b>공개 범위 안내</b> — 이 대시보드는 각 지표의 <b>최신값·기간 변화·52주 통계</b> 등 <b>결과값만</b> 표시합니다. ' +
    '데이터 밴더의 원본 일별 시계열(' + (m.date_start || "") + " ~ " + (m.date_end || "") +
    ')은 <b>프라이빗 저장소</b>에만 보관되며 이 페이지로 전송되지 않습니다.';
  document.title = `글로벌 금리·크레딧·환율 대시보드 · ${m.as_of || ""}`;
}

/* ---------- render: category chips ---------- */
function renderChips() {
  const box = $("#catChips"); box.innerHTML = "";
  const cats = state.data.meta.categories;
  const total = state.data.series.length;
  const mk = (key, label, count, color) => {
    const b = el("button", {
      class: "chip", "aria-pressed": String(state.cat === key), type: "button",
      onclick: () => { state.cat = key; renderChips(); renderTables(); }
    });
    if (color) b.append(el("span", { class: "dot", style: `--c:${color}` }));
    b.append(document.createTextNode(label + " "), el("span", { class: "k-cat", style: "color:var(--text-muted)", text: String(count) }));
    return b;
  };
  box.append(mk("ALL", "전체", total, null));
  for (const c of cats) box.append(mk(c.key, c.label.split(" ")[0], c.count, catVar(c.key)));
}

/* ---------- render: KPI tiles ---------- */
function meterHTML(pct) {
  const p = pct == null ? null : Math.max(0, Math.min(1, pct)) * 100;
  if (p == null) return "";
  return `<div class="meter" style="--p:${p.toFixed(1)}%"><div class="fill"></div><div class="mark"></div></div>`;
}
function renderKPIs() {
  const grid = $("#kpiGrid"); grid.innerHTML = "";
  const byCode = new Map(state.data.series.map((s) => [s.code, s]));
  const h = state.horizon;
  for (const code of state.data.headline) {
    const s = byCode.get(code); if (!s) continue;
    const cv = s.changes?.[h];
    const chgTxt = fmtChangeVal(s, cv);
    const pct = s.unit === "level" ? fmtPct(s.changes_pct?.[h]) : null;
    const tile = el("div", { class: "kpi", style: `--c:${catVar(s.category)}` });
    tile.append(
      el("div", { class: "k-top" }, [
        el("span", { class: "k-code", text: s.code }),
        el("span", { class: "k-cat", text: s.category })
      ]),
      el("div", { class: "k-name", text: s.name_ko && s.name_ko !== s.code ? s.name_ko : " " }),
      el("div", { class: "k-val", html: fmtLevel(s.unit, s.latest) + (s.unit === "%" || s.unit === "%p" ? "" : "") }),
      el("div", { class: "k-chg" }, [
        el("span", { class: "chg " + dirClass(cv) }, [
          el("span", { class: "arrow", text: arrow(cv) }), " ", (chgTxt || "—")
        ]),
        pct ? el("span", { class: "chg " + dirClass(s.changes_pct?.[h]) + " k-sub", text: "(" + pct + ")" }) : null,
        el("span", { class: "k-sub", text: " · " + HORIZON_LABELS[h] })
      ]),
      el("div", { html: meterHTML(s.w52?.pctile) }),
      el("div", { class: "meter-row" }, [
        el("span", { text: "52주 " + fmtLevel(s.unit, s.w52?.low) }),
        el("span", { text: fmtLevel(s.unit, s.w52?.high) })
      ])
    );
    tile.setAttribute("tabindex", "0");
    attachTip(tile, tipForSeries(s));
    grid.append(tile);
  }
}

/* ---------- render: derived ---------- */
function renderDerived() {
  const wrap = $("#dgroups"); wrap.innerHTML = "";
  const groups = state.data.meta.derived_groups || [];
  const h = state.horizon;
  for (const g of groups) {
    const items = state.data.derived.filter((d) => d.group === g.key);
    if (!items.length) continue;
    const card = el("div", { class: "dgroup" }, [el("h3", { text: g.label })]);
    for (const d of items) {
      const cv = d.changes?.[h];
      const chg = fmtChangeVal(d, cv);
      const row = el("div", { class: "drow" }, [
        el("div", {}, [el("div", { class: "d-label", text: d.label }), el("div", { class: "d-formula", text: d.formula })]),
        el("div", { class: "d-val", text: fmtLevel(d.unit, d.latest) }),
        el("div", { class: "d-chg chg " + dirClass(cv) }, [el("span", { class: "arrow", text: arrow(cv) }), " ", chg || "—"])
      ]);
      attachTip(row, tipForSeries(d, true));
      card.append(row);
    }
    wrap.append(card);
  }
}

/* ---------- render: tables ---------- */
const COLS = [
  { key: "name", label: "지표", cls: "name" },
  { key: "latest", label: "최신", cls: "latest" },
  { key: "1D", label: "1일" }, { key: "1W", label: "1주" }, { key: "1M", label: "1개월" },
  { key: "3M", label: "3개월" }, { key: "6M", label: "6개월" }, { key: "YTD", label: "연초" }, { key: "1Y", label: "1년" },
  { key: "rng", label: "52주 위치", cls: "rng" }
];

function sortVal(s, col) {
  if (col === "name") return s.code.toLowerCase();
  if (col === "latest") return s.latest ?? -Infinity;
  if (col === "rng") return s.w52?.pctile ?? -Infinity;
  return s.changes?.[col] ?? -Infinity;
}
function matchQ(s, q) {
  if (!q) return true;
  const hay = (s.code + " " + (s.name_ko || "") + " " + (s.id || "") + " " + (s.sub || "")).toLowerCase();
  return hay.includes(q);
}

function renderTables() {
  const host = $("#tables"); host.innerHTML = "";
  const q = state.q.trim().toLowerCase();
  const cats = state.data.meta.categories.filter((c) => state.cat === "ALL" || c.key === state.cat);
  let shown = 0;

  for (const c of cats) {
    let rows = state.data.series.filter((s) => s.category === c.key && matchQ(s, q));
    if (!rows.length) continue;

    // sort
    if (state.sort.col) {
      const { col, dir } = state.sort;
      rows = rows.slice().sort((a, b) => {
        const va = sortVal(a, col), vb = sortVal(b, col);
        if (va < vb) return -1 * dir; if (va > vb) return 1 * dir; return 0;
      });
    }
    // per-column tint normalizers (bp group vs level group)
    const norm = {};
    for (const h of ["1D", "1W", "1M", "3M", "6M", "YTD", "1Y"]) {
      let bp = 0, lv = 0;
      for (const s of rows) { const m = tintMetric(s, h); if (m == null) continue; if (s.unit === "level") lv = Math.max(lv, m); else bp = Math.max(bp, m); }
      norm[h] = { bp, lv };
    }

    shown += rows.length;
    const card = el("div", { class: "tbl-card" });
    const expanded = state.expanded[c.key] !== false;
    const head = el("div", {
      class: "tbl-cat-head", role: "button", tabindex: "0", "aria-expanded": String(expanded),
      onclick: () => { state.expanded[c.key] = !expanded; renderTables(); },
      onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); state.expanded[c.key] = !expanded; renderTables(); } }
    }, [
      el("span", { class: "dot", style: `--c:${catVar(c.key)}` }),
      el("h3", { text: c.label }),
      el("span", { class: "count", text: rows.length + " 개" }),
      el("span", { class: "caret", text: "▼" })
    ]);
    card.append(head);

    if (expanded) {
      const scroll = el("div", { class: "tbl-scroll" });
      const table = el("table");
      const thead = el("thead"); const htr = el("tr");
      for (const col of COLS) {
        const isSorted = state.sort.col === col.key;
        const doSort = () => {
          if (state.sort.col === col.key) state.sort.dir *= -1;
          else state.sort = { col: col.key, dir: col.key === "name" ? 1 : -1 };
          renderTables();
        };
        const th = el("th", {
          class: col.cls || "", scope: "col", role: "columnheader button", tabindex: "0",
          title: col.label + " 기준 정렬", "aria-label": col.label + " 기준 정렬",
          "aria-sort": isSorted ? (state.sort.dir === 1 ? "ascending" : "descending") : "none",
          onclick: doSort,
          onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); doSort(); } }
        }, [el("span", { text: col.label }), el("span", { class: "sarrow" })]);
        htr.append(th);
      }
      thead.append(htr); table.append(thead);

      const tb = el("tbody");
      for (const s of rows) {
        const tr = el("tr");
        // name
        const nameTd = el("td", { class: "name" }, [
          el("span", { class: "nm", text: s.code }),
          s.name_ko && s.name_ko !== s.code ? el("span", { class: "nk", text: s.name_ko }) : null
        ]);
        attachTip(nameTd, tipForSeries(s));
        tr.append(nameTd);
        // latest
        tr.append(el("td", { class: "latest", text: fmtLevel(s.unit, s.latest) }));
        // change columns
        for (const h of ["1D", "1W", "1M", "3M", "6M", "YTD", "1Y"]) {
          const cv = s.changes?.[h];
          const td = el("td", { class: "chgcell " + dirClass(cv) });
          if (cv == null) { td.textContent = "—"; }
          else {
            const txt = fmtChangeVal(s, cv);
            td.append(el("span", { class: "arrow", text: arrow(cv) }), document.createTextNode(" " + (txt || "")));
            // tint: 방향(상승 빨강/하락 파랑) + |변화|를 컬럼·단위그룹 내 최대로 정규화
            // (변화 0인 셀은 착색하지 않음 — 중립을 색으로 오도하지 않기 위해)
            const m = tintMetric(s, h); const grp = s.unit === "level" ? norm[h].lv : norm[h].bp;
            if (cv !== 0 && m != null && grp > 0) {
              const a = 0.10 + 0.34 * Math.min(1, m / grp);
              td.style.background = `rgba(var(--${cv > 0 ? "up" : "down"}-tint), ${a.toFixed(3)})`;
            }
            attachTip(td, tipForChange(s, h));
          }
          tr.append(td);
        }
        // 52w range meter
        const p = s.w52?.pctile;
        const rngTd = el("td", { class: "rng" }, [
          el("div", { class: "rng-wrap" }, [
            el("div", { class: "rng-meter" }, [el("div", { class: "mk", style: `--p:${p == null ? 50 : (Math.max(0, Math.min(1, p)) * 100).toFixed(1)}%` })]),
            el("span", { class: "rng-pct", text: p == null ? "—" : Math.round(p * 100) + "%" })
          ])
        ]);
        attachTip(rngTd, `52주 범위\n최저 ${fmtLevel(s.unit, s.w52?.low)}\n최고 ${fmtLevel(s.unit, s.w52?.high)}\n현재 위치 ${p == null ? "—" : Math.round(p * 100) + "%"}${s.z != null ? "\nz-score " + s.z : ""}`);
        tr.append(rngTd);
        tb.append(tr);
      }
      table.append(tb); scroll.append(table); card.append(scroll);
    }
    host.append(card);
  }
  $("#tcount").textContent = shown ? shown + " 개 지표" : "";
  $("#emptyMsg").hidden = shown > 0;
}

/* ---------- tooltips ---------- */
function tipForSeries(s, derived = false) {
  const lines = [];
  lines.push(s.label || s.code);
  if (s.name_ko && s.name_ko !== s.code) lines.push(s.name_ko);
  if (derived) lines.push("정의: " + s.formula);
  if (s.sub) lines.push("종류: " + s.sub);
  lines.push("최신 " + fmtLevel(s.unit, s.latest) + " (" + s.as_of + ")");
  const parts = ["1D", "1W", "1M", "3M", "6M", "YTD", "1Y"].map((h) => {
    const t = fmtChangeVal(s, s.changes?.[h]); return t ? HORIZON_LABELS[h] + " " + t : null;
  }).filter(Boolean);
  if (parts.length) lines.push(parts.join(" · "));
  if (s.w52) lines.push("52주 " + fmtLevel(s.unit, s.w52.low) + " ~ " + fmtLevel(s.unit, s.w52.high) + (s.w52.pctile != null ? " (" + Math.round(s.w52.pctile * 100) + "%)" : ""));
  if (s.z != null) lines.push("z-score " + s.z);
  return lines.join("\n");
}
function tipForChange(s, h) {
  const cv = s.changes?.[h];
  const pct = s.changes_pct?.[h];
  const lines = [(s.label || s.code) + " · " + HORIZON_LABELS[h]];
  lines.push("변화 " + (fmtChangeVal(s, cv) || "—"));
  if (pct != null) lines.push("변화율 " + fmtPct(pct));
  lines.push("최신 " + fmtLevel(s.unit, s.latest));
  return lines.join("\n");
}
let tipEl;
function attachTip(node, text) {
  node.addEventListener("mouseenter", () => showTip(text));
  node.addEventListener("mousemove", moveTip);
  node.addEventListener("mouseleave", hideTip);
  node.addEventListener("focus", () => { showTip(text); const r = node.getBoundingClientRect(); positionTip(r.left + r.width / 2, r.bottom); });
  node.addEventListener("blur", hideTip);
}
function showTip(text) {
  tipEl = tipEl || $("#tooltip");
  tipEl.innerHTML = "";
  for (const ln of text.split("\n")) tipEl.append(el("div", { text: ln }));
  tipEl.classList.add("show");
}
function moveTip(e) { positionTip(e.clientX, e.clientY + 16); }
function positionTip(x, y) {
  if (!tipEl) return;
  const w = tipEl.offsetWidth, h = tipEl.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
  let left = x + 12, top = y + 4;
  if (left + w + 12 > vw) left = x - w - 12;
  if (top + h + 12 > vh) top = y - h - 20;
  tipEl.style.left = Math.max(6, left) + "px"; tipEl.style.top = Math.max(6, top) + "px";
}
function hideTip() { if (tipEl) tipEl.classList.remove("show"); }

/* ---------- theme ---------- */
function initTheme() {
  const saved = localStorage.getItem("mdash-theme");
  if (saved === "dark" || saved === "light") document.documentElement.setAttribute("data-theme", saved);
  $("#themeBtn").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const isDark = cur ? cur === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    const next = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("mdash-theme", next);
  });
}

/* ---------- boot ---------- */
function wireControls() {
  $("#horizonSel").addEventListener("change", (e) => { state.horizon = e.target.value; renderKPIs(); renderDerived(); });
  let t;
  $("#searchBox").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; renderTables(); }, 120); });
}

async function boot() {
  initTheme(); wireControls();
  try {
    const res = await fetch("./data/summary.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    state.data = await res.json();
  } catch (err) {
    $("#tables").innerHTML = '<div class="empty">summary.json 을 불러오지 못했습니다. (' + err.message + ')<br>데이터 파이프라인이 아직 실행되지 않았을 수 있습니다.</div>';
    return;
  }
  for (const c of state.data.meta.categories) state.expanded[c.key] = true;
  renderMeta(); renderChips(); renderKPIs(); renderDerived(); renderTables();
}
document.addEventListener("DOMContentLoaded", boot);
