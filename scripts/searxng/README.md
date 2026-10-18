# Private SearXNG service

WHOXOS uses this server-local search backend. It has no public listener,
Caddy route, external search account, or provider API key. The application must
authenticate callers, enforce organization access, throttle search requests, and
treat search results as untrusted external content.

## Deployment

The installer is for Debian/Ubuntu with Python 3.14 and systemd. It installs
missing `python3-venv`, `git`, and `ca-certificates` packages, pins the official
SearXNG Git commit in `revision`, and installs the frozen Python dependencies.
Granian runs the official WSGI application with one worker. The SearXNG Granian
guide currently describes official support for container deployments; this
recipe runs the same WSGI entrypoint directly under systemd.

From the repository root, as root:

```sh
bash scripts/searxng/install.sh
```

Repeated installation preserves the generated signing secret, refreshes the
managed settings, and restarts **only** `overview-labs-searxng.service`. It never
restarts the WHOXOS app or modifies Caddy. Edit `settings.yml.template`
and rerun the installer to make persistent configuration changes. Do not put
real secrets in the template. Updating SearXNG requires reviewing a new commit
and dependency lock before changing `revision`.

| Location | Purpose |
| --- | --- |
| `/opt/overview-labs/searxng/src` | Root-owned pinned official source |
| `/opt/overview-labs/searxng/venv` | Root-owned isolated Python environment |
| `/etc/overview-labs-searxng/settings.yml` | Generated settings, root:searxng, mode 0640 |
| `/etc/systemd/system/overview-labs-searxng.service` | Boot-enabled service |
| `/var/lib/overview-labs-searxng` | Private service state |
| `/var/cache/overview-labs-searxng` | Private service cache |

The process runs as the dedicated, non-login `searxng` user. Its listener is
`127.0.0.1:8888`, with no IPv6 wildcard or public listener. It has a read-only
system filesystem, private temporary directory, no capabilities, a 768 MiB
memory ceiling, one CPU quota, and automatic restart on failure. No Valkey is
needed because the public-instance and limiter settings are disabled. Only the
trusted local application should call this service.

## API and operations

`GET http://127.0.0.1:8888/healthz` returns plain `OK` with status 200. This checks
the application process; it does not guarantee upstream search availability.

Search uses form-encoded POST requests to `http://127.0.0.1:8888/search`:

```sh
curl --fail --silent --show-error \
  --data-urlencode 'q=NASA Artemis official website' \
  --data 'format=json&categories=general&language=en' \
  http://127.0.0.1:8888/search
```

Pass exactly one category: `general`, `images`, `videos`, or `news`. No other
categories or engine subcategories are enabled. Images return `img_src` and
thumbnail fields; videos return video page URLs and optional thumbnails. Results
also include `title`, `url`, `content`, and `engines`; inspect
`unresponsive_engines` even when HTTP status is 200. A healthy
service may return partial results or no results when upstream providers are
unavailable. Report that limitation instead of inventing an answer. Never bypass
CAPTCHAs or provider blocks. Disable a persistently blocked engine in the template
and reinstall the service.

```sh
systemctl status overview-labs-searxng.service
systemctl restart overview-labs-searxng.service
journalctl -u overview-labs-searxng.service --since '10 minutes ago'
python3 scripts/searxng/probe.py
python3 scripts/searxng/test_private_logging.py
```

Granian access logging is off. The WSGI logging wrapper preserves severity and
component only, removing messages, formatting arguments, and exception stacks
that could contain query strings or upstream response bodies. Search queries
still go to the selected upstream engines as required to perform a search.
`probe.py` deliberately uses twelve fixed public queries and prints a bounded
diagnostic report to the operator; it is not a user-query log or a scheduled job.

## Verification on 2026-09-27

Pinned revision: `12f8b6515ca77c3c3bc1498584950ef5daca1433`
(SearXNG `2026.9.25+12f8b65`), Granian `2.8.3`.

The original two-category installation was verified with six public queries.
Later tuning found Google general blocked by CAPTCHA, Brave rate-limited,
DuckDuckGo Images denying access, and Bing News failing to parse 2/3 probes.
These engines have been removed from `keep_only`; they are not retried through
other identities, proxies, or CAPTCHA bypasses.

The managed recipe's engine set is:

| Category | Engines |
| --- | --- |
| General | Bing, DuckDuckGo, Wikipedia |
| Images | Bing Images, Wikimedia Commons Images |
| Videos | Bing Videos, DuckDuckGo Videos, YouTube |
| News | DuckDuckGo News, Google News RSS (local extension) |

Every engine has one explicit category. The global request limit and individual
engine timeouts are 2.5 seconds. SearXNG returns available partial results when a
provider exceeds the deadline; queueing and network overhead may add latency.
Its native parser always supports `!engine`, `!category`, and `!!external`
overrides: there is no configuration switch to disable them in this pinned
release. The calling application must enforce one allowed category and reject
or strip override tokens and direct engine parameters. Preference locks alone do
not enforce that API boundary.

