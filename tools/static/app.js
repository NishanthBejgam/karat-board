/* Karat Board — the screen. One fetch of /api/state paints everything. */

let STATE = null;
let UNIT = 1;               // 1 = per gram, 10 = per 10 grams

/* Which metal the whole page is about. Switching it is not a filter on top of
   a gold page - the palette, the mark, the tab icon and the merchant list all
   follow, because a silver board that looks golden is just wrong. Only the
   merchants who publish silver in a response we already fetch appear in silver;
   the rest are not "missing", they simply do not price it publicly. */
let METAL = "gold";
const isSilver = () => METAL === "silver";
const rateOf = (r) => isSilver() ? (r || {}).buyAg : (r || {}).buy24;
const publishes = (m) => rateOf(m.rate) != null;
let manualFor = null;

/* No jeweller publishes what they will pay you back - it is the 24K rate minus
   a cut, 2-3% almost everywhere. Rather than a permanent extra block on every
   merchant, the cut is a filter: pick one and that merchant's 24K tile flips to
   the buyback; click the live chip again and it flips back to the rate.

   Deliberately NOT remembered. The board's resting state is the two rates with
   every filter off, so a reload always answers "what is gold today?" and never
   greets you with a buyback you switched on yesterday. */
const CUTS = {};

/* What a merchant keeps when they buy the metal back. Gold changes hands near
   its rate, so 2-3% covers it. Silver does not: the spread on a buyback is far
   wider, and 10-15% is the honest range - quoting a silver buyback at 2% would
   flatter it badly. So the chips follow the metal on show. */
const CUT_OPTIONS = () => (isSilver() ? [10, 15] : [2, 3]);
const cutFor = (id) => CUT_OPTIONS().includes(CUTS[id]) ? CUTS[id] : 0;

/* Which jewellers are on the board. Stored as the ones switched OFF, never as
   the ones switched on: store the "on" list and a merchant added next month
   would arrive silently unticked for everyone who ever touched the filter. */
const HIDDEN = new Set(JSON.parse(localStorage.getItem("kb-hidden") || "[]"));
const shows = (m) => !HIDDEN.has(m.id);
function setHidden(ids) {
  HIDDEN.clear();
  ids.forEach((id) => HIDDEN.add(id));
  localStorage.setItem("kb-hidden", JSON.stringify([...HIDDEN]));
  paint();
}

const $ = (id) => document.getElementById(id);
const money = (v) => v == null ? null :
  "₹" + Math.round(v * UNIT).toLocaleString("en-IN");

function snack(msg) {
  $("snackText").textContent = msg;
  $("snack").classList.add("show");
  clearTimeout(snack._t);
  snack._t = setTimeout(() => $("snack").classList.remove("show"), 2600);
}

/* ---- theme ---- */
const theme = localStorage.getItem("kb-theme") || "light";
document.documentElement.dataset.theme = theme;
$("themeBtn").onclick = () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("kb-theme", next);
};

/* ---- unit switch ---- */
document.querySelectorAll(".seg button").forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll(".seg button").forEach((x) => x.classList.remove("on"));
    b.classList.add("on");
    UNIT = Number(b.dataset.unit);
    localStorage.setItem("kb-unit", UNIT);
    paint();
  };
});
{
  const saved = localStorage.getItem("kb-unit");
  if (saved === "10") document.querySelector('.seg button[data-unit="10"]').click();
}

/* ---- the metal switch ---- */
function applyMetal(next, save) {
  METAL = next === "silver" ? "silver" : "gold";
  document.documentElement.dataset.metal = METAL;
  const fav = $("favicon"), tc = $("themeColor");
  if (fav) fav.href = isSilver() ? "favicon-silver.svg" : "favicon.svg";
  if (tc) tc.content = isSilver() ? "#4c6072" : "#8a5f14";
  document.querySelectorAll("#metalSeg button").forEach(
    (b) => b.classList.toggle("on", b.dataset.metal === METAL));
  // the knob rides to the right half for silver; CSS does the travelling
  const seg = $("metalSeg");
  if (seg) seg.classList.toggle("right", isSilver());
  // 3% means nothing once the chips read 10 and 15, so a switch clears them.
  Object.keys(CUTS).forEach((k) => delete CUTS[k]);
  if (save) localStorage.setItem("kb-metal", METAL);
}
document.querySelectorAll("#metalSeg button").forEach((b) => {
  b.onclick = () => { applyMetal(b.dataset.metal, true); paint(); };
});
applyMetal(localStorage.getItem("kb-metal") || "gold", false);

