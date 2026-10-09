"""Morning broadcast - the board's WhatsApp image, sent to Telegram at 10 AM IST.

WhatsApp has no API that posts to a Channel, and the unofficial ones risk the
number (and the channel with it). So the build does everything up to the last
tap: once a day, on the first build at or after KB_BROADCAST_HOUR IST, it renders
the same image the /broadcast/ page makes and sends it through the
spread-alert bot to KB_TG_CHATS. Forwarding it to the channel is ten seconds.

    python broadcast_send.py <dir-with-rates.json-and-daily.json>

The image is not redrawn in Python: a headless Chrome opens the built
/broadcast/ page and takes the PNG it rendered, so the Telegram copy and the
page's copy can never drift apart. GitHub's Ubuntu runners ship Google Chrome; Playwright
only drives it.

Once a day: the date it went out is kept in daily.json (broadcastSent), which
daily.py carries forward. Builds run twice an hour, so a missed 10:01 is caught
at 10:30; nothing is sent after KB_BROADCAST_UNTIL, a stale morning image being
worse than none. KB_BROADCAST_TEST sends one now, marked TEST, without counting.

Never breaks a build - the board matters more than the picture.
"""

import base64
import functools
import http.server
import io
import json
import os
import subprocess
import sys
import threading
import urllib.request
import uuid

HOUR = int(os.environ.get("KB_BROADCAST_HOUR") or 10)
UNTIL = int(os.environ.get("KB_BROADCAST_UNTIL") or 13)
TEST = bool(os.environ.get("KB_BROADCAST_TEST"))


def render(out_dir):
    """The broadcast PNG, drawn by the page itself in headless Chrome."""
    from playwright.sync_api import sync_playwright

    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=out_dir)
    handler.log_message = lambda *a: None
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = "http://127.0.0.1:%d/" % server.server_address[1]
    try:
        with sync_playwright() as p:
            try:
                browser = p.chromium.launch(channel="chrome")
            except Exception:
                # No system Chrome here - fetch Playwright's own and carry on.
                subprocess.call([sys.executable, "-m", "playwright", "install", "chromium"])
                browser = p.chromium.launch()
            page = browser.new_page()
            page.goto(url + "broadcast/", wait_until="networkidle", timeout=60000)
            page.wait_for_function("PNG !== null", timeout=60000)
            data = page.evaluate("""() => new Promise((ok) => {
                const fr = new FileReader();
                fr.onload = () => ok(fr.result);
                fr.readAsDataURL(PNG);
            })""")
            browser.close()
    finally:
        server.shutdown()
    return base64.b64decode(data.split(",", 1)[1])


def send_photo(token, chat, png, caption):
    boundary = uuid.uuid4().hex
    parts = []
    for name, value in (("chat_id", chat), ("caption", caption)):
        parts.append(("--%s\r\nContent-Disposition: form-data; name=\"%s\"\r\n\r\n%s\r\n"
                      % (boundary, name, value)).encode("utf-8"))
    parts.append(("--%s\r\nContent-Disposition: form-data; name=\"photo\"; "
                  "filename=\"karatboard.png\"\r\nContent-Type: image/png\r\n\r\n"
                  % boundary).encode("utf-8") + png + b"\r\n")
    parts.append(("--%s--\r\n" % boundary).encode("utf-8"))
    req = urllib.request.Request(
        "https://api.telegram.org/bot%s/sendPhoto" % token, data=b"".join(parts),
        headers={"Content-Type": "multipart/form-data; boundary=" + boundary})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8")).get("ok")


def run(out_dir):
    with io.open(os.path.join(out_dir, "rates.json"), encoding="utf-8") as fh:
        rates = json.load(fh)
    daily_path = os.path.join(out_dir, "daily.json")
    with io.open(daily_path, encoding="utf-8") as fh:
        daily = json.load(fh)

    built = rates.get("builtAt") or rates.get("now")     # carries +05:30
    today, hour = built[:10], int(built[11:13])
    if not TEST:
        if not (HOUR <= hour < UNTIL):
            print("broadcast: %02d:xx IST - outside %02d-%02d, nothing to send" % (hour, HOUR, UNTIL))
            return 0
        if daily.get("broadcastSent") == today:
            print("broadcast: already sent today")
            return 0

    token = os.environ.get("KB_TG_TOKEN")
    chats = [c.strip() for c in (os.environ.get("KB_TG_CHATS") or "").split(",") if c.strip()]
    if not token or not chats:
        print("broadcast: no KB_TG_TOKEN/KB_TG_CHATS - skipping")
        return 0

    png = render(out_dir)
    print("broadcast: rendered %d KB" % (len(png) // 1024))
    from datetime import date
    nice = date.fromisoformat(today).strftime("%a, %d %b").replace(" 0", " ")
    caption = ("TEST - " if TEST else "") + \
        "Gold board for %s - ready to forward to the WhatsApp channel" % nice
    sent = sum(1 for c in chats if send_photo(token, c, png, caption))
    print("broadcast: sent to %d of %d chat(s)" % (sent, len(chats)))

    if sent and not TEST:
        daily["broadcastSent"] = today
        with io.open(daily_path, "w", encoding="utf-8") as fh:
            json.dump(daily, fh, indent=1)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(run(os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "site")))
    except Exception as exc:
        print("broadcast: failed (%s) - build continues" % exc)
        sys.exit(0)
