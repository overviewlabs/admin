# System weather and city data

Overview Labs uses Open-Meteo for on-demand public weather snapshots. The operator
selected non-commercial use on 2026-10-11 (`OPEN_METEO_USAGE=non-commercial`).
No weather model datasets are installed on the VPS. No scheduled weather workers,
polling, database tables or credential-bearing browser requests are added.

Admin's native Codex sessions use `overview_weather` local HTTP MCP; other Admin model
runtimes use the built-in `weather_*` functions. Company native runner sessions
and their run-bound MCP expose the same four tools. Voice uses `organization_api`
with action `weather_city`, `weather_geocode`, `weather_query` or
`weather_capabilities`, and JSON arguments in `data`.

- `weather_city`: qualified city, units `metric`/`us`, 1–16 forecast days,
  optional next 24 hourly steps. Ambiguous cities return selection candidates.
- `weather_geocode`: city/postcode search, localized country/admin fields,
  coordinates, timezone, elevation, population/postcodes when available; stable
  GeoNames-id lookup. No street-address reverse geocoding.
- `weather_capabilities`: all endpoint summaries, or an endpoint's complete
  parameter catalog; `parameter` narrows discovery to e.g. `hourly` or `models`.
- `weather_query`: native Open-Meteo parameters against the fixed API registry.
  Forecast, historical reanalysis/forecasts, single/previous runs, air quality,
  marine, ensemble/mean, seasonal, climate, flood, satellite radiation, elevation
  and geocoding/location queries are available. Availability depends on provider
  models, date ranges and regional coverage. Numeric identifiers newer than the
  pinned catalog are validated by the provider. Unsupported parameters fail.

Authenticated company routes are POST
`/api/companies/{companyId}/weather/{city|geocode|query|capabilities}`. Existing
company boundaries and tool policies apply. Runtime MCP also validates the live
bound run before every call. Voice intersects speaker and agent access.

`POST /internal/system-weather` and `/internal/weather/mcp` are explicit public-data-only local adapter
bridge, mounted before session authentication. Direct loopback connections only;
Origin, cookie, proxy-forwarding and browser site/destination headers are rejected, including
requests coming through a loopback reverse proxy. It accepts only the four named
tools, never remote URLs, credentials, tenant selectors or private records.
This lets Admin and company agents share one bounded weather cache without a
privileged service credential or separate always-running process. Native MCP
clients call the same Node process directly: no per-chat weather subprocess.

The lazy API-process cache has a 20 MB raw JSON budget and 256-entry limit.
Forecast/previous-run snapshots expire after 10 minutes; specialized changing
data after 1 hour; historical/single-run/climate after 24 hours; city/elevation
metadata after 7 days. Expired entries are removed on the next request; LRU
eviction removes entries earlier when the budget fills. Restart clears memory.
Normalized card views are created only for the current response, not cached.
Concurrent identical requests share one fetch. At most four upstream requests
run concurrently; each has a 20-second timeout and 2 MB response limit.
Conservative weighted budgets are 40/minute, 600/hour and 8,000/day. Provider
429 responses trigger lazy backoff; no autonomous retries or refresh timers.
Large queries must be split (10 locations, 3 models, 40 variables/group,
50,000 estimated cells, maximum 366-day chunk).

Results preserve raw provider fields plus `view.current`, `view.days`, `view.hourly`,
units, timezone, fixed UTC offset, condition descriptions, retrieved/expiry times,
cache age and source attribution. Show weather valid time separately from
retrieval time. Use epoch timestamps with IANA conversion across DST transitions;
the provider's ISO strings use a fixed offset. Missing values remain null.
Current weather is modeled, history may be reanalysis, and seasonal/climate/flood
outputs are projections; these are not station observations or official alerts.
Alerts and radar imagery need a separate provider.

Agents compose mobile-friendly OpenUI cards/charts from these snapshots and credit
Open-Meteo, GeoNames for city data, and CAMS for air quality. They never embed
network calls or polling in generated components.

Catalog sources: [official OpenAPI schemas](https://github.com/open-meteo/open-meteo/tree/main/openapi)
and [official website options](https://github.com/open-meteo/open-meteo-website/tree/main/src/routes/en/docs).
Refresh explicitly with `python3 scripts/generate-open-meteo-catalog.py` (PyYAML),
then run `CPTR_SOURCE_ROOT=... node scripts/sync-weather-tools.mjs` to synchronize
Admin schemas and guidance. This is never performed on a request or startup.
Commercial deployment requires an Open-Meteo subscription and server-only
`OPEN_METEO_API_KEY`; customer endpoints are selected automatically and the key
is excluded from returned source URLs. See [provider terms/pricing](https://open-meteo.com/en/pricing).
