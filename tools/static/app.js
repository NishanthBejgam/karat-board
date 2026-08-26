/* Karat Board — the screen. One fetch of /api/state paints everything. */

let STATE = null;
let UNIT = 1;               // 1 = per gram, 10 = per 10 grams
let manualFor = null;

/* No jeweller publishes what they will pay you back - it is the 24K rate minus
   a cut, 2-3% almost everywhere. Rather than a permanent extra block on every
   merchant, the cut is a filter: pick one and that merchant's 24K tile flips to
   the buyback; click the live chip again and it flips back to the rate.

   Deliberately NOT remembered. The board's resting state is the two rates with
   every filter off, so a reload always answers "what is gold today?" and never
   greets you with a buyback you switched on yesterday. */
const CUTS = {};
const cutFor = (id) => (CUTS[id] === 2 || CUTS[id] === 3) ? CUTS[id] : 0;

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
const has = (m) => (m.rate && (m.rate.buy24 || m.rate.buy22)) ? 1 : 0;

function paint() {
  if (!STATE) return;
  const ms = STATE.merchants;

  // The cheapest live 24K on the board, ignoring anything that failed.
  const live = ms.filter((m) => m.rate && m.rate.buy24);
  const best24 = live.length ? Math.min(...live.map((m) => m.rate.buy24)) : null;
  const live22 = ms.filter((m) => m.rate && m.rate.buy22);
  const best22 = live22.length ? Math.min(...live22.map((m) => m.rate.buy22)) : null;
  const high24 = live.length ? Math.max(...live.map((m) => m.rate.buy24)) : null;

  paintHeads(live, best24, best22, high24);

  // Merchants with no numbers sink to the bottom, so the rates you came for are
  // the first thing on screen. Within each group the merchants.json order holds
  // (Array#sort is stable).
  const ordered = [...ms].sort((a, b) => has(b) - has(a));
  $("board").innerHTML = "";
  ordered.forEach((m) => $("board").appendChild(card(m, best24)));

  const busy = STATE.refreshing;
  $("status").querySelector(".dot").className = "dot" + (busy ? " busy" : "");
  const every = STATE.refreshMinutes >= 60 && STATE.refreshMinutes % 60 === 0
    ? (STATE.refreshMinutes / 60) + (STATE.refreshMinutes === 60 ? " hour" : " hours")
    : STATE.refreshMinutes + " minutes";
  const line = busy ? "Reading merchants…"
    : "Updated " + ago(STATE.lastRefresh) +
      (STATIC ? " · refreshes every " : " · re-reads itself every ") + every;
  $("status").title = line;
  $("statusText").textContent = line;
  $("refreshBtn").disabled = busy;
  $("refreshBtn").hidden = STATIC;
}

function paintHeads(live, best24, best22, high24) {
  const cheapest = live.find((m) => m.rate.buy24 === best24);
  const spread = (best24 != null && high24 != null) ? high24 - best24 : null;
  const heads = [
    { k: "Cheapest 24K", v: money(best24), w: cheapest ? cheapest.name : "no rate yet" },
    { k: "Cheapest 22K", v: money(best22),
      w: (() => { const c = STATE.merchants.find((m) => m.rate && m.rate.buy22 === best22);
                  return c ? c.name : "no rate yet"; })() },
    { k: "Spread across the board", v: spread == null ? null : money(spread),
      w: live.length + " of " + STATE.merchants.length + " merchants reporting" },
  ];
  $("heads").innerHTML = heads.map((h) => `
    <div class="head">
      <span class="k">${h.k}</span>
      <span class="v">${h.v || "—"}</span>
      <span class="w">${esc(h.w)}</span>
    </div>`).join("");
}

/* ---- Merchant marks ----
   Each merchant's own favicon was fetched at first, and eight logos in eight
   brand colours (Malabar maroon, PNG purple, BRPL orange…) fought the gold
   board. So every mark is redrawn here in ONE language: a 24x24 grid, the same
   stroke weight, all of it inheriting the board's bronze, with secondary strokes
   dropped to 45-55% so each mark has some depth rather than reading as wire.

   The SHAPE is the merchant's own, traced off their actual logo - Malabar's
   ringed M with the centre dot, Tanishq's flared T, Kalyan's twin ribbon sweeps,
   MMTC-PAMP's lettered coin, Aspect's notched block, PNG's interlocking bands,
   Bhima's serif B with its detached dot and swoosh. Only the colour is ours. */
