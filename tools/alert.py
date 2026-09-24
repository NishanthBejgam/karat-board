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
COUPON_URL = ("https://raw.githubusercontent.com/NishanthBejgam/coupon-watch/"
              "main/signal/coupon.json")


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
    """The message a person reads on their phone.

    Designed for a phone screen, which is about 35 characters wide: one fact
    per line, nothing that has to line up, no tables, no links. Telegram HTML
    (not Markdown) so a name with an underscore cannot break the formatting.
    """
    by_id = {m["id"]: m for m in rates.get("merchants", [])}
    base_rates = {bid: (by_id.get(bid) or {}).get("rate") or {} for bid in BASELINES}
    base_names = {bid: (by_id.get(bid) or {}).get("short") or bid for bid in BASELINES}

    by_merchant = {}
    for d in deals:
        by_merchant.setdefault(d["id"], []).append(d)

    out = ["🪙 <b>GOLD DEAL ALERT</b>", ""]
    # Headline: the single biggest gap, in one sentence.
    top = deals[0]
    out.append("<b>%s %s is %.1f%% cheaper than %s</b>" % (
        top["name"], top["karat"], -top["pct"], top["refName"]))

    for mid, items in by_merchant.items():
        m = by_id.get(mid) or {}
        r = m.get("rate") or {}
        short = m.get("short") or mid
        tripped = {d["karat"] for d in items}
        for d in items:
            key = "buy22" if d["karat"] == "22K" else "buy24"
            out += ["", "💰 <b>%s %s - ₹%s/g</b>" % (
                short, d["karat"], _rs(d["price"]))]
            out.append("Compared with")
            for bid in BASELINES:
                ref = base_rates[bid].get(key)
                if ref:
                    out.append("• %s ₹%s/g → save ₹%s/g" % (
                        base_names[bid], _rs(ref), _rs(ref - d["price"])))
            out += ["", "You save (vs %s)" % d["refName"]]
            for grams in (2, 5, 10):
                out.append("• %d g → <b>₹%s</b>" % (grams, _rs((d["ref"] - d["price"]) * grams)))

        # The purity that did NOT trip, so a one-purity glitch is obvious.
        for key, karat in (("buy22", "22K"), ("buy24", "24K")):
            if karat in tripped or not r.get(key):
                continue
            ref = base_rates[BASELINES[0]].get(key)
            if ref:
                gap = (r[key] - ref) / ref * 100.0
                out += ["", "ℹ️ Their %s is normal at ₹%s/g (%+.2f%% vs %s). "
                        "The gap is only on %s." % (
                            karat, _rs(r[key]), gap, base_names[BASELINES[0]],
                            " and ".join(sorted(tripped)))]

    out += ["", "🕑 Read live %s IST" % _when(built),
            "", "<i>Note: your purse is full - why not ride on a Gold Deal?</i>"]
    return "\n".join(out)


def _when(iso):
    # 2026-09-18T00:58:12+05:30 -> 18 Sep 2026, 00:58
    try:
        t = time.strptime(iso[:16], "%Y-%m-%dT%H:%M")
        return time.strftime("%d %b, %H:%M", t)
    except Exception:
        return iso[:16].replace("T", " ")


def _rs(v):
    return "{:,.0f}".format(v)


def telegram(token, chats, text):
    sent = 0
    for chat in chats:
        body = urllib.parse.urlencode({
            "chat_id": chat, "text": text, "parse_mode": "HTML",
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


def _chats():
    return (os.environ.get("KB_TG_TOKEN", "").strip(),
            [c.strip() for c in os.environ.get("KB_TG_CHATS", "").split(",") if c.strip()])


def compose_coupon(c):
    """Phone-first like the spread alert, but this one carries the link:
    the reward has to be collected on Amazon before the order is placed."""
    if c.get("percent"):
        offer = "%g%% back" % c["percent"]
        if c.get("max"):
            offer += ", up to ₹%s" % _rs(c["max"])
    else:
        offer = "Flat ₹%s back" % _rs(c.get("flat") or 0)
    out = ["💍 <b>AMAZON JEWELLERY COUPON IS LIVE</b>", "",
           "<b>%s</b>" % offer]
    if c.get("min"):
        out.append("• On orders of ₹%s or more" % _rs(c["min"]))
    if c.get("endsAt"):
        out.append("• Valid till %s" % time.strftime("%d %b", time.localtime(c["endsAt"])))
    out.append("• Collect it first - it applies at checkout, once per account")
    out += ["", "👉 Collect: %s" % c.get("url", ""),
            "", "<i>Confirmed on Amazon's reward page by coupon-watch.</i>"]
    return "\n".join(out)


def coupon_alert(prev, state):
    """Send once when the jewellery coupon turns live; carries its memory in
    state["coupon"] so the next build does not repeat it."""
    url = os.environ.get("KB_COUPON_URL", COUPON_URL)
    state["coupon"] = prev.get("coupon") or {}
    if os.environ.get("KB_COUPON_TEST") == "1":
        sample = {"status": "live", "flat": 1500, "min": 15000,
                  "endsAt": time.time() + 7 * 86400, "rewardId": "jewellery",
                  "url": "https://www.amazon.in/h/rewards/dp/amzn1.rewards.rewardAd.jewellery?rdpf=en"}
        token, chats = _chats()
        text = "🧪 <b>TEST - not a real coupon</b>\n\n" + compose_coupon(sample)
        if token and chats:
            print("alert: coupon TEST sent to %d of %d chat(s)" % (telegram(token, chats, text), len(chats)))
        else:
            print(text)
    if not url:
        return
    sig = load_json(url) or {}
    if sig.get("status") != "live":
        print("alert: jewellery coupon not live")
        return
    key = "%s:%s" % (sig.get("rewardId"), sig.get("endsAt"))
    if state["coupon"].get("key") == key:
        print("alert: jewellery coupon %s already announced" % sig.get("rewardId"))
        return
    token, chats = _chats()
    text = compose_coupon(sig)
    if token and chats:
        n = telegram(token, chats, text)
        print("alert: coupon sent to %d of %d chat(s)" % (n, len(chats)))
        if n:
            state["coupon"] = {"key": key, "sentAt": time.time()}
    else:
        print("alert: no KB_TG_TOKEN / KB_TG_CHATS - would have sent:")
        print(text)


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
            token, chats = _chats()
            text = compose(deals, pct, rates.get("builtAt") or "", rates)
            if token and chats:
                n = telegram(token, chats, text)
                print("alert: sent to %d of %d chat(s)" % (n, len(chats)))
                if n:
                    state["sentAt"] = now
            else:
                print("alert: no KB_TG_TOKEN / KB_TG_CHATS - would have sent:")
                print(text)

    try:
        coupon_alert(prev, state)
    except Exception as exc:                       # never lose the spread state over it
        print("alert: coupon check failed (%s)" % exc)

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
