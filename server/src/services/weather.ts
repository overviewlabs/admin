import { z } from "zod";
import { badRequest, HttpError, tooManyRequests } from "../errors.js";
import { OPEN_METEO_CATALOG, OPEN_METEO_CATALOG_REVISION, type WeatherEndpoint, type WeatherParameter } from "./weather-catalog.generated.js";

const variables = new Set(["current", "hourly", "daily", "minutely_15", "weekly", "monthly"]);
const MAX_BYTES = 2_000_000;
const MAX_CACHE_BYTES = 20_000_000;
const MAX_CELLS = 50_000;
const MAX_LOCATIONS = 10;
type Data = Record<string, any>;
type Entry = { data: Data | Data[]; fetchedAt: string; expiresAt: number; bytes: number };
const conditions: Record<number, string> = {
  0:"Clear sky",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",45:"Fog",48:"Depositing rime fog",
  51:"Light drizzle",53:"Moderate drizzle",55:"Dense drizzle",56:"Light freezing drizzle",57:"Dense freezing drizzle",
  61:"Slight rain",63:"Moderate rain",65:"Heavy rain",66:"Light freezing rain",67:"Heavy freezing rain",
  71:"Slight snowfall",73:"Moderate snowfall",75:"Heavy snowfall",77:"Snow grains",80:"Slight rain showers",
  81:"Moderate rain showers",82:"Violent rain showers",85:"Slight snow showers",86:"Heavy snow showers",
  95:"Thunderstorm",96:"Thunderstorm with slight hail",97:"Heavy thunderstorm",99:"Thunderstorm with heavy hail",
};
const limits = { maxLocations: MAX_LOCATIONS, maxVariablesPerGroup: 40, maxModels: 3, maxEstimatedCells: MAX_CELLS, maxResponseBytes: MAX_BYTES, maxCacheBytes: MAX_CACHE_BYTES, maxConcurrentRequests: 4 };

function list(value: unknown): unknown[] { return Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [value]; }
function endpoint(name: string): WeatherEndpoint { if (!Object.hasOwn(OPEN_METEO_CATALOG,name)) throw badRequest("Unknown weather endpoint; use weather_capabilities."); return OPEN_METEO_CATALOG[name]!; }
function date(value: unknown, key: string, withTime = false) {
  if (typeof value !== "string" || !(withTime ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?Z?$/ : /^\d{4}-\d{2}-\d{2}$/).test(value)) throw badRequest(`${key} requires an ISO ${withTime ? "date/time" : "date"}.`);
  const parsed = new Date(withTime ? value.endsWith("Z") ? value : value + "Z" : value + "T00:00:00Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== value.slice(0,10)) throw badRequest(`Invalid ${key}.`);
  return parsed.getTime();
}
function validateValue(key: string, value: unknown, schema: WeatherParameter) {
  if (schema.type === "array") {
    const items = list(value);
    if (!items.length || items.length > (key === "models" ? 3 : 40) || items.some(v => typeof v !== "string" || !/^[a-zA-Z0-9_]+$/.test(v) || v.length > 100)) throw badRequest(`${key} requires a small list of variable/model identifiers.`);
    // New provider variables remain usable between catalog updates. All values
    // are identifiers, never URLs/commands; the provider validates coverage.
    return [...new Set(items)].join(",");
  }
  if (schema.allowNan && value === "nan") return "nan";
  if (schema.type === "integer" || schema.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value) || (schema.type === "integer" && !Number.isInteger(value)) || value < (schema.minimum ?? -100000) || value > (schema.maximum ?? 100000)) throw badRequest(`Invalid ${key}; check weather_capabilities for bounds.`);
    return String(value);
  }
  if (schema.type === "boolean") { if (typeof value !== "boolean") throw badRequest(`${key} requires a boolean.`); return String(value); }
  if (typeof value !== "string" || value.length < (schema.minLength ?? 1) || value.length > (schema.maxLength ?? 200) || /[\u0000-\u001f]/.test(value)) throw badRequest(`Invalid ${key}.`);
  if (schema.enum && !schema.enum.includes(value)) throw badRequest(`Invalid ${key}; use ${schema.enum.join(", ")}.`);
  if (schema.format === "date") date(value,key);
  if (schema.format === "date-time") date(value,key,true);
  if (key === "timezone" && value !== "auto") { try { new Intl.DateTimeFormat("en", {timeZone:value}); } catch { throw badRequest("timezone requires auto or an IANA timezone."); } }
  if (key === "countryCode" && !/^[A-Z]{2}$/.test(value)) throw badRequest("countryCode requires an uppercase two-letter code.");
  if (key === "language" && !/^[a-z]{2,3}$/.test(value)) throw badRequest("language requires a lowercase language code.");
  return value;
}

