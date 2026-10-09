/* Karat Board — the broadcast image.

   One PNG that says the whole board at a glance, made to be pasted into a
   WhatsApp channel: the trend since yesterday, the best buy on a gold ribbon,
   and every jeweller's 24K and 22K in one table. Gold only, per gram, every
   merchant regardless of the picker - it is "the board", not one visitor's view.

   Drawn on a canvas rather than screenshotted from the page, so it looks the
   same from a phone, a laptop or a dark-themed browser. Laid out at 540 px wide
   and painted at 2x, which lands on WhatsApp's 1080 px. Uses the board's own
   pieces: Inter, the bullion-bar mark, the foil, and MARKS from app.js.

   "Yesterday" is the last reading before midnight IST, from daily.json - one
   close per day, kept by tools/daily.py. Locally there is no daily.json, so the
   image simply leaves out the trend and the day column. */

const BC_W = 540, BC_SCALE = 2, BC_PAD = 20;
// Refiners quote a minted coin with its premium in, not a shop's rate. They get
// their own section and never count towards "typical" or "best".
const REFINERS = new Set(["mmtc", "brpl"]);
const BCC = {
  ink: "#241c10", sub: "#5d5140", faint: "#8a7b64", line: "#e0d5c1",
  bronze: "#8a5f14", tint: "#f3ece0", best: "#f6e7c6", ivory: "#faf6ee",
  up: "#b3401e", upBg: "#fbe3d9", dn: "#0b7350", dnBg: "#e2f1ea",
};
const BC_FONT = '"Inter", "Segoe UI", Roboto, system-ui, sans-serif';
const BC_BARS = `<path d="M9.6 4.6h6.2l1.5 4.2H8.1z" fill="#fff" fill-opacity=".28"/>
  <path d="M4.4 11.1h6.2l1.5 4.2H2.9z" fill="#fff" fill-opacity=".28"/>
  <path d="M13.4 11.1h6.2l1.5 4.2h-9.2z" fill="#fff" fill-opacity=".28"/>
  <path d="M8.9 17.6h6.2l1.5 4.2H7.4z" fill="#fff" fill-opacity=".28"/>`;

const rs = (v) => "₹" + Math.round(v).toLocaleString("en-IN");
const median = (xs) => {
  const s = xs.filter((x) => x != null).sort((a, b) => a - b);
  if (!s.length) return null;
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};

/* ---- the numbers ---- */
function broadcastData(state, daily) {
  const all = state.merchants.filter((m) => m.rate && m.rate.buy24)
    .map((m) => ({ id: m.id, name: m.short || m.name, full: m.name,
                   b24: m.rate.buy24, b22: m.rate.buy22 }))
    .sort((a, b) => a.b24 - b.b24);
  const shops = all.filter((m) => !REFINERS.has(m.id));
  const refs = all.filter((m) => REFINERS.has(m.id));
  const typ24 = median(shops.map((m) => m.b24));
  const typ22 = median(shops.map((m) => m.b22));
  const best24 = shops[0] || null;
  const best22 = shops.filter((m) => m.b22).sort((a, b) => a.b22 - b.b22)[0] || null;

  const when = state.lastRefresh || state.builtAt || state.now;
  const today = (state.builtAt || state.now || "").slice(0, 10);
  const days = (daily && daily.days) || {};
  const past = Object.keys(days).filter((d) => d < today).sort();
  const yday = past.length ? days[past[past.length - 1]] : null;

  let trend = null, spotPct = null;
  if (yday) {
    const ym = yday.merchants || {};
    all.forEach((m) => {
      const y = ym[m.id] && ym[m.id].buy24;
      if (y) m.d24 = m.b24 - y;
    });
    const yTyp = median(shops.map((m) => ym[m.id] && ym[m.id].buy24));
    if (yTyp && typ24) trend = typ24 - yTyp;
    const spot = state.market && state.market.spot;
    if (spot && yday.spot) spotPct = (spot - yday.spot) / yday.spot * 100;
  }
  // The 7-day line: each past day's typical 24K at its close, then today's.
  const series = past.slice(-6).map((d) => {
    const ym = days[d].merchants || {};
    return median(shops.map((m) => ym[m.id] && ym[m.id].buy24));
  }).filter((v) => v != null);
  if (typ24) series.push(typ24);

  return { shops, refs, typ24, typ22, best24, best22, when, trend, spotPct,
           series, spot: state.market && state.market.spot };
}