/* ---- time helpers ---- */
function ago(iso) {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return mins + " min ago";
  const h = Math.round(mins / 60);
  if (h < 24) return h + (h === 1 ? " hour ago" : " hours ago");
  return Math.round(h / 24) + "d ago";
}
function clock(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN",
    { hour: "2-digit", minute: "2-digit", hour12: true });
}

/* ---- data ----
   Two homes, one page. Run locally and it talks to the Python; published to a
   static host there is no Python, so it reads the rates.json a scheduled build
   left behind. The board looks the same either way - only the buttons that need
   a backend go quiet. */
let STATIC = false;

async function load() {
  if (!STATIC) {
    try {
      const r = await fetch("/api/state");
      if (r.ok) { STATE = await r.json(); paint(); return; }
    } catch (e) { /* no backend here - fall through to the snapshot */ }
    STATIC = true;
    document.body.classList.add("is-static");
  }
  const r = await fetch("rates.json?t=" + Date.now());
  if (!r.ok) throw new Error("no rates.json");
  STATE = await r.json();
  paint();
}

async function refresh(id) {
  await fetch("/api/refresh", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(id ? { id } : {}),
  });
  snack(id ? "Re-reading that merchant…" : "Re-reading every merchant…");
  // A full pass walks eight sites politely; poll until it settles.
  for (let i = 0; i < 40; i++) {
    await new Promise((res) => setTimeout(res, 1500));
    await load();
    if (!STATE.refreshing) break;
  }
}
$("refreshBtn").onclick = () => refresh(null);

/* ---- painting ---- */
const has = (m) => (m.rate && (rateOf(m.rate) || (!isSilver() && m.rate.buy22))) ? 1 : 0;

function paint() {
  if (!STATE) return;
  // Everything below reckons on the picked merchants only. "Cheapest 24K"
  // across jewellers you have switched off would be a number about nobody.
  // In silver, the board is only the merchants who publish silver at all.
  const ms = STATE.merchants.filter(shows).filter((m) => !isSilver() || publishes(m));
  paintPicker();

  // The cheapest live rate on the board, ignoring anything that failed.
  const live = ms.filter((m) => m.rate && rateOf(m.rate));
  const best = live.length ? Math.min(...live.map((m) => rateOf(m.rate))) : null;
  const high = live.length ? Math.max(...live.map((m) => rateOf(m.rate))) : null;
  const live22 = ms.filter((m) => m.rate && m.rate.buy22);
  const best22 = live22.length ? Math.min(...live22.map((m) => m.rate.buy22)) : null;

  paintHeads(live, best, best22, high, ms);

  // Merchants with no numbers sink to the bottom, so the rates you came for are
  // the first thing on screen. Within each group the merchants.json order holds
  // (Array#sort is stable).
  const ordered = [...ms].sort((a, b) => has(b) - has(a));
  $("board").innerHTML = "";
  if (!ordered.length) {
    $("board").innerHTML =
      '<div class="board-empty">' + (isSilver()
        ? "None of the picked jewellers publishes a silver rate."
        : "No jewellers picked.") +
      '<div><button class="btn btn-tonal btn-sm" id="emptyAll">Show them all</button></div></div>';
    $("emptyAll").onclick = () => setHidden([]);
  }
  ordered.forEach((m) => $("board").appendChild(card(m, best)));

  const busy = STATE.refreshing;
  $("status").querySelector(".dot").className = "dot" + (busy ? " busy" : "");
  const every = STATE.refreshMinutes >= 60 && STATE.refreshMinutes % 60 === 0
    ? (STATE.refreshMinutes / 60) + (STATE.refreshMinutes === 60 ? " hour" : " hours")
    : STATE.refreshMinutes + " minutes";
  const line = busy ? "Reading merchants…"
    : "Updated " + ago(STATE.lastRefresh) +
      (STATIC ? " · refreshes through the day" : " · re-reads itself every " + every);
  $("status").title = line;
  $("statusText").textContent = line;
  $("refreshBtn").disabled = busy;
  $("refreshBtn").hidden = STATIC;
}

/* The market in the top bar: international spot and Indian 999 bullion, off
   one bullion dealer's ticker. Gold only - the feed carries no silver pair. */
