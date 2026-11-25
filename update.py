#!/usr/bin/env python3
"""The Fashion News - daily content update.

Runs once a day on GitHub Actions. Uses only the Python standard library.
Writes data/today.json (read by the app) and grows data/met_pool.json.

Rules this script follows:
- News text is the publisher's own headline and excerpt, never rewritten.
- Only publishers on the CREDIBLE list are kept.
- Fabric/term text is Wikipedia's own wording, credited CC BY-SA 4.0.
- Images are public domain (The Met) or openly licensed (Wikimedia), with credit.
- Look of the day is a pin from approved public Pinterest boards, shown only via Pinterest's embed.
- If a source fails, it is skipped and logged; yesterday's good data is kept.
"""
import datetime as dt
import email.utils
import hashlib
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
# Works whether files sit in a data/ folder or loose next to this script.
DATA = os.path.join(HERE, "data") if os.path.isdir(os.path.join(HERE, "data")) else HERE
UA = "TheFashionNewsBot/1.0 (personal news app; GitHub Actions)"
NOW = dt.datetime.now(dt.timezone.utc)
TODAY = NOW.date()
LOG = {"ok": [], "failed": []}

# ---------------------------------------------------------------- sources
FEEDS = [
    ("The Guardian", "https://www.theguardian.com/fashion/rss"),
    ("Vogue", "https://www.vogue.com/feed/rss"),
    ("Harper's Bazaar", "https://www.harpersbazaar.com/rss/all.xml/"),
    ("Elle", "https://www.elle.com/rss/all.xml/"),
    ("WWD", "https://wwd.com/feed/"),
    ("The Business of Fashion", "https://www.businessoffashion.com/arc/outboundfeeds/rss/?outputType=xml"),
    ("Dazed", "https://www.dazeddigital.com/rss"),
    ("Just Style", "https://www.just-style.com/feed/"),
    ("Glossy", "https://www.glossy.co/feed/"),
    ("BellaNaija", "https://www.bellanaija.com/style/feed/"),
    ("Fashionista", "https://fashionista.com/.rss/full/"),
    ("Highsnobiety", "https://www.highsnobiety.com/feed/"),
    ("Hypebeast", "https://hypebeast.com/feed"),
]
GNEWS_QUERIES = [
    "fashion industry", "fashion creative director", "luxury fashion house", "fashion week",
    "African fashion designer", "Lagos fashion", "South African fashion", "Congo fashion",
    "fashion tariffs", "textile industry", "fashion sustainability law", "fashion retail sales",
]
CREDIBLE = {
    "vogue", "british vogue", "vogue business", "vogue scandinavia", "vogue arabia", "wwd",
    "women's wear daily", "the business of fashion", "business of fashion", "elle", "elle uk",
    "harper's bazaar", "reuters", "bloomberg", "financial times", "the new york times",
    "the guardian", "bbc", "bbc news", "ap news", "associated press", "afp", "cnn", "cnbc",
    "the wall street journal", "the economist", "fortune", "fashionunited", "fashion united",
    "fashionnetwork", "fashionnetwork.com", "fashion network", "just style", "just-style",
    "drapers", "retail gazette", "glossy", "dazed", "i-d", "hypebeast", "highsnobiety",
    "fashionista", "w magazine", "marie claire", "the cut", "gq", "esquire", "grazia",
    "l'officiel", "wallpaper*", "wallpaper", "dezeen", "africanews", "bellanaija",
    "the guardian nigeria", "guardian nigeria", "thisday", "thisdaylive", "premium times",
    "businessday", "daily maverick", "news24", "mail & guardian", "timeslive", "nation africa",
    "the africa report", "euronews", "le monde", "modaes", "theindustry.fashion",
    "sourcing journal", "footwear news", "retail dive", "modern retail", "the independent",
    "the times", "the telegraph", "time", "npr", "al jazeera", "france 24", "dw",
}
TAGS = [
    ("Africa", r"\b(africa|african|nigeria|lagos|ghana|accra|kenya|nairobi|south africa|johannesburg|cape town|congo|kinshasa|senegal|dakar|ethiopia|rwanda|kigali|uganda|tanzania|morocco|egypt|côte d'ivoire|ivory coast)\b"),
    ("Trade", r"\b(tariff|tariffs|import|imports|export|exports|customs|supply chain|sourcing|de minimis|trade)\b"),
    ("Sustainability", r"\b(sustainab\w*|recycl\w*|resale|second-hand|secondhand|circular|waste|climate|emissions|greenwash\w*|deadstock)\b"),
    ("Designers", r"\b(creative director|designer|collection|runway|couture|debut|show|atelier|catwalk)\b"),
    ("Business", r"\b(ceo|chief executive|sales|revenue|profit|acquir\w*|acquisition|shares|investor|ipo|retailer|stake|takeover|earnings|layoffs?|bankrupt\w*|lawsuit|sues)\b"),
    ("Trends", r"\b(trend|trends|street style|viral|tiktok|nostalgia|aesthetic|colour of the year|color of the year)\b"),
]


