#!/usr/bin/env python3
"""Run bounded public-query smoke checks against the private search service."""
import json
import time
import urllib.parse
import urllib.request

BASE_URL = "http://127.0.0.1:8888"
CASES = [
    ("general", "python official documentation"),
    ("general", "NASA Artemis official website"),
    ("general", "SearXNG documentation"),
    ("images", "NASA Artemis rocket"),
    ("images", "Hamilton Ohio downtown"),
    ("images", "golden retriever"),
    ("videos", "NASA Artemis launch"),
    ("videos", "Hamilton Ohio city tour"),
    ("videos", "Python tutorial beginners"),
    ("news", "NASA Artemis"),
    ("news", "Hamilton Ohio latest news"),
    ("news", "renewable energy"),
]


def main():
    with urllib.request.urlopen(BASE_URL + "/healthz", timeout=3) as response:
        assert response.status == 200 and response.read() == b"OK", "Unhealthy service"
    with urllib.request.urlopen(BASE_URL + "/config", timeout=3) as response:
        configuration = json.load(response)
    allowed = {"general", "images", "videos", "news"}
    assert set(configuration["categories"]) == allowed, "Unexpected exposed search categories"
    assert all(
        len(engine["categories"]) == 1 and engine["categories"][0] in allowed
        for engine in configuration["engines"]
    ), "Each engine must belong to exactly one supported category"
    reports = []
    for category, query in CASES:
        data = urllib.parse.urlencode(
            {"q": query, "categories": category, "format": "json", "language": "en-US"}
        ).encode()
        started = time.monotonic()
        request = urllib.request.Request(BASE_URL + "/search", data=data)
        with urllib.request.urlopen(request, timeout=15) as response:
            payload = json.load(response)
        results = payload.get("results", [])
        assert all(result.get("category") == category for result in results), "Cross-category result"
        reports.append({
            "category": category,
            "query": query,
            "elapsedSeconds": round(time.monotonic() - started, 2),
            "resultCount": len(results),
            "enginesWithResults": sorted({engine for result in results for engine in result.get("engines", [])}),
            "resultCategories": sorted({result.get("category", "") for result in results}),
            "mediaResultCount": sum(bool(result.get("img_src") or result.get("thumbnail") or result.get("thumbnail_src")) for result in results),
            "unresponsiveEngines": payload.get("unresponsive_engines", []),
            "sample": [
                {"title": result.get("title"), "url": result.get("url"),
                 "snippet": str(result.get("content", ""))[:240]}
                for result in results[:2]
            ],
        })
        time.sleep(1)
    print(json.dumps({"health": "OK", "checks": reports}, indent=2))
    if any(not report["resultCount"] for report in reports):
        raise SystemExit("One or more public-query checks returned no results")


if __name__ == "__main__":
    main()