/* ---- drawing helpers ---- */
function bcFont(ctx, weight, px) { ctx.font = `${weight} ${px}px ${BC_FONT}`; }

// Canvas letterSpacing is not everywhere yet (Safari), so tracked caps are set
// a letter at a time. Returns the width drawn.
function bcTracked(ctx, str, x, y, track, align) {
  const w = [...str].reduce((s, c) => s + ctx.measureText(c).width + track, -track);
  let cx = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
  const keep = ctx.textAlign;
  ctx.textAlign = "left";
  for (const c of str) { ctx.fillText(c, cx, y); cx += ctx.measureText(c).width + track; }
  ctx.textAlign = keep;
  return w;
}

// A line of differently styled runs: [[text, weight, px, colour], ...].
function bcRuns(ctx, runs, x, y) {
  ctx.textAlign = "left";
  for (const [t, w, px, col] of runs) {
    bcFont(ctx, w, px); ctx.fillStyle = col; ctx.fillText(t, x, y);
    x += ctx.measureText(t).width;
  }
  return x;
}

function bcRound(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function bcBrandGrad(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, "#f6d06a"); g.addColorStop(.48, "#c9971f"); g.addColorStop(1, "#8a5f14");
  return g;
}
function bcFoil(ctx, x, w) {
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  [[0, "#8a5f14"], [.38, "#c9971f"], [.52, "#f0cd7a"], [.66, "#c9971f"], [1, "#8a5f14"]]
    .forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}

function bcFit(ctx, str, max) {
  if (ctx.measureText(str).width <= max) return str;
  while (str.length > 1 && ctx.measureText(str + "…").width > max) str = str.slice(0, -1);
  return str + "…";
}