def fetch(url, timeout=25, label=None):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = r.read()
        if label:
            LOG["ok"].append(label)
        return data
    except Exception as e:  # noqa: BLE001 - any failure means skip this source
        if label:
            LOG["failed"].append(f"{label}: {type(e).__name__} {str(e)[:80]}")
        return None


def fetch_json(url, label=None):
    raw = fetch(url, label=label)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except ValueError:
        return None


def clean(text, limit=None):
    text = html.unescape(re.sub(r"<[^>]+>", " ", text or ""))
    text = re.sub(r"\s+", " ", text).strip()
    if limit and len(text) > limit:
        text = text[:limit].rsplit(" ", 1)[0].rstrip(",;:") + "…"
    return text


def parse_date(s):
    if not s:
        return None
    try:
        d = email.utils.parsedate_to_datetime(s)
    except (TypeError, ValueError):
        try:
            d = dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
        except ValueError:
            return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=dt.timezone.utc)
    return d


def local(tag):
    return tag.rsplit("}", 1)[-1]


def parse_feed(raw, source):
    """Return list of dicts from RSS or Atom bytes."""
    try:
        root = ET.fromstring(raw)
    except ET.ParseError:
        return []
    items = []
    for node in root.iter():
        if local(node.tag) not in ("item", "entry"):
            continue
        f = {local(c.tag): c for c in node}
        title = clean((f.get("title").text if f.get("title") is not None else ""))
        link = ""
        if f.get("link") is not None:
            link = (f["link"].text or f["link"].get("href") or "").strip()
        def first(*names):  # Elements without children are falsy, so test for None explicitly
            for n in names:
                if f.get(n) is not None:
                    return f[n]
            return None
        dnode = first("pubDate", "published", "updated", "date")
        date = parse_date(dnode.text if dnode is not None else None)
        desc_node = first("description", "summary")
        excerpt = clean(desc_node.text if desc_node is not None else "", 230)
        src = source
        if f.get("source") is not None and (f["source"].text or "").strip():
            src = f["source"].text.strip()
        if title and link:
            items.append({"title": title, "url": link, "date": date, "excerpt": excerpt, "source": src})
    return items


def credible(name):
    n = name.lower().strip()
    return n in CREDIBLE or any(n.startswith(c + " ") for c in CREDIBLE)


def tags_for(text):
    t = text.lower()
    found = [name for name, rx in TAGS if re.search(rx, t)]
    return found[:2] or ["Culture"]


def collect_news():
    items = []
    for name, url in FEEDS:
        raw = fetch(url, label=f"feed:{name}")
        if raw:
            got = parse_feed(raw, name)
            if not got:
                LOG["failed"].append(f"feed:{name}: no items parsed")
            items += got
    for q in GNEWS_QUERIES:
        url = "https://news.google.com/rss/search?" + urllib.parse.urlencode(
            {"q": f"{q} when:3d", "hl": "en-GB", "gl": "GB", "ceid": "GB:en"})
        raw = fetch(url, label=f"gnews:{q}")
        for it in parse_feed(raw or b"", "Google News"):
            # Google News titles end with " - Publisher"; keep the publisher's own headline.
            it["title"] = re.sub(r"\s+-\s+[^-]+$", "", it["title"]).strip()
            it["excerpt"] = ""
            items.append(it)
    cutoff = NOW - dt.timedelta(days=4)
    seen, out = set(), []
    for it in sorted(items, key=lambda x: x["date"] or NOW - dt.timedelta(days=30), reverse=True):
        if not credible(it["source"]):
            continue
        if it["date"] and it["date"] < cutoff:
            continue
        key = re.sub(r"[^a-z0-9]", "", it["title"].lower())[:70]
        if key in seen:
            continue
        seen.add(key)
        it["tags"] = tags_for(it["title"] + " " + it["excerpt"])
        it["id"] = hashlib.md5(it["url"].encode()).hexdigest()[:10]
        it["date"] = (it["date"] or NOW).isoformat()
        out.append(it)
    return out[:60]