function paintMarket() {
  const mk = STATE.market, el = $("mkt");
  if (isSilver() || !mk || !(mk.spot || mk.bullion)) { el.hidden = true; return; }
  const asOf = (mk.source || "Market feed") + (mk.stale ? " · last read " : " · ") + clock(mk.fetched);
  const perGram = mk.spot && mk.usdinr ? mk.spot * mk.usdinr / 31.1035 : null;
  const q = [];
  if (mk.spot) q.push(`<span class="q" title="International spot, USD per troy ounce` +
    (perGram ? ` - about ${money(perGram)}${UNIT === 10 ? " per 10 g" : " a gram"} before duty and GST` : "") +
    ` · ${esc(asOf)}"><span class="ql">Gold spot</span><span class="qv">$` +
    mk.spot.toLocaleString("en-US", { minimumFractionDigits: 2 }) + `<small>/oz</small></span></span>`);
  if (mk.bullion) q.push(`<span class="q" title="999 bullion, BIS · ${esc(asOf)}">` +
    `<span class="ql">999 BIS</span><span class="qv">${money(mk.bullion)}` +
    `<small>${UNIT === 10 ? "/10 g" : "/g"}</small></span></span>`);
  el.innerHTML = q.join("");
  el.hidden = false;
}

function paintHeads(live, best, best22, high, ms) {
  paintMarket();
  const cheapest = live.find((m) => rateOf(m.rate) === best);
  const spread = (best != null && high != null) ? high - best : null;
  const dearest = live.find((m) => rateOf(m.rate) === high);
  const heads = isSilver() ? [
    { k: "Cheapest silver", ks: "Low", v: money(best), w: cheapest ? cheapest.name : "no rate yet" },
    { k: "Dearest silver", ks: "High", v: money(high), w: dearest ? dearest.name : "no rate yet" },
  ] : [
    { k: "Cheapest 24K", ks: "Low 24K", v: money(best), w: cheapest ? cheapest.name : "no rate yet" },
    { k: "Cheapest 22K", ks: "Low 22K", v: money(best22),
      w: (() => { const c = ms.find((m) => m.rate && m.rate.buy22 === best22);
                  return c ? c.name : "no rate yet"; })() },
  ];
  heads.push({ k: "Spread across the board", ks: "Spread", v: spread == null ? null : money(spread),
               w: live.length + " of " + ms.length + " merchants reporting",
               ws: live.length + "/" + ms.length + " live" });
  // ks/ws are the phone labels - the CSS swaps them in when the cards share a row.
  $("heads").innerHTML = heads.map((h) => `
    <div class="head" title="${esc(h.w)}">
      <span class="k"><span class="k-l">${h.k}</span><span class="k-s">${h.ks}</span></span>
      <span class="v">${h.v || "—"}</span>
      <span class="w"><span class="w-l">${esc(h.w)}</span><span class="w-s">${esc(h.ws || h.w)}</span></span>
    </div>`).join("");
}

/* ---- The jeweller picker ----
   One button, three ways in: type to search, tick to multi-select, or "Only" to
   narrow to a single jeweller in one click. The list is rebuilt from STATE each
   paint so a merchant added to merchants.json shows up here without touching
   this file. */
/* Ticks go into a DRAFT, not onto the board. Committing each tick as it
   happened meant the board repainted under you once per jeweller - and the
   list, rebuilt each time, threw away its scroll position, so picking five
   meant five repaints and five hunts back down the list. The draft lives only
   while the popover is open; closing it without pressing Apply throws it away. */
let DRAFT = null;
const draftShows = (m) => !(DRAFT || HIDDEN).has(m.id);
const draftDirty = () =>
  DRAFT && (DRAFT.size !== HIDDEN.size || [...DRAFT].some((id) => !HIDDEN.has(id)));