// SVG strings to images, once. Marks are stroked in currentColor, so the colour
// rides on the root's color attribute.
const BC_IMG = {};
function bcSvg(key, inner, color, strokeW) {
  const k = key + color;
  if (!BC_IMG[k]) BC_IMG[k] = new Promise((ok) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="96" height="96"
      color="${color}" fill="none" stroke="currentColor" stroke-width="${strokeW || 1.75}"
      stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ok(null);       // a missing mark leaves a blank tile, not a broken image
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
  return BC_IMG[k];
}
const bcMark = (id, color) => MARKS[id] ? bcSvg(id, MARKS[id], color) : Promise.resolve(null);

// A trending arrow on the 24-unit grid, drawn rather than loaded.
function bcArrow(ctx, x, y, size, dir, color) {
  const s = size / 24;
  const P = dir > 0
    ? [[[3, 17], [9, 11], [13, 15], [21, 7]], [[14, 7], [21, 7], [21, 14]]]
    : dir < 0
      ? [[[3, 7], [9, 13], [13, 9], [21, 17]], [[14, 17], [21, 17], [21, 10]]]
      : [[[4, 12], [20, 12]], [[16, 8], [20, 12], [16, 16]]];
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round";
  P.forEach((line) => {
    ctx.beginPath();
    line.forEach(([px, py], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, x + px * s, y + py * s));
    ctx.stroke();
  });
  ctx.restore();
}

/* ---- the picture ---- */
const ROW_H = 27;

async function drawBroadcast(state, daily) {
  const d = broadcastData(state, daily);
  if (!d.shops.length) throw new Error("no gold rates to share yet");
  const hasDay = d.trend != null;

  await Promise.all(["400", "600", "700", "800"].map((w) =>
    document.fonts.load(`${w} 16px Inter`).catch(() => null)));
  const ribbonIds = [...new Set([d.best24, d.best22].filter(Boolean).map((m) => m.id))];
  const [bars, marks, wmarks] = await Promise.all([
    bcSvg("bars", BC_BARS, "#fff", 1.7),
    Promise.all([...d.shops, ...d.refs].map((m) => bcMark(m.id, BCC.bronze))),
    Promise.all(ribbonIds.map((id) => bcMark(id, "#ffffff"))),
  ]);
  const markOf = {}, whiteOf = {};
  [...d.shops, ...d.refs].forEach((m, i) => { markOf[m.id] = marks[i]; });
  ribbonIds.forEach((id, i) => { whiteOf[id] = wmarks[i]; });

  const split = d.best22 && d.best24 && d.best22.id !== d.best24.id;
  // Fixed bands down to the table (header 76, trend, ribbon, savings, column
  // heads = 268), the rows, then footer 46 and the credit strip 26.
  const H = 268 + d.shops.length * ROW_H +
            (d.refs.length ? 28 + d.refs.length * ROW_H : 0) + 46 + 26;

  const cv = document.createElement("canvas");
  cv.width = BC_W * BC_SCALE; cv.height = H * BC_SCALE;
  const ctx = cv.getContext("2d");
  ctx.scale(BC_SCALE, BC_SCALE);
  ctx.textBaseline = "alphabetic";

  // ivory page with the board's warm glow in the top right
  ctx.fillStyle = BCC.ivory; ctx.fillRect(0, 0, BC_W, H);
  const glow = ctx.createRadialGradient(BC_W * .92, -30, 0, BC_W * .92, -30, 430);
  glow.addColorStop(0, "#fdf0d4"); glow.addColorStop(1, "rgba(250,246,238,0)");
  ctx.fillStyle = glow; ctx.fillRect(0, 0, BC_W, 360);

  const L = BC_PAD, R = BC_W - BC_PAD;
  let y = 18;

  /* header: the brand lockup and when */
  bcRound(ctx, L, y, 44, 44, 13); ctx.fillStyle = bcBrandGrad(ctx, L, y, 44, 44); ctx.fill();
  if (bars) ctx.drawImage(bars, L + 10, y + 10, 24, 24);
  bcFont(ctx, 800, 21); ctx.fillStyle = BCC.ink; ctx.textAlign = "left";
  ctx.fillText("Karat", L + 57, y + 21);
  const kw = ctx.measureText("Karat").width;
  bcFont(ctx, 600, 21); ctx.fillStyle = BCC.sub; ctx.fillText("Board", L + 57 + kw, y + 21);
  bcFont(ctx, 600, 10); ctx.fillStyle = BCC.sub;
  bcTracked(ctx, "MULTI JEWELLERS · ONE SCREEN", L + 57, y + 38, 1.4);

  const at = new Date(d.when || Date.now());
  const day = at.toLocaleDateString("en-IN",
    { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  const tm = at.toLocaleTimeString("en-IN",
    { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).toUpperCase();
  ctx.textAlign = "right";
  bcFont(ctx, 700, 13); ctx.fillStyle = BCC.ink; ctx.fillText(day, R, y + 18);
  bcFont(ctx, 400, 11.5); ctx.fillStyle = BCC.sub; ctx.fillText(tm + " IST · per gram", R, y + 35);

  y = 76;
  ctx.fillStyle = bcFoil(ctx, L, R - L); ctx.fillRect(L, y, R - L, 2);

  /* the trend since yesterday */
  y = 92;
  let tx = L;
  if (hasDay) {
    const dir = Math.round(d.trend) > 0 ? 1 : Math.round(d.trend) < 0 ? -1 : 0;
    const fg = dir > 0 ? BCC.up : dir < 0 ? BCC.dn : BCC.sub;
    const bg = dir > 0 ? BCC.upBg : dir < 0 ? BCC.dnBg : BCC.tint;
    bcFont(ctx, 800, 16);
    const amt = dir ? rs(Math.abs(d.trend)) : "₹0";
    const pw = 10 + 18 + 6 + ctx.measureText(amt).width + 13;
    bcRound(ctx, L, y + 2, pw, 34, 17); ctx.fillStyle = bg; ctx.fill();
    bcArrow(ctx, L + 10, y + 10, 18, dir, fg);
    ctx.fillStyle = fg; ctx.textAlign = "left"; ctx.fillText(amt, L + 34, y + 25);
    tx = L + pw + 14;
    bcFont(ctx, 700, 15.5); ctx.fillStyle = BCC.ink;
    ctx.fillText(dir > 0 ? "Gold is costlier than yesterday"
      : dir < 0 ? "Gold is cheaper than yesterday" : "Gold is steady since yesterday", tx, y + 15);
  } else {
    bcFont(ctx, 700, 15.5); ctx.fillStyle = BCC.ink; ctx.textAlign = "left";
    ctx.fillText("Today's gold rates", tx, y + 15);
  }
  const sub = [["Typical 24K ", 400, 11.5, BCC.sub], [rs(d.typ24), 700, 11.5, BCC.ink]];
  if (d.spot) {
    sub.push([" · Spot ", 400, 11.5, BCC.sub],
             ["$" + Math.round(d.spot).toLocaleString("en-US"), 700, 11.5, BCC.ink],
             ["/oz", 400, 11.5, BCC.sub]);
    if (d.spotPct != null && Math.abs(d.spotPct) >= 0.05)
      sub.push([(d.spotPct > 0 ? "  ▲" : "  ▼") + Math.abs(d.spotPct).toFixed(1) + "%",
                600, 11.5, d.spotPct > 0 ? BCC.up : BCC.dn]);
  }
  bcRuns(ctx, sub, tx, y + 32);

  // the 7-day line, once there are three days to draw
  if (d.series.length >= 3) {
    const sx = R - 90, sy = y + 2, sw = 88, sh = 28;
    const lo = Math.min(...d.series), hi = Math.max(...d.series), span = (hi - lo) || 1;
    const pts = d.series.map((v, i) =>
      [sx + i * sw / (d.series.length - 1), sy + sh - (v - lo) / span * sh]);
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.lineTo(sx + sw, sy + sh + 4); ctx.lineTo(sx, sy + sh + 4); ctx.closePath();
    ctx.fillStyle = "rgba(201,151,31,.14)"; ctx.fill();
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.strokeStyle = BCC.bronze; ctx.lineWidth = 1.8; ctx.lineJoin = "round"; ctx.stroke();
    const [ex, ey] = pts[pts.length - 1];
    ctx.beginPath(); ctx.arc(ex, ey, 3, 0, Math.PI * 2);
    ctx.fillStyle = (d.trend || 0) < 0 ? BCC.dn : BCC.up; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = BCC.ivory; ctx.stroke();
    bcFont(ctx, 400, 8); ctx.fillStyle = BCC.sub; ctx.textAlign = "left";
    ctx.fillText(d.series.length + " days", sx, sy + sh + 12);
  }

  /* the gold ribbon: today's best buy */
  y = 148;
  const ribbon = (x, w, label, m, prices) => {
    ctx.save();
    ctx.shadowColor = "rgba(201,151,31,.5)"; ctx.shadowBlur = 20; ctx.shadowOffsetY = 8;
    bcRound(ctx, x, y, w, 66, 16); ctx.fillStyle = bcBrandGrad(ctx, x, y, w, 66); ctx.fill();
    ctx.restore();
    bcRound(ctx, x + 14, y + 13, 40, 40, 12);
    ctx.fillStyle = "rgba(255,255,255,.2)"; ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 1; ctx.stroke();
    if (whiteOf[m.id]) ctx.drawImage(whiteOf[m.id], x + 22, y + 21, 24, 24);

    ctx.save();
    ctx.shadowColor = "rgba(90,60,10,.35)"; ctx.shadowBlur = 1; ctx.shadowOffsetY = 1;
    ctx.fillStyle = "#fffdf8";
    let px = x + w - 16;
    const right = [];
    prices.slice().reverse().forEach(([k, v], i) => {
      bcFont(ctx, 800, 22);
      const vw = ctx.measureText(rs(v)).width;
      right.push(px - vw);
      ctx.textAlign = "right"; ctx.fillText(rs(v), px, y + 47);
      bcFont(ctx, 700, 10); ctx.globalAlpha = .9;
      bcTracked(ctx, k, px, y + 25, 1.2, "right");
      ctx.globalAlpha = 1;
      px -= vw + 13;
      if (i < prices.length - 1) {
        ctx.save(); ctx.shadowColor = "transparent";
        ctx.fillStyle = "rgba(255,255,255,.4)"; ctx.fillRect(px + 6, y + 14, 1, 38);
        ctx.restore();
      }
    });
    const nameMax = Math.min(...right) - (x + 64) - 10;
    bcFont(ctx, 700, 10); ctx.globalAlpha = .9;
    bcTracked(ctx, label, x + 64, y + 28, 1.4);
    ctx.globalAlpha = 1;
    bcFont(ctx, 800, 17); ctx.textAlign = "left";
    ctx.fillText(bcFit(ctx, split ? m.name : m.full, nameMax), x + 64, y + 47);
    ctx.restore();
  };
  if (split) {
    const w = (R - L - 10) / 2;
    ribbon(L, w, "BEST 24K", d.best24, [["24K", d.best24.b24]]);
    ribbon(L + w + 10, w, "BEST 22K", d.best22, [["22K", d.best22.b22]]);
  } else {
    const m = d.best24;
    ribbon(L, R - L, "BEST BUY TODAY", m, m.b22 ? [["24K", m.b24], ["22K", m.b22]] : [["24K", m.b24]]);
  }

  // what the best buy saves, against the typical (middle) rate
  y = 232;
  const save24 = d.typ24 && d.best24 ? Math.round((d.typ24 - d.best24.b24) * 10) : 0;
  const save22 = d.typ22 && d.best22 ? Math.round((d.typ22 - d.best22.b22) * 10) : 0;
  const saves = [];
  if (save24 >= 10) saves.push([[rs(save24), 700, 11.5, BCC.dn], [" on 10 g of 24K", 400, 11.5, BCC.sub]]);
  if (save22 >= 10) saves.push([[rs(save22), 700, 11.5, BCC.dn], [" on 10 g of 22K", 400, 11.5, BCC.sub]]);
  if (saves.length) {
    const runs = [["Save ", 400, 11.5, BCC.sub], ...saves[0]];
    if (saves[1]) runs.push([", ", 400, 11.5, BCC.sub], ...saves[1]);
    runs.push([" against the typical rate", 400, 11.5, BCC.sub]);
    bcRuns(ctx, runs, L + 4, y);
  }

  /* the table */
  const COL = { mark: L, name: L + 34, k24: L + 348, k22: L + 438, day: R };
  const lo24 = d.best24 && d.best24.b24, lo22 = d.best22 && d.best22.b22;
  y = 254;
  bcFont(ctx, 700, 10); ctx.fillStyle = BCC.sub;
  bcTracked(ctx, "JEWELLER", COL.name, y + 4, 1.4);
  bcTracked(ctx, "24K", COL.k24, y + 4, 1.4, "right");
  bcTracked(ctx, "22K", COL.k22, y + 4, 1.4, "right");
  if (hasDay) bcTracked(ctx, "DAY", COL.day, y + 4, 1.4, "right");
  y += 14;

  const row = (m, i, ref) => {
    const best = !ref && m.b24 === lo24, c22 = !ref && m.b22 === lo22;
    if (best) { ctx.fillStyle = BCC.best; ctx.fillRect(0, y, BC_W, ROW_H); }
    else if (i % 2) { ctx.fillStyle = "rgba(243,236,224,.55)"; ctx.fillRect(0, y, BC_W, ROW_H); }
    const my = y + 2.5;
    bcRound(ctx, COL.mark, my, 22, 22, 7);
    ctx.fillStyle = best ? bcBrandGrad(ctx, COL.mark, my, 22, 22) : BCC.tint; ctx.fill();
    const img = best ? whiteOf[m.id] : markOf[m.id];
    if (img) ctx.drawImage(img, COL.mark + 3, my + 3, 16, 16);
    const base = y + 18;
    bcFont(ctx, best ? 700 : 500, 13); ctx.fillStyle = ref ? BCC.sub : BCC.ink;
    ctx.textAlign = "left";
    ctx.fillText(bcFit(ctx, m.name, COL.k24 - 84 - COL.name), COL.name, base);
    ctx.textAlign = "right";
    bcFont(ctx, best ? 800 : 600, 13); ctx.fillStyle = best ? BCC.bronze : BCC.ink;
    ctx.fillText(rs(m.b24), COL.k24, base);
    bcFont(ctx, c22 ? 800 : 600, 13); ctx.fillStyle = c22 ? BCC.bronze : BCC.ink;
    ctx.fillText(m.b22 ? rs(m.b22) : "—", COL.k22, base);
    if (hasDay && m.d24 != null) {
      const dd = Math.round(m.d24);
      bcFont(ctx, 700, 11.5);
      ctx.fillStyle = dd > 0 ? BCC.up : dd < 0 ? BCC.dn : BCC.faint;
      ctx.fillText(dd ? (dd > 0 ? "▲" : "▼") + Math.abs(dd).toLocaleString("en-IN") : "—", COL.day, base);
    }
    y += ROW_H;
  };
  d.shops.forEach((m, i) => row(m, i, false));

  if (d.refs.length) {
    y += 10;
    bcFont(ctx, 700, 10); ctx.fillStyle = BCC.faint;
    const lw = bcTracked(ctx, "REFINERS · COIN PRICE INCL. PREMIUM", L, y + 8, 1.4);
    ctx.fillStyle = BCC.line; ctx.fillRect(L + lw + 8, y + 4, R - L - lw - 8, 1);
    y += 18;
    d.refs.forEach((m, i) => row(m, i + 1, true));
  }

  /* footer and credit */
  y += 8;
  ctx.fillStyle = BCC.line; ctx.fillRect(L, y, R - L, 1);
  y += 24;
  bcFont(ctx, 400, 11); ctx.fillStyle = BCC.sub; ctx.textAlign = "left";
  ctx.fillText("GST extra · Hyderabad rates", L, y);
  bcFont(ctx, 700, 11); ctx.fillStyle = BCC.bronze; ctx.textAlign = "right";
  ctx.fillText("karatboard.yourcardjourney.store", R, y);
  y = H - 26;
  ctx.fillStyle = bcFoil(ctx, 0, BC_W); ctx.fillRect(0, y, BC_W, 26);
  bcFont(ctx, 700, 11); ctx.fillStyle = BCC.ink; ctx.textAlign = "center";
  ctx.fillText("Shared by @YourCardJourney", BC_W / 2, y + 17);

  return cv;
}

/* ---- getting it out ---- */
async function loadDaily() {
  try {
    const r = await fetch("daily.json?t=" + Date.now());
    return r.ok ? await r.json() : null;
  } catch (e) { return null; }
}

// Rendered ahead of the click and kept, so the click itself can hand a ready
// Blob to the clipboard or the share sheet. Safari (and iOS share) only allow
// those inside the tap, and fonts plus fifteen marks take longer than that.
let BC_READY = null, BC_FOR = null;
function primeBroadcast() {
  if (!STATE || BC_FOR === STATE) return BC_READY;
  BC_FOR = STATE;
  BC_READY = (async () => {
    const cv = await drawBroadcast(STATE, await loadDaily());
    return await new Promise((ok, no) =>
      cv.toBlob((b) => b ? ok(b) : no(new Error("could not render")), "image/png"));
  })();
  BC_READY.catch(() => { BC_FOR = null; });
  return BC_READY;
}

const bcPhone = () => matchMedia("(pointer: coarse)").matches &&
  !!(navigator.canShare && window.File);
const bcName = () => "karatboard-" + ((STATE && (STATE.builtAt || STATE.now)) ||
  new Date().toISOString()).slice(0, 10) + ".png";

async function shareBroadcast() {
  const pending = primeBroadcast();
  if (!pending) return;
  // Phones: the share sheet goes straight to a WhatsApp channel, where a copied
  // image would need a long-press paste that most keyboards cannot do.
  if (bcPhone()) {
    try {
      const file = new File([await pending], bcName(), { type: "image/png" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;     // they closed the sheet
    }
  }
  try {
    if (!navigator.clipboard || !window.ClipboardItem) throw new Error("no clipboard");
    await navigator.clipboard.write([new ClipboardItem({ "image/png": pending })]);
    snack("Image copied — paste it into WhatsApp");
  } catch (e) {
    try {
      const url = URL.createObjectURL(await pending);
      const a = Object.assign(document.createElement("a"), { href: url, download: bcName() });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      snack("Couldn't copy here — downloaded the image instead");
    } catch (e2) {
      snack("Couldn't make the image — try again in a moment");
      console.error(e2);
    }
  }
}

{
  const btn = $("bcBtn");
  if (btn) {
    if (bcPhone()) btn.querySelector("span").textContent = "Share image";
    btn.onclick = shareBroadcast;
  }
}
