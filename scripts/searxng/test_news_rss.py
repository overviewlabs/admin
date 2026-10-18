"""Offline RSS safety/contract tests; no network, credentials, or service restart."""
from datetime import datetime, timezone
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from urllib.parse import parse_qs, urlsplit
from xml.sax.saxutils import escape


spec = importlib.util.spec_from_file_location("news_rss", Path(__file__).with_name("overview_google_news_rss.py"))
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)


def item(title="Real news", url="https://news.google.com/rss/articles/CBMi_test?oc=5", date="Tue, 22 Sep 2026 20:13:41 GMT", description="Publisher summary"):
    return "<item>" + "".join(f"<{key}>{escape(value)}</{key}>" for key, value in {
        "title": title, "link": url, "pubDate": date, "description": description,
    }.items()) + "</item>"


def parse(items):
    return engine.response(SimpleNamespace(content=f"<rss><channel>{items}</channel></rss>".encode()))


class NewsRssTest(unittest.TestCase):
    def test_native_ranges_are_bounded_query_values_on_one_fixed_news_endpoint(self):
        for time_range, suffix in {"day": "1d", "week": "7d", "month": "30d", "year": "365d"}.items():
            with self.subTest(time_range=time_range):
                params = engine.request('Hamilton Ohio crime & ceid=other', {"headers": {}, "time_range": time_range})
                url = urlsplit(params["url"])
                self.assertEqual((url.scheme, url.netloc, url.path), ("https", "news.google.com", "/rss/search"))
                query = parse_qs(url.query)
                self.assertEqual(query["q"], [f"Hamilton Ohio crime & ceid=other when:{suffix}"])
                self.assertEqual(query["ceid"], ["US:en"])
                self.assertFalse(params["allow_redirects"])
                self.assertEqual(params["max_redirects"], 0)
        self.assertEqual(engine.categories, ["news"])
        self.assertTrue(engine.time_range_support)

    def test_unfiltered_search_does_not_invent_a_date_restriction(self):
        params = engine.request("Hamilton Ohio", {"headers": {}, "time_range": ""})
        self.assertEqual(parse_qs(urlsplit(params["url"]).query)["q"], ["Hamilton Ohio"])

    def test_invalid_queries_and_ranges_are_rejected(self):
        for query in ["", "  ", "x" * 501, "line\nbreak", None]:
            with self.subTest(query=query), self.assertRaises(ValueError):
                engine.request(query, {"headers": {}})
        with self.assertRaises(ValueError):
            engine.request("news", {"headers": {}, "time_range": "century"})

    def test_source_timestamp_is_preserved_and_normalized_to_utc(self):
        result = parse(item(date="Tue, 22 Sep 2026 16:13:41 -0400"))[0]
        self.assertEqual(result["publishedDate"], datetime(2026, 9, 22, 20, 13, 41, tzinfo=timezone.utc))
        self.assertEqual(result["url"], "https://news.google.com/rss/articles/CBMi_test?oc=5")

    def test_missing_invalid_and_timezone_free_dates_stay_unknown(self):
        for date in ["", "3 days ago", "not a date", "Tue, 22 Sep 2026 20:13:41", "x" * 129]:
            with self.subTest(date=date):
                self.assertNotIn("publishedDate", parse(item(date=date))[0])

    def test_future_and_old_dates_are_not_falsified_to_today(self):
        self.assertEqual(parse(item(date="Tue, 01 Jan 2030 00:00:00 GMT"))[0]["publishedDate"].year, 2030)
        self.assertEqual(parse(item(date="Wed, 01 Jan 2020 00:00:00 GMT"))[0]["publishedDate"].year, 2020)

    def test_title_and_description_are_bounded_plain_text(self):
        result = parse(item(title="<b>Real</b> & clear", description="<script>not visible</script><b>Safe</b> & useful"))[0]
        self.assertEqual(result["title"], "Real & clear")
        self.assertEqual(result["content"], "Safe & useful")
        long = parse(item(title="a" * 3000, description="b" * 7000))[0]
        self.assertEqual(len(long["title"]), 300)
        self.assertEqual(len(long["content"]), 600)

    def test_links_are_not_decoded_or_followed_to_untrusted_endpoints(self):
        for url in ["javascript:alert(1)", "http://news.google.com/rss/articles/test", "https://news.google.com.evil.test/rss/articles/test",
                    "https://user:password@news.google.com/rss/articles/test", "https://news.google.com:8443/rss/articles/test",
                    "https://127.0.0.1/private", "https://publisher.example/story", "https://news.google.com/search?q=secret",
                    "https://news.google.com/\\evil.test/rss/articles/test", "https://news.google.com:invalid/rss/articles/test"]:
            with self.subTest(url=url):
                self.assertEqual(parse(item(url=url)), [])

    def test_duplicates_and_blank_titles_are_removed(self):
        self.assertEqual(len(parse(item() + item() + item(title="", url="https://news.google.com/rss/articles/other"))), 1)

    def test_item_count_is_bounded(self):
        self.assertEqual(len(parse("".join(item(url=f"https://news.google.com/rss/articles/{i}") for i in range(120)))), 100)

    def test_xml_entities_dtds_and_oversized_or_non_xml_responses_are_rejected(self):
        for raw in [b'<!DOCTYPE rss [<!ENTITY secret SYSTEM "file:///etc/passwd">]><rss><channel>&secret;</channel></rss>',
                    b'<!DOCTYPE rss SYSTEM "https://evil.example/dtd"><rss/>', b'<!ENTITY a "test"><rss/>',
                    '<?xml version="1.0" encoding="UTF-16"?><!DOCTYPE rss [<!ENTITY x "hidden">]><rss><channel/></rss>'.encode('utf-16'),
                    b'<html>Challenge page</html>', b'<rss>', b'x' * (2 * 1024 * 1024 + 1)]:
            with self.subTest(size=len(raw)), self.assertRaises((ValueError, engine.etree.XMLSyntaxError)):
                engine.response(SimpleNamespace(content=raw))


if __name__ == "__main__":
    unittest.main()
