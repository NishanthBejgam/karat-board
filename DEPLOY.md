# Hosting Karat Board

**The app needs Python. A website doesn't have to.**

Your visitors don't need the sweep to run — they need the numbers it produced. So
the Python moves off the visitor's request and onto a schedule:

```
GitHub Actions, every 15 min
  └─ python build_site.py ──> 8 merchants ──> rates.json + the page
                                                    │
                       yourcardjourney.store/gold <─┘   static, free, on a CDN
```

This folder is a clone. **`../gold-board/` is your personal copy and is not
touched by any of this** — it keeps its Refresh button, its ✏️ hand-keyed rates
and its own board.json, on port 8780. Merchant fixes made there can be copied
across when you want them public; nothing here writes back.

`static/app.js` handles both homes. Served by this folder's own Python it talks
to `/api/state`; on a static host it falls back to `rates.json` and quietly drops the
buttons that need one — Refresh, the per-merchant re-read, and the hand-keyed
rate. The cut filters keep working, because those are arithmetic in the browser.

Cost: **nothing**. GitHub Actions is free for public repos, Pages is free, and
the whole payload is ~30 KB plus the logo.

## Build it locally first

```bash
python gold-board-web/build_site.py site
```

That writes `site/` — `index.html`, `app.js`, `style.css`, `favicon.svg`,
`yourcardjourney.png`, `rates.json`. Serve that folder anywhere and you have the
site. (`.claude/launch.json` has a `karat-site` entry on port 4322 for a look.)

If the sweep reads nothing at all, the build exits non-zero and publishes
nothing, rather than putting an empty board live.

## Put it on yourcardjourney.store

The site repo is `NishanthBejgam/yourcardjourney` (see the deploy notes for the
main site). Three steps:

1. **Copy the app in** — `app.py`, `merchants.json`, `build_site.py` and
   `static/` into `tools/karat-board/` in that repo.
2. **Copy the workflow** — `deploy/karat-board.yml` to
   `.github/workflows/karat-board.yml`.
3. **Switch Pages to Actions** — repo Settings → Pages → Source = *GitHub
   Actions* (it is currently "Deploy from a branch").

Then Actions → *Karat Board rates* → **Run workflow** to prove it, and the board
lands at **yourcardjourney.store/gold**.

Deploying through Actions rather than committing `rates.json` matters: at four
builds an hour, committing would add ~35,000 commits a year to your repo. This
way the artifact is published straight to Pages and nothing is written back.

## What to expect, honestly

- **"Every 15 minutes" is best-effort.** GitHub's cron queues behind other jobs;
  20–30 minutes is normal at busy times. The page says "updated N minutes ago"
  from the real sweep time, so it can't overstate its freshness.
- **Scheduled workflows switch off after 60 days** with no repo activity. One
  commit, or a click on *Run workflow*, resets that.
- **Tanishq and Bhima are blocked from CI — confirmed, not theoretical.** Both
  return a hard 403 to GitHub's runners (`Access Blocked`, `Attention Required! |
  Cloudflare`); the same requests from a home connection are fine. Cloudflare
  refuses datacenter IPs, and no header or user-agent changes that.

  So every build **seeds itself** from the rates already known — `gold/rates.json`
  in the repo, plus the currently published one, later read per merchant winning.
  Those two tiles keep their last good number, turn amber, and show the time it
  was really read. Six of eight refresh every 15 minutes.

  **To refresh the other two, sweep from this machine and commit the result:**

  ```bash
  python gold-board-web/build_site.py site
  copy siteates.json ..\yourcardjourney\goldates.json
  cd ..\yourcardjourney && git add gold/rates.json && git commit -m "rates" && git push
  ```

  Every later CI build carries those numbers forward. Do it whenever you want
  those two current — daily is plenty, and the page never lies about the age.
- **`curl` must exist on the runner.** `ubuntu-latest` ships it.
- The public page is read-only. Your local copy keeps the ✏️ and Refresh.

## Fallback: sweep from your own PC

Everything already works from this machine, so if CI gets blocked, run the sweep
here and let GitHub only serve the result. Task Scheduler, every 15 minutes:

```bat
cd /d C:\Users\bejga\OneDrive\Desktop\AnthropicClaude\gold-board-web
python build_site.py "%~dp0site"
cd site && git add -A && git commit -m "rates" && git push
```

Same public page, same URL, no cloud sweep. It only updates while your PC is on.

## Before it goes public

The rates are read from each merchant's own public page and every tile links
back to the source. Worth putting a line on the page — *"Indicative rates,
sourced from each merchant's own site; check with the merchant before you
buy"* — and keeping the MMTC and Aspect notes visible, since those two are a
product price and a bullion rate rather than a jeweller's counter rate.