export function weatherParameters(name: string, input: Record<string, unknown>) {
  const spec = endpoint(name), parameters: Record<string, unknown> = {...input};
  for (const key of Object.keys(parameters)) if (!Object.hasOwn(spec.parameters,key)) throw badRequest(`Unsupported ${name} parameter: ${key}. Use weather_capabilities.`);
  if (spec.parameters.timezone && !parameters.timezone) parameters.timezone = "auto";
  if (name==="ensemble_mean" && !parameters.models) parameters.models=["ecmwf_ifs025_ensemble_mean"];
  if (name==="satellite_radiation" && !parameters.models) parameters.models=["satellite_radiation_seamless"];
  for (const [key,schema] of Object.entries(spec.parameters)) if (schema.required && parameters[key] === undefined) throw badRequest(`${name} requires ${key}.`);
  const url = new URL(spec.url);
  let locations = 1;
  for (const [key,value] of Object.entries(parameters)) {
    if (key === "latitude" || key === "longitude") {
      const values = list(value).map(v => typeof v === "number" ? v : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN);
      const bound = key === "latitude" ? 90 : 180;
      if (!values.length || values.length > MAX_LOCATIONS || values.some(v => !Number.isFinite(v) || Math.abs(v)>bound)) throw badRequest(`${key} requires 1–${MAX_LOCATIONS} valid WGS84 coordinates.`);
      if (key === "latitude") locations = values.length;
      url.searchParams.set(key,values.join(","));
    } else url.searchParams.set(key,validateValue(key,value,spec.parameters[key]!));
  }
  if (parameters.latitude !== undefined && list(parameters.longitude).length !== locations) throw badRequest("latitude and longitude counts must match.");
  for (const [start,end] of [["start_date","end_date"],["start_hour","end_hour"],["start_minutely_15","end_minutely_15"]]) {
    if ((parameters[start] === undefined) !== (parameters[end] === undefined)) throw badRequest(`Supply both ${start} and ${end}.`);
    if (parameters[start] !== undefined && date(parameters[start], start,start!=="start_date") > date(parameters[end],end,end!=="end_date")) throw badRequest(`${start} must not follow ${end}.`);
  }
  const days = parameters.start_date ? (date(parameters.end_date,"end_date")-date(parameters.start_date,"start_date"))/86400000+1 : Number(parameters.forecast_days ?? (name==="seasonal"?183:name==="flood"?92:7)) + Number(parameters.past_days ?? 0);
  let cells = 0;
  for (const key of variables) if (parameters[key] !== undefined) {
    const steps = key === "current" ? 1 : key === "hourly" ? Number(parameters.forecast_hours ?? days*24)+Number(parameters.past_hours??0) : key === "minutely_15" ? Number(parameters.forecast_minutely_15 ?? days*96)+Number(parameters.past_minutely_15??0) : key === "weekly" ? Math.ceil(days/7) : key === "monthly" ? Math.ceil(days/30) : days;
    if (steps < 0 || steps > 8784*4) throw badRequest("Weather range is too large; split it into smaller queries.");
    cells += list(parameters[key]).length * steps;
  }
  if (!Number.isFinite(days) || days < 0 || days > 366 || cells*locations*list(parameters.models ?? "best_match").length > MAX_CELLS) throw badRequest("Weather query is too large; request fewer variables, locations, models or days.");
  // Fixed registry origin/path; credentials can only come from operator config.
  const key = process.env.OPEN_METEO_API_KEY?.trim();
  if (key) { url.hostname = "customer-" + url.hostname; url.searchParams.set("apikey",key); }
  else if (process.env.OPEN_METEO_USAGE !== "non-commercial") throw new HttpError(503,"Open-Meteo needs OPEN_METEO_USAGE=non-commercial or a commercial subscription API key.");
  url.searchParams.sort();
  return url;
}