const MARKS = {
  // ringed geometric M, dot in the counter
  malabar: `<circle cx="12" cy="12" r="9.5" opacity=".45"/>
            <path d="M9 15.9V8.3M15 15.9V8.3M9 8.3l3 3.6 3-3.6"/>
            <circle cx="12" cy="13.5" r=".95" fill="currentColor" stroke="none"/>`,
  // flared T over its dot
  tanishq: `<path d="M4.4 6.4c1.1-1.6 2.3-1.6 3.5-1.6h8.2c1.2 0 2.4 0 3.5 1.6"/>
            <path d="M9.7 5.1c0 6.7-1.3 10.9-4.5 13.8"/>
            <path d="M14.3 5.1c0 6.7 1.3 10.9 4.5 13.8"/>
            <circle cx="12" cy="18.7" r="1.45" fill="currentColor" stroke="none"/>`,
  // twin ribbon sweeps off a stem
  kalyan: `<path d="M6.4 3.6v16.8"/>
           <path d="M6.4 13.6C12.6 11 17.4 6.9 19.1 3.1"/>
           <path d="M7.1 13.1C12 15.3 17.5 17.8 19.5 21.2" opacity=".55"/>`,
  // their own emblem, lifted from lalithaa_logo.svg and recoloured - the
  // only mark here that is traced rather than drawn, because they publish
  // the geometry and a hand copy would only be a worse version of it
  lalithaa: `<g><g fill="currentColor" stroke="none" transform="translate(2.46,2.00) scale(0.07143) translate(-323,-47)"><path d="M508.84,90.81c-13.61-19.41-36.76-40.85-36.76-40.85v-3.07h-6.47v3.58c-16.68,12.42-40.17,41.53-40.17,41.53-7.12-4.14-14.65-7.62-22.54-9.99-6.35-1.9-12.93-3.08-19.56-3.26-5.53-.15-11.08.38-16.46,1.65-4.58,1.08-9.03,2.68-13.26,4.75-3.49,1.71-6.82,3.74-9.94,6.04-2.29,1.69-4.48,3.53-6.52,5.52-1.5,1.46-3.36,2.94-3.67,5.15-.14.99.12,2.42,1.41,2.35,28.85-7.66,48.17,26.34,48.17,26.34,1.87,3.15,0,3.15,0,3.15-77.96,24.34-58.22,63.32-58.22,63.32,17.53,30.13,71.58,16.51,71.58,16.51,2.3,1.79.59,3.41.59,3.41-65.53,28.59-59.23,69.1-59.23,69.1,4.59,25.53,29.62,15.83,29.62,15.83,8.67-2.41,15.84-9.67,21.73-16.11,7.6-8.31,14.19-17.54,20.27-27.01.49-.76.98-1.54,1.34-2.38.29-.68.51-1.42,1.05-1.92.58-.53,1.43-.67,2.21-.55.77.13,1.48.48,2.18.84,4.39,2.29,8.52,5.03,12.55,7.9,7.91,5.65,15.68,11.58,23.09,17.87,6.56,5.57,13.13,11.14,19.69,16.7,7.54,6.4,15.16,12.75,22.58,19.26,6.48,5.68,14.96,8.75,23.46,9.66,4.91.52,9.95.36,14.68-1.08,5.16-1.57,9.77-4.6,13.89-8.06,9.2-7.73,17.75-16.73,23.15-27.58,4.84-9.73,6.93-20.79,5.14-31.56-.58-3.46-1.45-7.15-3.1-10.28l-19.66-28.08c-5.11-6.64-9.45-3.32-9.45-3.32-4.81,3.68-8.73,7.65-10.79,13.49-1.64,4.64-2.92,11.8-.47,16.28.42.76.96,1.44,1.5,2.12,5.08,6.43,10.17,12.86,15.25,19.29.27.35.55.7.67,1.12.1.36.08.74.05,1.11-.38,4.48-2.56,8.77-5.94,11.72-3.39,2.95-7.95,4.52-12.43,4.28-.47-.02-.95-.07-1.38-.28-.32-.17-.6-.42-.86-.67-6.69-6.26-13.34-12.55-20.12-18.69-3.92-3.56-8.27-6.89-11.94-10.71-31.92-33.19-72-41.19-72-41.19l.34-6.81c61.1-27.06,65.87,18.73,65.87,18.73l33.36-11.24c-39.15-66.38-95.49-27.91-95.49-27.91-2.38,1.44-2.64-.6-2.64-.6l-3.83-28.51c-1.27-2.3,1.54-1.87,1.54-1.87,1.85.15,3.7.38,5.54.65,10.95,1.62,21.65,4.85,32.05,8.56,10.82,3.85,21.41,8.35,31.83,13.18,11.05,5.13,21.91,10.67,32.58,16.53,1.34.73,2.67,1.47,3.88,2.39.81.61,1.58,1.31,2.52,1.68.95.37,2.15.33,2.83-.42.69-.75.63-1.9.53-2.91-.96-9.73-1.5-19.31-.45-29.06.94-8.79,2.98-17.46,6.22-25.69,2.77-7.01,6.4-13.68,10.8-19.8,3.76-5.24,8.07-10.08,12.82-14.45,3.83-3.54,7.95-6.77,12.3-9.65,2.97-1.97,6.04-3.79,9.23-5.39.25-.12,3.61-1.46,3.61-1.66v-4.43c-30.12-19.57-80.34,5.45-80.34,5.45ZM390.16,246.94s-12.13,26.55-31.66,42.38c0,0-2.98,1.15-3.06-1.79,0,0-1.15-31.4,32.3-42,0,0,2.8-.51,2.42,1.41ZM398.2,196.89s-19.27,2.56-30.76-4.21c0,0-12.13-5.74-2.43-20.43,0,0,6-11.61,27.45-12,0,0,1.96-.34,1.79,1.03l5.61,33.06s-.12,2.94-1.66,2.55ZM535.06,103.91s-24,24.17-34.22,57.37c0,0-34.21-21.96-86.64-26.39,0,0-1.53-.34-2.21-2.89-1.13-2.46-2.48-4.84-3.88-7.15-2.49-4.13-5.28-8.22-8.65-11.73-1.71-1.79-3.58-3.43-5.62-4.83-1.02-.7-2.08-1.36-3.19-1.91-.78-.38-2.27-.79-2.37-1.83,0-.04,0-.07,0-.11.07-.88,1.72-.55,2.25-.48,9.34.79,18.59,3.79,26.54,8.69.22.14.46.29.57.52.09.19.09.4.09.61,0,5.45-1.17,11.76,2.77,16.13,1.54,1.71,3.57,3.19,5.66,4.16,2.23,1.04,4.41.78,6.77,1.04,0,0,11.49,1.27,14.17-8.43,0-7.61,0-15.22,0-22.83,0-.54,0-1.1.1-1.64.76-4.1,5.16-9.02,7.83-12.06,1.81-2.05,3.79-3.95,5.99-5.57.88-.65,6.11-4.51,7.15-3.82,2.65,1.78,4.83,4.53,6.63,7.11,2.14,3.06,3.85,6.41,5.18,9.9,1.55,4.05,4.03,9.81,2.09,14.02-1.22,2.65-3.15,4.8-4.34,7.51-1.06,2.41-2.9,6.78-2.07,9.46,1.23,3.96,3.47,7.86,6.23,10.92,1.81,2.01,3.99,3.7,6.52,4.71.3.12.6.23.92.26.46.05.91-.06,1.36-.17,3.8-.95,7.54-2.26,10.6-4.78,2.71-2.24,4.68-5.16,5.87-8.46,1.09-2.99,1.59-6.14,2.03-9.28,0,0,.34-14.13,25.19-19.92,0,0,2.05.17.69,1.87Z"/></g></g>`,
  // the standing deer from their favicon - swept horns, head turned down,
  // the long neck into the body. Drawn rather than traced: Indriya ships the
  // deer as a raster favicon only, and their SVGs are the wordmark and a
  // petal motif.
  indriya: `<path d="M10.1 6.6c-.9-1.5-1-3.2-.4-4.9"/>
            <path d="M12.5 6.3c.4-1.8 1.5-3.2 3-4.1"/>
            <path d="M10.4 7.2c.6-.9 1.7-1 2.4-.2"/>
            <path d="M10.4 7.2c-.7.5-1.2 1.2-1.4 2"/>
            <path d="M12.8 7c.5 1.6 1 3 2 4.3"/>
            <path d="M14.8 11.3c2.3-.5 4 .5 4.6 2.4"/>
            <path d="M19.4 13.7c.5 1.7.2 3.4-.8 4.8"/>
            <path d="M14.8 11.3c-1.3 1.4-1.8 3-1.6 4.7"/>
            <path d="M13.2 16c1.6.9 3.4 1.1 5.2.6"/>
            <path d="M13.3 16.2 12.6 21"/><path d="M18.4 16.6l.4 4.4"/>
            <path d="M15.6 16.6 15.2 21" opacity=".5"/>
            <path d="M19.9 13.4c.9-.5 1.5-1.3 1.7-2.3" opacity=".5"/>`,
  // the lettered coin rim
  mmtc: `<circle cx="12" cy="12" r="9.3"/><circle cx="12" cy="12" r="4.5" opacity=".9"/>
         <g opacity=".5" stroke-width="1.5">
           <path d="M18.4 12h1.7M16.5 16.5l1.2 1.2M12 18.4v1.7M7.5 16.5l-1.2 1.2"/>
           <path d="M5.6 12H3.9M7.5 7.5 6.3 6.3M12 5.6V3.9M16.5 7.5l1.2-1.2"/>
         </g>`,
  // notched corner block with its offset square
  aspect: `<path d="M9.2 4.4h10.4v15.2h-5.2V9.4H9.2z"/>
           <path d="M4.4 15.1h4.5v4.5H4.4z" opacity=".55"/>`,
  // R over the shoulder of a B
  brpl: `<path d="M6.5 5.2v14.2" opacity=".45"/>
         <path d="M9.4 19.4V5.2h4.2a3.7 3.7 0 0 1 0 7.4H9.4"/>
         <path d="m13.5 12.6 4.6 6.8"/>`,
  // two interlocking bands
  png: `<circle cx="9.2" cy="12" r="5.6"/><circle cx="14.8" cy="12" r="5.6"/>`,
  // serif B, detached dot, swoosh
  bhima: `<path d="M9 4.8v11.4"/>
          <path d="M9 4.8h3.4a2.8 2.8 0 0 1 0 5.6H9"/>
          <path d="M9 10.4h3.9a2.9 2.9 0 0 1 0 5.8H9"/>
          <circle cx="6.1" cy="8.9" r="1.25" fill="currentColor" stroke="none"/>
          <path d="M4.3 19.5c4.7-2.3 10.7-2.3 15.4 0" opacity=".55"/>`,
};

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
  const isBest = r.buy24 && r.buy24 === best24;
  if (isBest) el.classList.add("best");
  if (!r.buy24 && !r.buy22) el.classList.add("dim");

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
    ${isBest ? '<span class="badge">CHEAPEST 24K</span>' :
      r.manual ? '<span class="badge manual">MANUAL</span>' : ""}
    <div class="who">
      <span class="mark">${mark(m)}</span>
      <span class="nm"><b>${esc(m.name)}</b><small>${esc(why)}</small></span>
      <span class="state ${state}" title="${esc(why)}"></span>
    </div>

    <div class="rates">
      <div class="rate k24 ${cut && r.buy24 ? "buyback" : ""}">${k24Face(r, cut)}</div>
      <div class="rate">
        <span class="kt">22K ${r.derived22
          ? '<span class="drv" title="Derived: 24K x 22/24">DERIVED</span>' : ""}</span>
        ${r.buy22 ? `<div class="amt">${money(r.buy22)}</div>` : '<div class="none">—</div>'}
        <span class="per">${UNIT === 1 ? "per gram" : "per 10 g"}</span>
      </div>
    </div>

    ${r.buy24 ? `<div class="cut-row"><span class="cuts">
        <button data-cut="2" class="${cut === 2 ? "on" : ""}"
                title="Flip the 24K tile to what they would pay you, 2% under">2% cut</button>
        <button data-cut="3" class="${cut === 3 ? "on" : ""}"
                title="Flip the 24K tile to what they would pay you, 3% under">3% cut</button>
      </span></div>` : ""}

    ${m.spark && m.spark.length > 2 ? spark(m.spark) : ""}



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

/* The two faces of the 24K tile. */
function k24Face(r, cut) {
  const per = UNIT === 1 ? "per gram" : "per 10 g";
  if (cut && r.buy24) {
    return `<span class="kt">Buyback · ${cut}% cut</span>
            <div class="amt">${money(r.buy24 * (1 - cut / 100))}</div>
            <span class="per">${per}</span>`;
  }
  return `<span class="kt">24K ${r.derived24
            ? '<span class="drv" title="Derived: 22K x 24/22">DERIVED</span>' : ""}</span>
          ${r.buy24 ? `<div class="amt">${money(r.buy24)}</div>` : '<div class="none">—</div>'}
          <span class="per">${per}</span>`;
}

/* Turn the tile over, and change the face while its back is to you. */
function flipK24(el, r, cut) {
  const tile = el.querySelector(".rate.k24");
  tile.classList.add("flip");
  setTimeout(() => {
    tile.innerHTML = k24Face(r, cut);
    tile.classList.toggle("buyback", !!cut && !!r.buy24);
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
