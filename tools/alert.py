"""Spread alert - tell a few people, privately, when a jeweller undercuts Kalyan.

The board already reads every merchant twice an hour and leaves the numbers in
rates.json. This reads *that file* - no merchant is asked anything a second
time - and compares each jeweller's 22K and 24K against Kalyan's. When one is
cheaper by more than KB_ALERT_PCT, a Telegram message goes to the chat ids in
KB_TG_CHATS. Nobody else sees it: the public page is untouched.

    python alert.py <dir-with-rates.json>

Environment (all optional; with no token this is a no-op that still prints):
  KB_TG_TOKEN          bot token from @BotFather
  KB_TG_CHATS          comma-separated chat ids to notify (one per person/group)
  KB_ALERT_PCT         threshold, percent below Kalyan       (default 1.0)
  KB_ALERT_REPEAT_H    re-send the same alert after N hours  (default 6)
  KB_ALERT_STATE_URL   where the previous build's alerts.json lives

Why "cheaper" only: MMTC-PAMP, BRPL and Aspect always sit 2-10% above Kalyan by
construction (minted product, ex-GST wholesale, spot plus premium). Dearer is
not a deal and would fire on every build. A jeweller *below* the Kalyan board
by a whole percent, when the rest cluster inside half a percent, is the thing
worth a trip - or a typo on their side that is worth catching.

Why a state file: the build runs twice an hour and Bhima's gap does not close
in thirty minutes. alerts.json remembers what was last sent, so the same gap
is repeated only every KB_ALERT_REPEAT_H hours, and immediately if it changes
(new merchant, gap widened or narrowed by half a percent). The file is written
beside rates.json because a blank runner has nowhere else to remember, and it
carries nothing but merchant ids and percentages.
"""

import io
import json
import os
import sys
import time
import urllib.parse
import urllib.request

BASELINE = "kalyan"


def load_json(path_or_url):
    try:
        if path_or_url.startswith("http"):
            req = urllib.request.Request(path_or_url, headers={
                "Cache-Control": "no-cache", "User-Agent": "karat-board-alert"})
            with urllib.request.urlopen(req, timeout=20) as resp:
                return json.loads(resp.read().decode("utf-8"))
        with io.open(path_or_url, encoding="utf-8") as fh:
            return json.load(fh)
    except Exception as exc:                       # missing, 404, malformed
        print("alert: no previous state from %s (%s)" % (path_or_url, exc))
        return None


def find_deals(state, pct):
    """Every (merchant, karat, their price, Kalyan price, %) under the line."""
    by_id = {m["id"]: m for m in state.get("merchants", [])}
    base = (by_id.get(BASELINE) or {}).get("rate") or {}
    if not base.get("buy24"):
        print("alert: Kalyan has no rate this build - nothing to compare")
        return []
    deals = []
    for m in state.get("merchants", []):
        if m["id"] == BASELINE:
            continue
        r = m.get("rate") or {}
        # A stale tile is last build's number, not today's offer: the gap it
        # shows is against a Kalyan that has since moved. Not worth a trip.
        if not r.get("ok") or r.get("stale"):
            continue
        for key, karat in (("buy22", "22K"), ("buy24", "24K")):
            mine, ref = r.get(key), base.get(key)
            if not mine or not ref:
                continue
            gap = (mine - ref) / ref * 100.0
            if gap <= -pct:
                deals.append({"id": m["id"], "name": m.get("short") or m["name"],
                              "karat": karat, "price": mine, "ref": ref,
                              "pct": round(gap, 2), "site": m.get("site")})
    deals.sort(key=lambda d: d["pct"])
    return deals


def fingerprint(deals):
    # Half-percent buckets: a gap drifting 1.02 -> 1.04 is the same alert.
    return "|".join("%s:%s:%.1f" % (d["id"], d["karat"], round(d["pct"] * 2) / 2)
                    for d in deals)


def compose(deals, pct, built):
    lines = ["\U0001FA99 *Karat Board - spread alert*",
             "Below Kalyan by ≥ %g%%:" % pct, ""]
    for d in deals:
        lines.append("*%s %s*  ₹%s  (Kalyan ₹%s)  *%+.2f%%*" % (
            d["name"], d["karat"], _rs(d["price"]), _rs(d["ref"]), d["pct"]))
        if d.get("site"):
            lines.append("  " + d["site"])
    lines += ["", "Read at %s" % built.replace("T", " ")[:16],
              "https://karatboard.yourcardjourney.store"]
    return "\n".join(lines)


def _rs(v):
    return "{:,.0f}".format(v)


def telegram(token, chats, text):
    sent = 0
    for chat in chats:
        body = urllib.parse.urlencode({
            "chat_id": chat, "text": text, "parse_mode": "Markdown",
            "disable_web_page_preview": "true"}).encode("utf-8")
        req = urllib.request.Request(
            "https://api.telegram.org/bot%s/sendMessage" % token, data=body)
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                resp.read()
            sent += 1
        except Exception as exc:
            print("alert: telegram send to %s failed (%s)" % (chat, exc))
    return sent


def run(out_dir):
    rates = load_json(os.path.join(out_dir, "rates.json"))
    if not rates:
        return 0
    pct = float(os.environ.get("KB_ALERT_PCT") or 1.0)
    repeat_h = float(os.environ.get("KB_ALERT_REPEAT_H") or 6)
    deals = find_deals(rates, pct)
    print("alert: %d reading(s) at least %g%% under Kalyan" % (len(deals), pct))
    for d in deals:
        print("  %-10s %s  %s vs %s  %+.2f%%" % (
            d["id"], d["karat"], _rs(d["price"]), _rs(d["ref"]), d["pct"]))

    prev = load_json(os.environ.get("KB_ALERT_STATE_URL") or
                     os.path.join(out_dir, "alerts.json")) or {}
    fp = fingerprint(deals)
    now = time.time()
    state = {"fingerprint": fp, "sentAt": prev.get("sentAt"), "deals": deals,
             "pct": pct, "checkedAt": rates.get("builtAt")}

    if deals:
        same = prev.get("fingerprint") == fp
        aged = now - float(prev.get("sentAt") or 0) >= repeat_h * 3600
        if same and not aged:
            print("alert: unchanged since last message - not repeating yet")
        else:
            token = os.environ.get("KB_TG_TOKEN", "").strip()
            chats = [c.strip() for c in os.environ.get("KB_TG_CHATS", "").split(",")
                     if c.strip()]
            text = compose(deals, pct, rates.get("builtAt") or "")
            if token and chats:
                n = telegram(token, chats, text)
                print("alert: sent to %d of %d chat(s)" % (n, len(chats)))
                if n:
                    state["sentAt"] = now
            else:
                print("alert: no KB_TG_TOKEN / KB_TG_CHATS - would have sent:")
                print(text)

    with io.open(os.path.join(out_dir, "alerts.json"), "w", encoding="utf-8") as fh:
        json.dump(state, fh, indent=1)
    return 0


if __name__ == "__main__":
    # Windows consoles choke on the coin emoji; the message itself is UTF-8.
    try:
        sys.stdout.reconfigure(errors="replace")
    except Exception:
        pass
    # Never let an alert break a build: the board matters more than the ping.
    try:
        sys.exit(run(os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "site")))
    except Exception as exc:
        print("alert: failed (%s) - build continues" % exc)
        sys.exit(0)