export function weatherView(data: Data): Data {
  const current = data.current ? {...data.current, condition: conditions[data.current.weather_code] ?? null} : null;
  const series = (group: string) => (data[group]?.time ?? []).map((time: unknown,index: number) => Object.fromEntries(Object.entries(data[group]).map(([key,value]) => [key,key === "time" ? time : Array.isArray(value) ? value[index] ?? null : null])));
  return { timezone: data.timezone ?? null, utcOffsetSeconds: data.utc_offset_seconds ?? null, elevation: data.elevation ?? null,
    current, days: series("daily").map((row: Data) => ({...row,condition: conditions[row.weather_code] ?? null})),
    hourly: series("hourly"), units: {current:data.current_units??{},daily:data.daily_units??{},hourly:data.hourly_units??{}},
  };
}

/** One bounded lazy cache in the API process; no timers, jobs or idle polling. */
export function createWeatherService(fetcher: typeof fetch = fetch, now = () => Date.now()) {
  const cache = new Map<string, Entry>(), pending = new Map<string, Promise<Entry>>();
  let cacheBytes = 0, active = 0;
  const windows = [{duration:60000,max:40,at:0,count:0},{duration:3600000,max:600,at:0,count:0},{duration:86400000,max:8000,at:0,count:0}];
  let blockedUntil = 0;
  const ttl = (name: string) => name === "geocoding" || name === "location" || name === "elevation" ? 7*86400000 : ["historical","historical_forecast","single_run","climate"].includes(name) ? 86400000 : ["air_quality","marine","ensemble","ensemble_mean","seasonal","flood","satellite_radiation"].includes(name) ? 3600000 : 600000;
  function prune() { for (const [key,entry] of cache) if (entry.expiresAt<=now()) {cache.delete(key);cacheBytes-=entry.bytes;} }
  async function load(url: URL,name: string): Promise<Entry> {
    if (active >= 4 || now()<blockedUntil) throw tooManyRequests("Weather service is busy or backing off; retry later.");
    const variableCount=[...variables].reduce((sum,key)=>sum+(url.searchParams.get(key)?.split(",").length??0),0);
    const start=url.searchParams.get("start_date"),end=url.searchParams.get("end_date");
    const days=start&&end?(Date.parse(end)-Date.parse(start))/86400000+1:Number(url.searchParams.get("forecast_days")??(name==="seasonal"?183:name==="flood"?92:7));
    const cost=Math.max(1,Math.ceil(Math.max(1,variableCount/10)*Math.max(1,days/14)*(url.searchParams.get("latitude")?.split(",").length??1)*(url.searchParams.get("models")?.split(",").length??1)));
    for (const window of windows) { if (now()-window.at>=window.duration) {window.at=now();window.count=0;} if (window.count+cost>window.max) throw tooManyRequests("Weather request budget reached; reuse cached results or retry later."); }
    windows.forEach(window=>window.count+=cost); active++;
    try {
      const response = await fetcher(url,{redirect:"error",signal:AbortSignal.timeout(20000),headers:{Accept:"application/json"}});
      if (response.status===429) {const seconds=Number(response.headers.get("retry-after"));blockedUntil=now()+Math.min(3600000,Math.max(60000,Number.isFinite(seconds)?seconds*1000:60000));throw tooManyRequests("Open-Meteo rate limit reached; the system is backing off.");}
      const reader = response.body?.getReader();
      if (!reader) throw new HttpError(502,"Open-Meteo returned an empty response.");
      let bytes=0; const chunks: Uint8Array[]=[];
      try { while(true) {const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>MAX_BYTES)throw badRequest("Weather response exceeds 2 MB; narrow the query.");chunks.push(chunk.value);} } finally { await reader.cancel().catch(()=>{}); }
      let data: Data | Data[];
      try {data=JSON.parse(Buffer.concat(chunks).toString("utf8"));} catch {throw new HttpError(502,"Open-Meteo returned an invalid data response.");}
      if (!response.ok || (!Array.isArray(data) && data.error)) {
        const reason = !Array.isArray(data) && typeof data.reason === "string" ? data.reason.slice(0,500).replaceAll(process.env.OPEN_METEO_API_KEY || "\u0000","[redacted]") : "Provider request failed";
        throw new HttpError(response.status===400?400:502,`Open-Meteo: ${reason}`);
      }
      if (!data || typeof data!=="object") throw new HttpError(502,"Open-Meteo returned an invalid data object.");
      return {data,fetchedAt:new Date(now()).toISOString(),expiresAt:now()+ttl(name),bytes};
    } catch(error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(502,"Open-Meteo could not be reached within the request timeout. No weather values were fabricated.");
    } finally {active--;}
  }
  async function query(name: string, parameters: Record<string, unknown>) {
    const url=weatherParameters(name,parameters),key=url.toString();prune();
    let entry=cache.get(key),cached=Boolean(entry),coalesced=false;
    if (!entry) {
      let job=pending.get(key);coalesced=Boolean(job);
      if (!job) {job=load(url,name);pending.set(key,job);job.finally(()=>pending.delete(key)).catch(()=>{});}
      entry=await job;
      if (!cache.has(key)) { while(cache.size>=256 || cacheBytes+entry.bytes>MAX_CACHE_BYTES) {const oldest=cache.keys().next().value;if(!oldest)break;cacheBytes-=cache.get(oldest)!.bytes;cache.delete(oldest);}cache.set(key,entry);cacheBytes+=entry.bytes; }
    } else {cache.delete(key);cache.set(key,entry);}
    const publicUrl = new URL(url);publicUrl.searchParams.delete("apikey");
    const sources=[{title:"Open-Meteo",url:endpoint(name).docs},...(name==="geocoding"||name==="location"?[{title:"GeoNames",url:"https://www.geonames.org/"}]:name==="air_quality"?[{title:"CAMS",url:"https://atmosphere.copernicus.eu/"}]:[])];
    return {provider:"open-meteo",endpoint:name,usage:process.env.OPEN_METEO_API_KEY?"commercial":"non-commercial",sources,sourceUrl:publicUrl.toString(),attribution:sources.map(s=>s.title).join(" · "),
      fetchedAt:entry.fetchedAt,expiresAt:new Date(entry.expiresAt).toISOString(),cache:{hit:cached,coalesced,ageSeconds:Math.max(0,Math.floor((now()-Date.parse(entry.fetchedAt))/1000))},
      data:entry.data,view:Array.isArray(entry.data)?entry.data.map(weatherView):weatherView(entry.data),
      notes:["Weather values are modeled estimates; do not present them as station observations or official warnings.","Missing values and regional/model coverage restrictions are preserved. ISO local times use the provider's fixed UTC offset; use unixtime with IANA timezone conversion across DST transitions."]};
  }
  async function call(tool: string,input: unknown) {
    if (tool==="weather_capabilities") {
      const p=z.object({endpoint:z.string().optional(),parameter:z.string().max(100).optional()}).strict().parse(input??{});
      if (p.parameter&&!p.endpoint) throw badRequest("parameter requires an endpoint.");
      const spec=p.endpoint?endpoint(p.endpoint):null;
      if(p.parameter&&spec&&!Object.hasOwn(spec.parameters,p.parameter))throw badRequest("Unknown parameter for this endpoint.");
      return {provider:"open-meteo",usage:process.env.OPEN_METEO_API_KEY?"commercial":process.env.OPEN_METEO_USAGE??"not_configured",revision:OPEN_METEO_CATALOG_REVISION,limits,
        ...(spec?{endpoint:p.endpoint,docs:spec.docs,parameters:p.parameter?{[p.parameter]:spec.parameters[p.parameter]}:spec.parameters}:{endpoints:Object.entries(OPEN_METEO_CATALOG).map(([name,s])=>({name,docs:s.docs,parameters:Object.keys(s.parameters)}))}),
        notes:["Catalog lists known variables; additional identifier-only variables are forwarded and validated by the provider, allowing updates without redeploying.","Variables/models are not available in every region or time period. Weather alerts, radar imagery, reverse street addresses and live station observations are not supplied by this service.","Long histories/projections and large batches must be split to fit the request limits. City fields such as population/admin areas/postcodes are returned only where available."]};
    }
    if(tool==="weather_query") {const p=z.object({endpoint:z.string(),parameters:z.record(z.string(),z.unknown())}).strict().parse(input);return query(p.endpoint,p.parameters);}
    if(tool==="weather_geocode") {
      const p=z.object({name:z.string().min(2).max(200).optional(),id:z.number().int().positive().optional(),count:z.number().int().min(1).max(100).optional(),language:z.string().optional(),countryCode:z.string().optional()}).strict().parse(input);
      if ((p.id===undefined)===(p.name===undefined)) throw badRequest("Supply name or id, exclusively.");
      if(p.id!==undefined) {if(p.count||p.language||p.countryCode)throw badRequest("Location-id lookup takes only id.");return query("location",{id:p.id});}
      return query("geocoding",{name:p.name,count:p.count??5,language:p.language??"en",...(p.countryCode?{countryCode:p.countryCode}:{})});
    }
    if(tool==="weather_city") {
      const p=z.object({city:z.string().trim().min(2).max(200),countryCode:z.string().optional(),units:z.enum(["metric","us"]).default("metric"),forecastDays:z.number().int().min(1).max(16).default(7),includeHourly:z.boolean().default(false)}).strict().parse(input);
      const cities=await query("geocoding",{name:p.city,count:5,...(p.countryCode?{countryCode:p.countryCode}:{})});
      const allCandidates=(cities.data as Data).results??[];
      const normalize=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLocaleLowerCase();
      const exact=allCandidates.filter((candidate:Data)=>normalize(candidate.name)===normalize(p.city.split(",")[0]!));
      const candidates=exact.length?exact:allCandidates;
      if(candidates.length!==1)return {status:candidates.length?"needs_selection":"not_found",candidates,sources:cities.sources,requestedCity:p.city,guidance:"Resolve the correct city using qualifiers or a GeoNames id; call weather_query with the selected coordinates. Do not silently select the first match."};
      const location=candidates[0];
      const data=await query("forecast",{latitude:location.latitude,longitude:location.longitude,timezone:location.timezone??"auto",forecast_days:p.forecastDays,
        temperature_unit:p.units==="us"?"fahrenheit":"celsius",wind_speed_unit:p.units==="us"?"mph":"kmh",precipitation_unit:p.units==="us"?"inch":"mm",
        current:["temperature_2m","relative_humidity_2m","apparent_temperature","is_day","precipitation","weather_code","cloud_cover","wind_speed_10m","wind_direction_10m","wind_gusts_10m"],
        daily:["weather_code","temperature_2m_max","temperature_2m_min","sunrise","sunset","moon_phase","moonrise","moonset","uv_index_max","precipitation_probability_max","precipitation_sum","wind_speed_10m_max"],
        ...(p.includeHourly?{hourly:["temperature_2m","weather_code","is_day","cloud_cover","precipitation_probability","precipitation","wind_speed_10m"],forecast_hours:24}:{}),
      });
      const label=[location.name,location.admin1,location.country].filter(Boolean).join(", ");
      const view=data.view as Data,current=view.current??{},units=view.units.current??{};
      const today=view.days.find((day:Data)=>day.time===String(current.time??"").slice(0,10));
      const presentation={component:"WeatherCard",weather:{city:label,temperature:current.temperature_2m??null,unit:units.temperature_2m??view.units.daily.temperature_2m_max??"",
        condition:current.condition??undefined,weatherCode:current.weather_code??null,isDay:current.is_day==null?undefined:current.is_day===1,cloudCover:current.cloud_cover??null,
        feelsLike:current.apparent_temperature??null,humidity:current.relative_humidity_2m??null,wind:current.wind_speed_10m??null,windUnit:units.wind_speed_10m,windBearing:current.wind_direction_10m??null,windGust:current.wind_gusts_10m??null,
        observedAt:current.time,retrievedAt:data.fetchedAt,timezone:view.timezone,sourceUrl:data.sourceUrl,
        moonPhase:today?.moon_phase??undefined,sunrise:today?.sunrise??undefined,sunset:today?.sunset??undefined,moonrise:today?.moonrise??undefined,moonset:today?.moonset??undefined,
        forecast:view.days.map((day:Data)=>({day:day.time,high:day.temperature_2m_max??null,low:day.temperature_2m_min??null,weatherCode:day.weather_code??null,condition:day.condition??undefined,precipitationProbability:day.precipitation_probability_max??null,wind:day.wind_speed_10m_max??null,precipitation:day.precipitation_sum??null})),
        ...(p.includeHourly?{hourlyForecast:(view.hourly??[]).slice(0,24).map((hour:Data)=>({day:hour.time,datetime:hour.time,temperature:hour.temperature_2m??null,weatherCode:hour.weather_code??null,isDay:hour.is_day==null?undefined:hour.is_day===1,condition:hour.condition??undefined,precipitationProbability:hour.precipitation_probability??null,precipitation:hour.precipitation??null,wind:hour.wind_speed_10m??null}))}:{}),
      }};
      return {status:"ready",presentation,location:{...location,label},...data,sources:[...data.sources,{title:"GeoNames",url:"https://www.geonames.org/"}]};
    }
    throw badRequest("Unknown weather tool.");
  }
  return {query,call,stats:()=>({entries:cache.size,bytes:cacheBytes,active,pending:pending.size})};
}
export const systemWeather = createWeatherService();
