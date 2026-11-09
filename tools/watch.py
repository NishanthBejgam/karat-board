"""Deal watches - Telegram pings for boards other than gold, on the same bot.

The spread alert (alert.py) knows one board. This knows any number: each entry
in watches.json names a SOURCE (which board to read, and how) and a RULE (when
an item is worth a message). A new alert is a new entry; a new kind of board
is one reader function in SOURCES; a new kind of test is one in RULES.

    python watch.py <site-dir>

It runs on every Karat Board build (twice an hour) because that workflow
already holds the bot token and costs nothing on a public repo. The boards it
reads are public JSON, so nothing private passes through here.

State lives in watch.json beside the page, read back off the live site like
alerts.json and daily.json: the day-by-day values the 'jump' rule averages,
and what was last sent so a firing item is not repeated every 30 minutes.
If last build's watch.json cannot be read (anything but a 404), this exits
non-zero and the build stops - publishing without it would wipe the history.

Environment:
  KB_TG_TOKEN / KB_TG_CHATS   the alert bot (no token = print only)
  KB_WATCH_STATE_URL          where last build's watch.json lives
  KB_WATCH_TEST               1 = send each watch's top 3 now, marked TEST
"""

import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

from alert import _chats, _rs, telegram

HERE = os.path.dirname(os.path.abspath(__file__))
TEST = os.environ.get("KB_WATCH_TEST") == "1"
IST = 5.5 * 3600


