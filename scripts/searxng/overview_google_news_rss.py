"""Public Google News RSS discovery with source-provided publication dates.

No article requests, redirect resolution, accounts, or CAPTCHA workarounds.
The application still enforces its exact rolling UTC publication cutoff.
"""
from datetime import timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
import re
from urllib.parse import urlencode, urlsplit

from lxml import etree

about = {
    "website": "https://news.google.com/",
    "use_official_api": False,
    "require_api_key": False,
    "results": "RSS",
}
categories = ["news"]
paging = False
language_support = False
safesearch = False
time_range_support = True
_RANGES = {"day": "1d", "week": "7d", "month": "30d", "year": "365d"}
_MAX_BYTES = 2 * 1024 * 1024
_MAX_ITEMS = 100


class _Text(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "template", "noscript", "iframe", "object"}:
            self.hidden += 1

    def handle_endtag(self, tag):
        if tag in {"script", "style", "template", "noscript", "iframe", "object"}:
            self.hidden = max(0, self.hidden - 1)

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def _text(value, limit):
    parser = _Text()
    parser.feed((value or "")[:limit * 8])
    parser.close()
    return " ".join(" ".join(parser.parts).split())[:limit]


def request(query, params):
    if not isinstance(query, str) or not query.strip() or len(query) > 500 or re.search(r"[\x00-\x1f\x7f]", query):
        raise ValueError("Invalid News query")
    time_range = params.get("time_range")
    if time_range and time_range not in _RANGES:
        raise ValueError("Unsupported News time range")
    # A provider-side selector improves discovery; it never substitutes for the
    # application's exact timestamp check or changes the selected category.
    term = query.strip() + (f" when:{_RANGES[time_range]}" if time_range else "")
    params["url"] = "https://news.google.com/rss/search?" + urlencode({
        "q": term, "hl": "en-US", "gl": "US", "ceid": "US:en",
    })
    params["headers"]["Accept"] = "application/rss+xml, application/xml;q=0.9"
    params["allow_redirects"] = False
    params["max_redirects"] = 0
    return params


def response(resp):
    raw = resp.content
    if len(raw) > _MAX_BYTES or b"<!doctype" in raw.lower() or b"<!entity" in raw.lower():
        raise ValueError("Invalid News feed")
    parser = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False, recover=False, huge_tree=False)
    root = etree.fromstring(raw, parser=parser)
    if root.tag != "rss" or root.getroottree().docinfo.doctype:
        raise ValueError("Invalid News feed")
    results, seen = [], set()
    for item in root.findall("./channel/item")[:_MAX_ITEMS]:
        url = (item.findtext("link") or "").strip()
        if len(url) > 4096 or re.search(r"[\x00-\x20\x7f\\]", url):
            continue
        try:
            parsed = urlsplit(url)
            if (parsed.scheme != "https" or parsed.hostname != "news.google.com"
                    or parsed.username or parsed.password or parsed.port not in (None, 443)
                    or not re.fullmatch(r"/(?:rss/)?articles/[A-Za-z0-9_-]+", parsed.path)):
                continue
        except ValueError:
            continue
        title = _text(item.findtext("title"), 300)
        if not title or url in seen:
            continue
        seen.add(url)
        result = {"title": title, "url": url, "content": _text(item.findtext("description"), 600)}
        published = (item.findtext("pubDate") or "").strip()
        if len(published) <= 128:
            try:
                date = parsedate_to_datetime(published)
                if date.tzinfo is not None:
                    result["publishedDate"] = date.astimezone(timezone.utc)
            except (TypeError, ValueError, OverflowError):
                pass  # Undated is explicit; never infer from snippet/URL/current time.
        results.append(result)
    return results