function paintPicker() {
  const all = STATE.merchants;
  const on = all.filter(shows);
  const label = on.length === all.length ? "All jewellers"
    : on.length === 1 ? (on[0].short || on[0].name)
    : on.length + " of " + all.length;
  $("pickLabel").textContent = label;
  $("pickBtn").classList.toggle("some", on.length !== all.length);

  const picked = all.filter(draftShows);
  $("pickCount").textContent = picked.length + " of " + all.length +
    (draftDirty() ? " picked" : " shown");
  $("pickApply").disabled = !draftDirty();

  const q = $("pickSearch").value.trim().toLowerCase();
  const rows = all.filter((m) =>
    !q || (m.name + " " + (m.short || "")).toLowerCase().includes(q));

  const list = $("pickList");
  if (!rows.length) {
    list.innerHTML = '<div class="pop-empty">No jeweller by that name.</div>';
    return;
  }
  // Rebuilt in place, scroll kept: the list must not jump to the top between
  // one tick and the next.
  const top = list.scrollTop;
  list.innerHTML = rows.map((m) => `
    <button class="pop-row ${draftShows(m) ? "on" : ""} ${draftShows(m) ? "" : "draft-off"}"
            data-id="${esc(m.id)}" role="checkbox" aria-checked="${draftShows(m)}">
      <span class="tick">
        <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
          <path fill="currentColor" d="M9.6 16.2 5.4 12l-1.4 1.4 5.6 5.6L20.4 7.8 19 6.4z"/>
        </svg>
      </span>
      <span class="mark">${mark(m)}</span>
      <span class="rn">${esc(m.name)}</span>
      <span class="only" data-only="${esc(m.id)}" role="button" tabindex="0">ONLY</span>
    </button>`).join("");
  list.scrollTop = top;

  list.querySelectorAll(".pop-row").forEach((row) => {
    row.onclick = (ev) => {
      if (!DRAFT) DRAFT = new Set(HIDDEN);
      const only = ev.target.closest("[data-only]");
      if (only) {
        DRAFT = new Set(all.map((m) => m.id).filter((id) => id !== only.dataset.only));
      } else {
        const id = row.dataset.id;
        DRAFT.has(id) ? DRAFT.delete(id) : DRAFT.add(id);
      }
      paintPicker();
    };
  });
}

{
  const picker = $("picker");
  const openPicker = (open) => {
    picker.classList.toggle("open", open);
    $("pickPop").hidden = !open;
    $("pickBtn").setAttribute("aria-expanded", String(open));
    // Opening starts a fresh draft; closing abandons whatever was not applied.
    DRAFT = open ? new Set(HIDDEN) : null;
    if (!open) $("pickSearch").value = "";
    paintPicker();
    if (open) $("pickSearch").focus();
  };
  const apply = () => {
    if (!draftDirty()) return;
    const n = STATE.merchants.filter(draftShows).length;
    setHidden([...DRAFT]);
    openPicker(false);
    snack(n === STATE.merchants.length ? "Showing every jeweller"
      : n === 1 ? "Showing one jeweller"
      : "Showing " + n + " jewellers");
  };
  $("pickBtn").onclick = () => openPicker($("pickPop").hidden);
  $("pickSearch").oninput = () => paintPicker();
  $("pickApply").onclick = apply;
  $("pickAll").onclick = () => { DRAFT = new Set(); paintPicker(); };
  $("pickNone").onclick = () => {
    DRAFT = new Set(STATE.merchants.map((m) => m.id));
    paintPicker();
  };
  // Dismiss on mousedown, not click: a tick rebuilds the list under the
  // pointer, so by the time a click has bubbled to the document its target is
  // detached and contains() would say "outside" for a press that was inside.
  document.addEventListener("mousedown", (ev) => {
    if (!picker.contains(ev.target)) openPicker(false);
  });
  document.addEventListener("keydown", (ev) => {
    if ($("pickPop").hidden) return;
    if (ev.key === "Escape") { openPicker(false); $("pickBtn").focus(); }
    // Enter commits the whole draft, wherever the focus is in the popover.
    if (ev.key === "Enter" && ev.target !== $("pickSearch")) apply();
  });
  // Enter on a one-hit search ticks that one; a second Enter, with the search
  // now showing more than one row again, commits.
  $("pickSearch").onkeydown = (ev) => {
    if (ev.key !== "Enter") return;
    const rows = $("pickList").querySelectorAll(".pop-row");
    if (rows.length === 1) { rows[0].click(); $("pickSearch").value = ""; paintPicker(); }
    else apply();
  };
}

/* ---- Merchant marks ----
   The drawings live in marks.js (MARKS), shared with /broadcast/. */