def fetch(url):
    req = urllib.request.Request(url, headers={
        "Cache-Control": "no-cache", "User-Agent": "karat-board-watch"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


# ------------------------------------------------------------------ sources
# Each returns [{key, name, value, url?, note?}] - value is a percent off.

# Brands the GiftDeals board itself hides (static/app.js HIDE): not worth a ping.
GD_HIDE = re.compile("|".join([
    "kaspersky", "savesage", "microsoft office", "gaana", "tinder", "jio starter", "hotstar.*annual",
    "razorpay", "exitlag", "minecraft", "rainbow six", "ea sports", "air india ancillary", "what'?s up wellness",
    "american greetings", "faadbuk", "greeting", "birthday card", "mug$", "graphique", "qamza", "dog speak",
    "hubble physical", "porter packers", "adventra", "-luxe$", "^minted$",
    r"^(fashion|grocery|travel|hotel|jewellery|flat \d+% off)$"]), re.I)


def _gd_pct(c, face, price):
    """GiftDeals' priceAt() (static/app.js), returning (pct, conditional)."""
    pay, value, later, cond, off = price, face, 0.0, False, 0.0
    cp = c.get("coupon") or {}
    if cp.get("kind") and cp.get("value") and (not cp.get("min") or price >= cp["min"]):
        off = (min(price * cp["value"] / 100.0, cp.get("cap") or float("inf"))
               if cp["kind"] == "pct" else min(cp["value"], price))
    pay -= off
    o = c.get("offer") or {}
    if o.get("kind") == "extra":
        value = face * (1 + o["value"] / 100.0)
    elif o.get("kind") == "cashback":
        later = pay * o["value"] / 100.0
    elif o.get("kind") in ("multi", "flat") and not off:
        pay -= pay * o["value"] / 100.0
        cond = o["kind"] == "multi"
    save = value - (pay - later)
    return (save / value * 100.0 if value > 0 else 0.0), cond


def src_giftdeals(w):
    """Every card's best instant percent off, across its denominations.
    'Buy 2 & get X%' is conditional, so it is not counted (the board's Top
    deals leave it out too)."""
    out = []
    for c in fetch(w["url"]).get("cards", []):
        if c.get("unavailable") or GD_HIDE.search(c.get("brand") or ""):
            continue
        opts = [(d["price"], d["price"]) if c.get("basis") == "mrp" else (d["face"], d["price"])
                for d in c.get("denoms") or []]
        if not opts and c.get("range"):
            opts = [(f, f) for f in c["range"][:2] if f]
        best = 0.0
        for face, price in opts:
            pct, cond = _gd_pct(c, face, price)
            if not cond:
                best = max(best, pct)
        title = (c.get("title") or c.get("brand") or "").split("|")[0].strip()
        if len(title) > 44:
            title = title[:42].rstrip() + "…"
        out.append({"key": c["key"], "name": title or c["brand"], "value": round(best, 2)})
    return out


def src_brands(w):
    """A brands.yourcardjourney.store products.json: percent off M.R.P. at the
    board's best price ('low' = listed - coupon - best card offer)."""
    field = w.get("price_field", "low")
    out = []
    for p in fetch(w["url"]).get("items", []):
        mrp, pay = p.get("mrp"), p.get(field)
        if not (p.get("stock") and mrp and pay) or p.get("stale"):
            continue
        out.append({"key": p["id"], "name": p.get("name") or p["id"],
                    "value": round((mrp - pay) / mrp * 100.0, 1), "url": p.get("url"),
                    "note": "₹%s (M.R.P. ₹%s)" % (_rs(pay), _rs(mrp))})
    return out


def _inr(v):
    """Indian grouping, as on WhichBike: 2,35,000."""
    s = "%d" % round(v)
    if len(s) <= 3:
        return s
    head, tail = s[:-3], s[-3:]
    groups = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    return ",".join([head] + groups + [tail])


def _wb_bank(b, price):
    """WhichBike's bankAmount(): base (pct capped, or flat) + every tier reached."""
    base = b.get("base") or {}
    if not base or price < (base.get("min") or 0):
        return 0.0
    v = price * base["pct"] / 100.0 if base.get("pct") is not None else (base.get("flat") or 0)
    if base.get("cap"):
        v = min(v, base["cap"])
    return v + sum(t.get("flat") or 0 for t in b.get("tiers") or [] if price >= (t.get("min") or 0))


def src_whichbike(w):
    """WhichBike's Amazon listing coupons (value = coupon in rupees), each with
    the board's Amazon Pay route as the broadcast card shows it: listed price -
    coupon - any-card instant - Amazon Pay back (Prime rate) = final."""
    d = fetch(w["url"])
    o = d.get("offers") or {}
    pay_by, sets, by_model = o.get("payByModel") or {}, o.get("sets") or {}, o.get("byModel") or {}
    out = []
    for m in d.get("models", []):
        a = (m.get("stores") or {}).get("amazon") or {}
        info = pay_by.get(m["id"]) or {}
        cp = info.get("coupon") or {}
        if not (a.get("inStock") and a.get("from")) or not cp:
            continue
        price = a["from"]
        coupon = cp["flat"] if "flat" in cp else price * cp.get("pct", 0) / 100.0
        net = price - coupon
        anyc = max([_wb_bank(b, net) for b in sets.get(by_model.get(m["id"]), [])
                    if b.get("bank") == "Any card" and not b.get("emi")] or [0])
        net -= anyc
        ap = info.get("apay") or {}
        pct = ap.get("prime") or ap.get("pct") or 0
        back = round(net * pct / 100.0) if pct else 0
        parts = ["₹%s" % _inr(price), "− ₹%s coupon" % _inr(coupon)]
        if anyc:
            parts.append("− ₹%s any card" % _inr(anyc))
        if back:
            parts.append("− ₹%s %g%% Amazon Pay ↺" % (_inr(back), pct))
        url = next((l.get("url") for l in m.get("listings") or [] if l.get("asin") == a.get("best")), None)
        out.append({"key": m["id"], "name": "%s %s" % (m["maker"], m["model"]), "value": round(coupon),
                    "url": url and url.replace("&", "&amp;"), "note": " ".join(parts) + " = <b>₹%s</b>" % _inr(net - back) +
                    (" (Amazon Pay ICICI, Prime)" if back else "")})
    return out


SOURCES = {"giftdeals": src_giftdeals, "brands": src_brands, "whichbike": src_whichbike}


# -------------------------------------------------------------------- rules
# Each takes (watch, item, history-of-that-item) and returns a "why" string
# when the item fires, else None.

def rule_above(w, it, hist):
    if it["value"] >= w["above"]:
        return "%s%% off" % _pct(it["value"])


def rule_jump(w, it, hist):
    today = _day(time.time())
    past = [v for d, v in hist.items() if d < today]
    if len(past) < w.get("min_days", 4) or it["value"] < w.get("min_value", 0):
        return None
    avg = sum(past) / len(past)
    if it["value"] >= avg + w.get("jump_pts", 2.0):
        it["avg"] = avg
        return "%s%% off · usual %s%% (%d-day avg)" % (_pct(it["value"]), _pct(avg), len(past))


def rule_coupon(w, it, hist):
    if it["value"] >= w["above"]:
        return "<b>Coupon ₹%s</b> - tick Apply coupon on the listing" % _inr(it["value"])


RULES = {"above": rule_above, "coupon_above": rule_coupon, "jump": rule_jump}
KEEPS_HISTORY = {"jump"}


# ------------------------------------------------------------------ helpers

def _day(ts):
    return time.strftime("%Y-%m-%d", time.gmtime(ts + IST))


def _pct(v):
    return ("%.0f" % v) if abs(v - round(v)) < 0.05 or v >= 10 else ("%.1f" % v)


def load_state(out_dir):
    url = os.environ.get("KB_WATCH_STATE_URL")
    if not url:
        path = os.path.join(out_dir, "watch.json")
        if os.path.isfile(path):
            with io.open(path, encoding="utf-8") as fh:
                return json.load(fh)
        return {}
    try:
        return fetch(url)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:                        # first build: nothing yet
            return {}
        raise


def compose(w, firing, stamp):
    """Phone-first, like the spread alert: one fact per line, no tables."""
    out = ["%s<b>%s</b>" % ("🧪 <b>TEST</b> - sent by hand\n\n" if TEST else "", w["title"])]
    for it in firing[:10]:
        out += ["", "• <b>%s</b>" % it["name"], it["why"]]
        if it.get("note"):
            out.append(it["note"])
        if it.get("url"):
            out.append("👉 " + it["url"])
    if len(firing) > 10:
        out += ["", "…and %d more on the board." % (len(firing) - 10)]
    if w.get("link"):
        out += ["", "Board: " + w["link"]]
    out += ["", "🕑 Checked %s IST" % stamp]
    return "\n".join(out)


def run_watch(w, state, now):
    hist_all = state.setdefault("history", {}).setdefault(w["id"], {})
    sent = state.setdefault("sent", {}).setdefault(w["id"], {})
    items = SOURCES[w["source"]](w)
    rule = RULES[w["rule"]]
    keep = w["rule"] in KEEPS_HISTORY
    today, cutoff = _day(now), _day(now - (w.get("window_days", 14) + 1) * 86400)

    firing = []
    for it in items:
        hist = hist_all.setdefault(it["key"], {}) if keep else {}
        why = rule(w, it, hist)
        if keep:
            hist[today] = it["value"]              # last read of the day stands
        if why:
            it["why"] = why
            firing.append(it)
    if keep:                                       # trim the window
        for k in list(hist_all):
            h = {d: v for d, v in hist_all[k].items() if d > cutoff}
            if h:
                hist_all[k] = h
            else:
                del hist_all[k]

    print("watch %s: %d item(s) read, %d firing" % (w["id"], len(items), len(firing)))
    if TEST:
        firing = sorted(items, key=lambda i: -i["value"])[:3]
        for it in firing:
            it["why"] = ("Coupon ₹%s (test pick, not a trigger)" % _inr(it["value"])
                         if w["rule"] == "coupon_above"
                         else "%s%% off (test pick, not a trigger)" % _pct(it["value"]))
    else:
        on = {it["key"] for it in firing}
        for k in [k for k in sent if k not in on]:  # stopped firing: forget it
            del sent[k]
        repeat = w.get("repeat_h", 24) * 3600
        rise = w.get("rise_pts", 1.0)
        firing = [it for it in firing if not sent.get(it["key"])
                  or it["value"] >= sent[it["key"]]["value"] + rise
                  or now - sent[it["key"]]["at"] >= repeat]
    if not firing:
        return
    firing.sort(key=lambda i: -(i["value"] - i.get("avg", 0)))
    text = compose(w, firing, time.strftime("%d %b, %H:%M", time.gmtime(now + IST)))
    token, chats = _chats()
    if not (token and chats):
        print("watch %s: no KB_TG_TOKEN / KB_TG_CHATS - would have sent:\n%s" % (w["id"], text))
        return
    n = telegram(token, chats, text)
    print("watch %s: sent to %d of %d chat(s)" % (w["id"], n, len(chats)))
    if n and not TEST:
        for it in firing:
            sent[it["key"]] = {"value": it["value"], "at": now}


def run(out_dir):
    with io.open(os.path.join(HERE, "watches.json"), encoding="utf-8") as fh:
        watches = [w for w in json.load(fh)["watches"] if w.get("enabled", True)]
    try:
        state = load_state(out_dir)
    except Exception as exc:
        print("watch: last watch.json unreadable (%s) - stopping so history is not wiped" % exc)
        return 1
    now = time.time()
    for w in watches:
        try:
            run_watch(w, state, now)
        except Exception as exc:                   # one broken board never stops the rest
            print("watch %s: failed (%s)" % (w.get("id"), exc))
    state["checkedAt"] = now
    with io.open(os.path.join(out_dir, "watch.json"), "w", encoding="utf-8") as fh:
        json.dump(state, fh, separators=(",", ":"))
    return 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(errors="replace")
    except Exception:
        pass
    sys.exit(run(os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "site")))