# ---------------------------------------------------------------- wikipedia
def commons_credit(filename):
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
        "action": "query", "format": "json", "titles": "File:" + filename, "prop": "imageinfo",
        "iiprop": "url|extmetadata", "iiurlwidth": 1200,
        "iiextmetadatafilter": "Artist|LicenseShortName"})
    j = fetch_json(url)
    try:
        page = next(iter(j["query"]["pages"].values()))
        ii = page["imageinfo"][0]
        meta = ii.get("extmetadata", {})
        return {
            "src": ii.get("thumburl") or ii["url"],
            "page": ii["descriptionurl"],
            "author": clean(meta.get("Artist", {}).get("value", "Unknown"), 80),
            "license": clean(meta.get("LicenseShortName", {}).get("value", ""), 40),
        }
    except (TypeError, KeyError, StopIteration, IndexError):
        return None


def wiki_entry(title):
    url = "https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode({
        "action": "query", "format": "json", "redirects": 1, "titles": title,
        "prop": "extracts|pageimages|info|pageprops", "inprop": "url", "exintro": 1,
        "explaintext": 1, "exsentences": 4, "piprop": "name", "pilicense": "free"})
    j = fetch_json(url, label=f"wikipedia:{title}")
    try:
        page = next(iter(j["query"]["pages"].values()))
    except (TypeError, KeyError, StopIteration):
        return None
    if "missing" in page or "disambiguation" in page.get("pageprops", {}):
        return None
    text = re.sub(r"\s*\(\s*[;,]?\s*\)", "", page.get("extract", "")).strip()
    text = re.sub(r"\s+", " ", text)
    if len(text) < 60:
        return None
    entry = {"title": page["title"], "text": text, "url": page["fullurl"],
             "textLicense": "Text from Wikipedia, CC BY-SA 4.0", "image": None}
    if page.get("pageimage"):
        entry["image"] = commons_credit(page["pageimage"])
    return entry


def pick_from(titles, offset):
    n = len(titles)
    start = (TODAY.toordinal() + offset) % n
    for i in range(n):
        e = wiki_entry(titles[(start + i) % n])
        if e:
            return e
    return None


# ---------------------------------------------------------------- the met
MET_QUERIES = ["evening dress", "ball gown", "day dress", "coat", "jacket", "hat", "shoes", "fan",
               "shawl", "bodice", "cape", "robe", "corset", "bonnet", "gloves", "parasol", "purse",
               "waistcoat", "kimono", "suit", "court dress", "wedding dress", "textile", "embroidery"]


def grow_met_pool(pool, state, budget=320):
    have = {p["id"] for p in pool}
    qi, off = state.get("met_q", 0), state.get("met_off", 0)
    looked = 0
    while looked < budget:
        q = MET_QUERIES[qi % len(MET_QUERIES)]
        url = ("https://collectionapi.metmuseum.org/public/collection/v1.1/search?" +
               urllib.parse.urlencode({"q": q, "departmentId": 8, "hasImages": "true",
                                       "limit": 40, "offset": off}))
        j = fetch_json(url)
        ids = (j or {}).get("objectIDs") or []
        if not ids:
            qi, off = qi + 1, 0
            if not j:
                LOG["failed"].append("met:search")
                break
            continue
        for oid in ids:
            looked += 1
            if oid in have:
                continue
            o = fetch_json(f"https://collectionapi.metmuseum.org/public/collection/v1/objects/{oid}")
            time.sleep(0.03)
            if o and o.get("isPublicDomain") and o.get("primaryImageSmall"):
                pool.append({"id": oid, "title": o.get("title", ""), "date": o.get("objectDate", ""),
                             "culture": o.get("culture", ""), "artist": o.get("artistDisplayName", ""),
                             "medium": (o.get("medium") or "")[:80], "img": o.get("primaryImage") or o["primaryImageSmall"],
                             "thumb": o["primaryImageSmall"], "url": o.get("objectURL", ""),
                             "credit": o.get("creditLine", "")})
                have.add(oid)
        off += 40
        if off >= 1200:
            qi, off = qi + 1, 0
    state["met_q"], state["met_off"] = qi % len(MET_QUERIES), off
    LOG["ok"].append(f"met: scanned {looked}, pool {len(pool)}")
    return pool[-3000:]


