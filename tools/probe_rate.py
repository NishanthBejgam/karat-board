"""Does a fetched Tanishq page actually carry the rate the board looks for?

Temporary, alongside the kb-probe workflow. Delete both once answered.
"""
import html
import re
import sys

raw = open(sys.argv[1], encoding="utf-8", errors="replace").read()
text = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", raw)
text = re.sub(r"\s+", " ", html.unescape(re.sub(r"(?s)<[^>]+>", " ", text)))

print("  text chars:", len(text))

pattern = r"22\s*Kt\s*Gold\s*Rate.{0,400}?1\s*G\s*₹\s*([\d,]+)"
m = re.search(pattern, text, re.S | re.I)
print("  board pattern ->", m.group(1) if m else "NO MATCH")

for i, hit in enumerate(re.finditer(r"(?i)22\s*Kt", text)):
    if i >= 3:
        break
    print("  ::", text[max(0, hit.start() - 70):hit.start() + 200].strip()[:210])