function mark(m) {
  const art = MARKS[m.id];
  if (!art) return esc(initials(m.short));
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"
               stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${art}</svg>`;
}

function card(m, best24) {
  const r = m.rate || {};
  const el = document.createElement("article");
  el.className = "card";
  if (m.note) el.title = m.note;
  const isBest = rateOf(r) && rateOf(r) === best24;
  if (isBest) el.classList.add("best");
  if (!rateOf(r) && !(isSilver() ? false : r.buy22)) el.classList.add("dim");

  let state = "off", why = "no automatic source";
  if (r.ok && r.manual) { state = "ok"; why = "keyed in by hand"; }
  else if (r.ok) { state = "ok"; why = "read from the site"; }
  else if (r.stale) {
    // Why it could not be re-read is our problem, not the reader's. The
    // timestamp underneath already says how old the number is.
    state = "stale";
    why = "last good read";
  }
  else if (r.error && !r.linkOnly) { state = "err"; why = "could not be read"; }


  // Buyback is always reckoned on 24K - purity is what a buyback is priced off.
  // The 22K figure stays put; it is there so you know the counter price.
  const cut = cutFor(m.id);

  el.innerHTML = `
    ${isBest ? `<span class="badge">CHEAPEST ${isSilver() ? "SILVER" : "24K"}</span>` :
      r.manual ? '<span class="badge manual">MANUAL</span>' : ""}
    <div class="who">
      <span class="mark">${mark(m)}</span>
      <span class="nm"><b>${esc(m.name)}</b><small>${esc(why)}</small></span>
      <span class="state ${state}" title="${esc(why)}"></span>
    </div>

    <div class="rates${isSilver() ? " one" : ""}">
      <div class="rate k24 ${cut && rateOf(r) ? "buyback" : ""}">${k24Face(r, cut)}</div>
      ${isSilver() ? "" : `<div class="rate">
        <span class="kt">22K ${r.derived22
          ? '<span class="drv" title="Derived: 24K x 22/24">DERIVED</span>' : ""}</span>
        ${r.buy22 ? `<div class="amt">${money(r.buy22)}</div>` : '<div class="none">—</div>'}
        <span class="per">${UNIT === 1 ? "per gram" : "per 10 g"}</span>
      </div>`}
    </div>

    ${rateOf(r) ? `<div class="cut-row"><span class="cuts">
        ${CUT_OPTIONS().map((c) => `<button data-cut="${c}" class="${cut === c ? "on" : ""}"
          title="Flip the tile to what they would pay you, ${c}% under">${c}% cut</button>`).join("")}
      </span></div>` : ""}

    ${!isSilver() && m.spark && m.spark.length > 2 ? spark(m.spark) : ""}



    <div class="foot">
      <span class="when">${(r.buy24 || r.buy22)
        ? "as of " + clock(r.fetched) + " · " + ago(r.fetched)
        : "no rate on the board yet"}</span>
      <span class="acts">
        ${m.hideLink ? "" : `<button title="Open ${esc(m.short)}" data-act="open">
          <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14V3ZM5 5h5v2H6.5v10.5H17V14h2v5.5H5V5Z"/></svg>
        </button>`}
        ${STATIC ? "" : `<button title="Key in a rate by hand" data-act="manual">
          <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M4 20h4L18.5 9.5l-4-4L4 16v4Zm14.7-11.8 1.6-1.6a1.4 1.4 0 0 0 0-2l-2-2a1.4 1.4 0 0 0-2 0l-1.6 1.6 4 4Z"/></svg>
        </button>`}
        ${(!STATIC && m.adapter !== "link_only") ? `<button title="Re-read just this one" data-act="reload">
          <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7Z"/></svg>
        </button>` : ""}
      </span>
    </div>`;

  el.querySelectorAll(".cuts button").forEach((b) => {
    b.onclick = () => {
      const want = Number(b.dataset.cut);
      CUTS[m.id] = cutFor(m.id) === want ? 0 : want;   // clicking the live chip turns it off
      const now = cutFor(m.id);
      el.querySelectorAll(".cuts button")
        .forEach((x) => x.classList.toggle("on", Number(x.dataset.cut) === now));
      flipK24(el, r, now);
    };
  });
  const op = el.querySelector('[data-act="open"]');
  if (op) op.onclick = () => window.open(m.site, "_blank", "noopener");
  const mn = el.querySelector('[data-act="manual"]');
  if (mn) mn.onclick = () => openManual(m);
  const rl = el.querySelector('[data-act="reload"]');
  if (rl) rl.onclick = () => refresh(m.id);
  return el;
}

/* The two faces of the headline tile: the rate on show, or the buyback under
   it. In silver there is one purity worth quoting - 999 fine - so the tile
   carries that instead of 24K, and the buyback is reckoned on it. */
function k24Face(r, cut) {
  const per = UNIT === 1 ? "per gram" : "per 10 g";
  const rate = rateOf(r);
  const label = isSilver() ? "Silver 999" : "24K";
  if (cut && rate) {
    return `<span class="kt">Buyback · ${cut}% cut</span>
            <div class="amt">${money(rate * (1 - cut / 100))}</div>
            <span class="per">${per}</span>`;
  }
  return `<span class="kt">${label} ${(!isSilver() && r.derived24)
            ? '<span class="drv" title="Derived: 22K x 24/22">DERIVED</span>' : ""}</span>
          ${rate ? `<div class="amt">${money(rate)}</div>` : '<div class="none">—</div>'}
          <span class="per">${per}</span>`;
}

/* Turn the tile over, and change the face while its back is to you. */
function flipK24(el, r, cut) {
  const tile = el.querySelector(".rate.k24");
  tile.classList.add("flip");
  setTimeout(() => {
    tile.innerHTML = k24Face(r, cut);
    tile.classList.toggle("buyback", !!cut && !!rateOf(r));
  }, 185);
  setTimeout(() => tile.classList.remove("flip"), 420);
}

/* A 24-point trace of where this merchant's 24K rate has been. No axes, no
   labels — it is there to answer "is this one drifting?" at a glance. */
function spark(vals) {
  const w = 240, h = 24, lo = Math.min(...vals), hi = Math.max(...vals);
  const span = (hi - lo) || 1;
  const pts = vals.map((v, i) =>
    `${(i / (vals.length - 1) * w).toFixed(1)},${(h - 2 - ((v - lo) / span) * (h - 5)).toFixed(1)}`);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <polyline points="${pts.join(" ")}" fill="none" stroke="currentColor"
                stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" opacity=".85"/>
    </svg>`;
}