def potd():
    d = TODAY
    j = fetch_json(f"https://api.wikimedia.org/feed/v1/wikipedia/en/featured/{d.year}/{d.month:02d}/{d.day:02d}",
                   label="wikimedia:picture-of-the-day")
    try:
        im = j["image"]
        return {"kind": "potd", "title": clean(im.get("description", {}).get("text", "Picture of the day"), 140),
                "img": im["image"]["source"], "url": im["file_page"],
                "credit": f"{clean(im.get('artist', {}).get('text', ''), 60)} · {im.get('license', {}).get('type', '')}"}
    except (TypeError, KeyError):
        return None


# ---------------------------------------------------------------- look of the day (Pinterest)
# Same approved boards as the app. The app picks its own look live; this pick is the backup
# used when the phone cannot reach Pinterest. Shown only through Pinterest's official embed.
BOARDS = {
    "current": ["infashion/haute-couture", "nosouvenirs/fashion-haute-couture-runway",
                "maryofthesoul/haute-couture-runway", "beareyes574/a-haute-couture-runway"],
    "archive": ["fabricistaa/90s-runway-archive", "archivesolaire/runway-archives-90s-00s",
                "ash_curates/runway-archival"],
}


def pin_text(s):
    s = html.unescape(s or "")
    s = re.sub(r"https?://\S+", "", s or "")
    s = re.sub(r"\s*[|#].*$", "", s)
    s = re.sub(r"\[photos\]|\(photos\)|,?\s*(runway,?\s*)?fashion show\s*(&|and)\s*collection review|\s+-\s+(vogue|photos)$", "", s, flags=re.I)
    s = re.sub(r"[\s,.:;-]+$", "", re.sub(r"\s+", " ", s))
    return re.sub(r"\s+", " ", s).strip()[:140]


def pick_pin(state):
    import random
    kind = "archive" if TODAY.toordinal() % 2 else "current"
    shown = set(state.get("pins_shown", []))
    cands = []
    for b in BOARDS[kind]:
        j = fetch_json(f"https://widgets.pinterest.com/v3/pidgets/boards/{b}/pins/", label=f"pinterest:{b}")
        d = (j or {}).get("data") or {}
        name = html.unescape((d.get("board") or {}).get("name") or "") or b.split("/")[1]
        for p in d.get("pins") or []:
            pid = str(p.get("id") or "")
            if pid and p.get("images") and pid not in shown:
                cands.append({"kind": "pin", "id": pid, "d": pin_text(p.get("description")), "b": b, "bn": name})
    if not cands:
        return None
    pin = random.Random(TODAY.toordinal()).choice(cands)
    state["pins_shown"] = (state.get("pins_shown", []) + [pin["id"]])[-5000:]
    return pin


# ---------------------------------------------------------------- main
def load(name, default):
    try:
        with open(os.path.join(DATA, name), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def save(name, obj):
    with open(os.path.join(DATA, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)


def main():
    prev = load("today.json", {})
    library = load("library.json", {"fabrics": [], "terms": []})
    events = load("events.json", {"events": []})
    state = load("state.json", {})
    pool = load("met_pool.json", [])

    news = collect_news()
    if len(news) < 6:  # keep yesterday's stories rather than show an empty page
        LOG["failed"].append(f"news: only {len(news)} fresh items, kept previous")
        news = (news + prev.get("news", []))[:60]

    pool = grow_met_pool(pool, state, budget=60)  # still feeds the Met tab in Inspire
    prev_hero = prev.get("hero") if (prev.get("hero") or {}).get("kind") == "pin" else None
    hero = pick_pin(state) or prev_hero or potd() or prev.get("hero")

    fabric = pick_from(library["fabrics"], 0) or prev.get("fabric")
    term = pick_from(library["terms"], 7) or prev.get("term")

    iso = TODAY.isoformat()
    evs = events.get("events", [])
    upcoming = sorted([e for e in evs if e["e"] >= iso], key=lambda e: e["s"])
    recent = sorted([e for e in evs if e["e"] < iso and e["e"] >= (TODAY - dt.timedelta(days=150)).isoformat()],
                    key=lambda e: e["s"], reverse=True)

    out = {
        "generated": NOW.isoformat(timespec="minutes"),
        "date": iso,
        "hero": hero,
        "news": news,
        "fabric": fabric,
        "term": term,
        "events": {"upcoming": upcoming, "recent": recent, "checked": events.get("checked")},
        "log": LOG,
    }
    save("today.json", out)
    save("met_pool.json", pool)
    save("state.json", state)
    print(json.dumps({"news": len(news), "pool": len(pool), "fabric": (fabric or {}).get("title"),
                      "term": (term or {}).get("title"), **LOG}, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
