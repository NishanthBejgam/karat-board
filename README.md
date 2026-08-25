# Karat Board

**Every jeweller's gold rate on one screen — 22K and 24K, per gram or per 10 g.**

Live at **[karatboard.yourcardjourney.store](https://karatboard.yourcardjourney.store)**

Eight merchants publish the same two numbers eight different ways: one scrolls
them past in a marquee, one paints them in with React, one drops a PDF on S3,
one streams them over a socket, one prints 22K and leaves the 24K arithmetic to
you. This reads all of them, normalises everything to a per-gram rate, and puts
it on one board with the cheapest called out.

18K and 14K are dropped on purpose. Only 22K and 24K are kept.

## How it is a website with no server

The sweep runs on a schedule, not on a visitor's request:

```
GitHub Actions, every 15 min
  └─ python tools/build_site.py _site ──> 8 merchants ──> _site/rates.json
                                                              │
                        karatboard.yourcardjourney.store <────┘   static, free
```

`tools/static/app.js` reads `/api/state` when a backend is there and falls back
to `rates.json` when it isn't, so the same page serves the local app and the
published site.

## Merchants

| Merchant | How it is read | Publishes |
|---|---|---|
| Malabar | its own `getMetalRate` GraphQL call | 22K + 24K |
| Tanishq | page text | 22K; 24K derived |
| Kalyan (Candere) | page text, Hyderabad board | 22K + 24K |
| MMTC-PAMP | the price-list PDF on S3 | 22K + 24K *(minted-product price)* |
| Aspect Bullion | its live socket.io ticker + published premium | 24K; 22K derived |
| Bangalore Refinery | its `rates.txt` feed | 22K + 24K + buyback |
| PNG Jewellers | page text | 22K + 24K |
| Bhima | rate JSON embedded in the storefront | 22K + 24K |

**Tanishq and Bhima sit behind Cloudflare, which refuses datacenter IPs.** They
return a hard 403 to GitHub's runners while the same request from a home
connection is fine. Each build therefore seeds itself from `seed/rates.json`
and the published board, so those two keep their last good number, turn amber,
and show the time it was really read. The other six refresh every 15 minutes.

To refresh those two, sweep from a residential connection and commit the result:

```bash
python tools/build_site.py _site
cp _site/rates.json seed/rates.json
git commit -am "rates" && git push
```

## Changing a merchant

Everything about a merchant is a recipe in `tools/merchants.json` — URL, adapter,
patterns. Nothing is hardcoded. Six adapters: `text_regex`, `raw_regex`,
`pairs_json`, `pdf_regex`, `socketio_livedata`, `link_only`. Adding a ninth
merchant is a ninth block.

Requires `pypdf` for the MMTC price list; everything else is standard library.

---

Shared by **[@YourCardJourney](https://yourcardjourney.store)**