/* ---- manual entry ---- */
function openManual(m) {
  manualFor = m;
  $("mTitle").textContent = m.name;
  $("mSub").textContent = m.adapter === "link_only"
    ? "This site does not hand its rate over. Open it, read the numbers, drop them in here — the board keeps them until you clear them."
    : "A hand-keyed rate overrides whatever was read from the site.";
  // Sites quote in whatever unit they like - Aspect prints per 10 g, Tanishq per
  // gram - so the fields speak in whatever unit the board is currently showing.
  const per = UNIT === 1 ? "/ g" : "/ 10 g";
  document.querySelector('label[for="m22"]').textContent = "22K buy " + per;
  document.querySelector('label[for="m24"]').textContent = "24K buy " + per;
  document.querySelector('label[for="s22"]').textContent = "22K sell " + per;
  document.querySelector('label[for="s24"]').textContent = "24K sell " + per;

  const r = (m.rate && m.rate.manual) ? m.rate : {};
  const show = (v) => v ? Math.round(v * UNIT) : "";
  $("m22").value = show(r.derived22 ? null : r.buy22);
  $("m24").value = show(r.derived24 ? null : r.buy24);
  $("s22").value = show(r.sell22);
  $("s24").value = show(r.sell24);
  $("manualScrim").hidden = false;
  $("m22").focus();
}
$("mCancel").onclick = () => { $("manualScrim").hidden = true; };
$("manualScrim").onclick = (e) => { if (e.target === $("manualScrim")) $("manualScrim").hidden = true; };
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("manualScrim").hidden) $("manualScrim").hidden = true;
});
$("mSave").onclick = async () => {
  const perGram = (v) => {
    const n = parseFloat(String(v).replace(/[^\d.]/g, ""));
    return isFinite(n) && n > 0 ? String(n / UNIT) : "";
  };
  const body = {
    id: manualFor.id, buy22: perGram($("m22").value), buy24: perGram($("m24").value),
    sell22: perGram($("s22").value), sell24: perGram($("s24").value),
  };
  STATE = await (await fetch("/api/manual", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })).json();
  $("manualScrim").hidden = true;
  paint();
  snack("Saved — " + manualFor.short + " is now showing your rate");
};
$("mClear").onclick = async () => {
  STATE = await (await fetch("/api/manual", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: manualFor.id, clear: true }),
  })).json();
  $("manualScrim").hidden = true;
  paint();
  snack("Cleared — back to whatever the site says");
};

/* ---- odds and ends ---- */
function initials(name) {
  return name.replace(/[^A-Za-z ]/g, "").split(/\s+/).filter(Boolean)
    .slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}
/* Whatever the server sends, a tile shows one short plain line. The server
   already tidies these, but a page on the open internet should not depend on
   that being true of every future error. */
function humanErr(msg) {
  const flat = String(msg || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (!flat) return "could not be read";
  return flat.length > 110 ? flat.slice(0, 110).trimEnd() + "…" : flat;
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

load().catch((e) => {
  $("statusText").textContent = "Could not load the rates";
  console.error(e);
});
// Keeps "updated N min ago" honest, and on the hosted page picks up each new
// build within a minute of it landing.
setInterval(() => load().catch(() => {}), 60000);