Before these changes, requesting Images or Videos incorrectly fell back to
General because no matching engines were configured. With category engines
installed, the first twelve checks all returned the requested result category
in 0.29–0.85 seconds; those checks identified the failing engines removed above.
Hamilton Ohio in News returned local Hamilton/Butler County reporting rather
than general publisher homepages or Hamilton musical results. Search results
are ranked suggestions, not a guarantee of complete or current news coverage.

The final twelve-query sweep after removing failing engines reported zero
unresponsive engines and no result-category mismatches:

| Category | Three-query elapsed range | Results per query |
| --- | --- | --- |
| General | 0.53–0.58 seconds | 13–14 |
| Images | 0.42–0.97 seconds | 45, all with image metadata |
| Videos | 0.58–0.82 seconds | 77–82 |
| News | 0.31–0.35 seconds | 20–40 |

## Dated News discovery

The local `overview_google_news_rss.py` extension uses Google's public News RSS
feed at `https://news.google.com/rss/search`. It replaces the HTML Google News
parser, which only supplies relative date text inside snippets. No article pages
or redirects are fetched. RSS results retain their Google News article links;
the extension does not guess or decode publisher article URLs.

The feed is currently English with the US edition. A selected `day`, `week`,
`month`, or `year` becomes a provider discovery selector of `when:1d`, `when:7d`,
`when:30d`, or `when:365d`. The app **also** enforces its exact rolling UTC cutoff
using the source's RFC822 `pubDate`, preserving timezone offsets. Undated,
invalid, future, and out-of-window timestamps do not qualify for dated searches.
The extension never manufactures dates from titles, URLs, relative snippets, or
the current clock. Native range filtering excludes engines without range support;
unfiltered News can still use DuckDuckGo News.

Requests retain the 2.5-second engine deadline and the app's 6-second deadline.
The parser disables external entities and DTD loading, rejects DTDs, bounds the
feed to 2 MiB and 100 items, emits bounded plain text, and accepts only HTTPS
Google News article links without embedded credentials or nonstandard ports.
It does not retry blocks through alternate identities or proxies.

Deploy the search recipe **before** publishing an app version that sends native
News `time_range`. The existing installer copies the reviewed local engine into
the pinned upstream engine directory before restarting, preserves the generated
secret from `/etc/overview-labs-searxng/settings.yml`, and prints only the health
result. It never displays that secret or restarts the WHOXOS app:

```sh
PYTHONDONTWRITEBYTECODE=1 /opt/overview-labs/searxng/venv/bin/python scripts/searxng/test_news_rss.py
bash scripts/searxng/install.sh
curl --fail --silent --show-error http://127.0.0.1:8888/healthz
curl --fail --silent --show-error \
  --data-urlencode 'q=Hamilton Ohio crime' \
  --data 'format=json&categories=news&time_range=week&timeout_limit=2.5' \
  http://127.0.0.1:8888/search
```

Before this candidate, `Hamilton Ohio crime` returned one August 6 story from
DuckDuckGo News and no usable Google publication timestamps. The September 20–27
window correctly produced zero results. An isolated SearXNG application using
the candidate recipe (without changing the running service) returned 8 results
with source-provided September 21–24 dates in 0.37 seconds, with no engine errors.
`Hamilton Ohio latest news` returned 69 dated results in 0.64 seconds. Both used
only the News category. Search results remain ranked suggestions: nearby places
and namesakes can appear, so publication freshness alone does not establish
geographic relevance or completeness.

The exact `Hamilton Ohio latest news` query in News improved from 0.37 seconds
with a suspended Brave engine to 0.35 seconds with no upstream errors and 20
local stories. Its General baseline took 0.65 seconds and mostly returned
publisher landing pages. Image/video baseline requests took 0.53–0.69 seconds
but incorrectly returned General results, so their old timing is not a valid
media-search comparison. The previous 4-second default and 6-second maximum
timeouts are now both capped at 2.5 seconds. These are small smoke checks, not
a long-term latency or availability guarantee.

The service was verified enabled and running, bound only to loopback, and owned
by the nonroot service user. Reinstallation and health checks passed. The privacy
regression verifies that a fake credential in an exception and a private query
in logger arguments are absent from output.

## Official references

- [Step-by-step installation](https://docs.searxng.org/admin/installation-searxng.html)
- [Granian installation and configuration](https://docs.searxng.org/admin/installation-granian.html)
- [Settings and engine selection](https://docs.searxng.org/admin/settings/settings.html)
- [Search API](https://docs.searxng.org/dev/search_api.html)
- [Limiter and private instances](https://docs.searxng.org/admin/searx.limiter.html)
- [Pinned upstream source](https://github.com/searxng/searxng/tree/12f8b6515ca77c3c3bc1498584950ef5daca1433)
