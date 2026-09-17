"""Spread alert - tell a few people, privately, when a jeweller undercuts Kalyan
or Lalithaa by a wide margin.

The board already reads every merchant twice an hour and leaves the numbers in
rates.json. This reads *that file* - no merchant is asked anything a second
time - and compares each jeweller's 22K and 24K against Kalyan's and
Lalithaa's. When one is cheaper than EITHER by KB_ALERT_PCT or more, a
Telegram message goes to the chat ids in KB_TG_CHATS. Nobody else sees it: the public page is untouched.

    python alert.py <dir-with-rates.json>

Environment (all optional; with no token this is a no-op that still prints):
  KB_TG_TOKEN          bot token from @BotFather
  KB_TG_CHATS          comma-separated chat ids to notify (one per person/group)
  KB_ALERT_PCT         threshold, percent below the baseline (default 8.0)
  KB_ALERT_REPEAT_H    re-send the same alert after N hours  (default 6)
  KB_ALERT_STATE_URL   where the previous build's alerts.json lives

Why "cheaper" only: MMTC-PAMP, BRPL and Aspect always sit 2-10% above Kalyan by
construction (minted product, ex-GST wholesale, spot plus premium). Dearer is
not a deal and would fire on every build. The rule the user set: a jeweller
8% or more *below* Kalyan or Lalithaa - the Bhima 22K incident of 2026-09-17,
where the storefront printed a rate some ₹1,300 under the board.

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

BASELINES = ("kalyan", "lalithaa")


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
    """Every (merchant, karat, their price, baseline price, %) under the line.

    A merchant is checked against each baseline separately and reported once,
    against whichever it undercuts by more.
    """
    by_id = {m["id"]: m for m in state.get("merchants", [])}
    bases = []
    for bid in BASELINES:
        b = by_id.get(bid) or {}
        r = b.get("rate") or {}
        if r.get("buy24"):
            bases.append((b.get("short") or bid, r))
    if not bases:
        print("alert: no baseline (Kalyan/Lalithaa) rate this build - nothing to compare")
        return []
    deals = []
    for m in state.get("merchants", []):
        if m["id"] in BASELINES:
            continue
        r = m.get("rate") or {}
        # A stale tile is last build's number, not today's offer: the gap it
        # shows is against a Kalyan that has since moved. Not worth a trip.
        if not r.get("ok") or r.get("stale"):
            continue
        for key, karat in (("buy22", "22K"), ("buy24", "24K")):
            mine = r.get(key)
            if not mine:
                continue
            worst = None
            for bname, base in bases:
                ref = base.get(key)
                if not ref:
                    continue
                gap = (mine - ref) / ref * 100.0
                if gap <= -pct and (worst is None or gap < worst[0]):
                    worst = (gap, bname, ref)
            if worst:
                gap, bname, ref = worst
                deals.append({"id": m["id"], "name": m.get("short") or m["name"],
                              "karat": karat, "price": mine, "ref": ref,
                              "refName": bname, "pct": round(gap, 2),
                              "site": m.get("site")})
    deals.sort(key=lambda d: d["pct"])
    return deals


def fingerprint(deals):
    # Half-percent buckets: a gap drifting 1.02 -> 1.04 is the same alert.
    return "|".join("%s:%s:%.1f" % (d["id"], d["karat"], round(d["pct"] * 2) / 2)
                    for d in deals)


def compose(deals, pct, built, rates):
    """The message a person reads on their phone. No links: the point is to
    understand the deal in one glance, not to click through."""
    by_id = {m["id"]: m for m in rates.get("merchants", [])}
    base_rates = {bid: (by_id.get(bid) or {}).get("rate") or {} for bid in BASELINES}
    base_names = {bid: (by_id.get(bid) or {}).get("short") or bid for bid in BASELINES}

    # One block per merchant, however many purities tripped.
    by_merchant = {}
    for d in deals:
        by_merchant.setdefault(d["id"], []).append(d)
    n = len(by_merchant)

    out = ["🪙 *KARAT BOARD - GOLD DEAL ALERT*", ""]
    if n == 1:
        out.append("*%s* is selling gold well below the market." %
                   (by_id.get(next(iter(by_merchant))) or {}).get("name", "A jeweller"))
    else:
        out.append("*%d jewellers* are selling gold well below the market." % n)

    for mid, items in by_merchant.items():
        m = by_id.get(mid) or {}
        r = m.get("rate") or {}
        short = m.get("short") or mid
        tripped = {d["karat"] for d in items}
        for d in items:
            key = "buy22" if d["karat"] == "22K" else "buy24"
            # Telegram's normal font is proportional, so names of different
            # lengths never line up. A code block is monospace: pad there.
            rows = [(short, d["price"], None)]
            for bid in BASELINES:
                ref = base_rates[bid].get(key)
                if ref:
                    rows.append((base_names[bid], ref, ref - d["price"]))
            width = max(len(name) for name, _, _ in rows)
            out += ["", "*%s %s*" % (short, d["karat"]), "```"]
            for name, price, diff in rows:
                line = "%-*s  ₹%s / g" % (width, name, _rs(price))
                if diff is not None:
                    line += "   %s cheaper by ₹%s (%+.2f%%)" % (
                        short, _rs(diff), -diff / price * 100.0)
                out.append(line)
            out += ["```", "What that saves you (vs %s)" % d["refName"], "```"]
            for grams in (2, 5, 10):
                out.append("%2d g   ₹%s" % (grams, _rs((d["ref"] - d["price"]) * grams)))
            out.append("```")

        # The purity that did NOT trip, so a one-purity glitch is obvious.
        for key, karat in (("buy22", "22K"), ("buy24", "24K")):
            if karat in tripped or not r.get(key):
                continue
            ref = base_rates[BASELINES[0]].get(key)
            if ref:
                gap = (r[key] - ref) / ref * 100.0
                out += ["", "Their %s is ₹%s / g - that one is normal (%+.2f%% vs %s), "
                        "so the gap is only on %s." % (
                            karat, _rs(r[key]), gap, base_names[BASELINES[0]],
                            " and ".join(sorted(tripped)))]

    out += ["", "Read live at %s IST." % _when(built),
            "", "_Note: your purse is full - why not ride on a Gold Deal?_"]
    return "\n".join(out)


def _when(iso):
    # 2026-09-18T00:58:12+05:30 -> 18 Sep 2026, 00:58
    try:
        t = time.strptime(iso[:16], "%Y-%m-%dT%H:%M")
        return time.strftime("%d %b %Y, %H:%M", t)
    except Exception:
        return iso[:16].replace("T", " ")


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
    pct = float(os.environ.get("KB_ALERT_PCT") or 8.0)
    repeat_h = float(os.environ.get("KB_ALERT_REPEAT_H") or 6)
    deals = find_deals(rates, pct)
    print("alert: %d reading(s) at least %g%% under Kalyan/Lalithaa" % (len(deals), pct))
    for d in deals:
        print("  %-10s %s  %s vs %s %s  %+.2f%%" % (
            d["id"], d["karat"], _rs(d["price"]), d["refName"], _rs(d["ref"]), d["pct"]))

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
            text = compose(deals, pct, rates.get("builtAt") or "", rates)
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
