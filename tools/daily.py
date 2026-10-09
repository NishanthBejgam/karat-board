"""Daily closes - what each jeweller's rate stood at when the day ended.

The broadcast image says "gold is up Rs 58 since yesterday". Yesterday means the
last reading before midnight IST, so this keeps one entry per date and simply
overwrites today's on every build: whatever the 23:30 build wrote is what the
day closed on. A week is kept, which is all the image's 7-day line needs.

    python daily.py <dir-with-rates.json>

A blank runner remembers nothing, so the previous daily.json is fetched back off
the live site (KB_DAILY_URL), the same trick alerts.json uses. The difference is
what happens when that fetch fails: losing alerts.json costs one repeated ping,
losing this costs a week of history. So a 404 starts afresh (first run ever),
but any other failure stops the build - the site keeps last half-hour's page and
the next build tries again.
"""

import io
import json
import os
import sys
import urllib.error
import urllib.request

KEEP_DAYS = 8


def previous(url_or_path):
    """The last published daily.json, {} if there has never been one."""
    if not url_or_path:
        return {}
    if not url_or_path.startswith("http"):
        if not os.path.isfile(url_or_path):
            return {}
        with io.open(url_or_path, encoding="utf-8") as fh:
            return json.load(fh)
    req = urllib.request.Request(url_or_path, headers={
        "Cache-Control": "no-cache", "User-Agent": "karat-board-daily"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            print("daily: no daily.json published yet - starting the record")
            return {}
        raise


def run(out_dir):
    with io.open(os.path.join(out_dir, "rates.json"), encoding="utf-8") as fh:
        state = json.load(fh)
    prev = previous(os.environ.get("KB_DAILY_URL")
                    or os.path.join(out_dir, "daily.json"))
    days = prev.get("days") or {}

    # builtAt carries the +05:30 offset, so its first ten characters are the
    # IST date - the day a WhatsApp reader in India would call "today".
    built = state.get("builtAt") or state.get("now")
    today = built[:10]
    entry = days.get(today) or {"merchants": {}}
    for m in state.get("merchants") or []:
        r = m.get("rate") or {}
        # A merchant that could not be read keeps the rate it had earlier today
        # rather than dropping out of the day's close.
        if r.get("buy24") or r.get("buy22"):
            entry["merchants"][m["id"]] = {"buy24": r.get("buy24"),
                                           "buy22": r.get("buy22")}
    spot = (state.get("market") or {}).get("spot")
    if spot:
        entry["spot"] = spot
    entry["at"] = state.get("lastRefresh") or built
    days[today] = entry

    keep = sorted(days)[-KEEP_DAYS:]
    out = {"days": {d: days[d] for d in keep}, "builtAt": built}
    # broadcast_send.py's once-a-day marker rides along in the same file.
    if prev.get("broadcastSent"):
        out["broadcastSent"] = prev["broadcastSent"]
    with io.open(os.path.join(out_dir, "daily.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=1)
    print("daily: %d day(s) on record, today %s with %d merchant(s)"
          % (len(keep), today, len(entry["merchants"])))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(run(os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "site")))
    except Exception as exc:
        print("daily: could not carry the record forward (%s) - not publishing" % exc)
        sys.exit(1)
