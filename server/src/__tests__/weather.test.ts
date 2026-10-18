import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWeatherService, systemWeather, weatherParameters, weatherView } from "../services/weather.js";
import { executeWeather, localSystemWeatherRoutes, weatherRoutes } from "../routes/weather.js";
import { callVoiceApi } from "../services/voice-direct-api.js";
import { WEATHER_TOOL_DEFINITIONS } from "../services/weather-tools.js";
const mocks=vi.hoisted(()=>({decide:vi.fn()}));
vi.mock("../services/access.js",()=>({accessService:()=>({decide:mocks.decide})}));
const companyId="01234567-0000-4000-8000-000000000001",agentId="01234567-0000-4000-8000-000000000002",issueId="01234567-0000-4000-8000-000000000003";
const actor={type:"board",source:"session",userId:"speaker",companyIds:[companyId]};
const db={} as any;
const parameters={latitude:39.3995,longitude:-84.5613,current:["temperature_2m","weather_code"],daily:["temperature_2m_max","weather_code"],forecast_days:2};
const fixture={latitude:39.4,longitude:-84.5,timezone:"America/New_York",utc_offset_seconds:-14400,current:{time:"2026-10-11T12:00",temperature_2m:19,weather_code:2},current_units:{temperature_2m:"°C",weather_code:"wmo code"},daily:{time:["2026-10-11","2026-10-12"],temperature_2m_max:[23,null],weather_code:[2,null]},daily_units:{temperature_2m_max:"°C"}};
const json=(data:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json",...headers}});
beforeEach(()=>{vi.stubEnv("OPEN_METEO_USAGE","non-commercial");vi.stubEnv("OPEN_METEO_API_KEY","");mocks.decide.mockResolvedValue({allowed:true});});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});

describe("on-demand system weather",()=>{
  it("coalesces concurrent fetches, serves cache hits and expires without timers",async()=>{
    let now=Date.parse("2026-10-11T16:00:00Z");let resolve!:()=>void;
    const gate=new Promise<void>(r=>resolve=r);
    const fetcher=vi.fn(async()=>{await gate;return json(fixture);});
    const service=createWeatherService(fetcher as any,()=>now);
    const a=service.query("forecast",parameters),b=service.query("forecast",{...parameters});resolve();
    const [first,second]=await Promise.all([a,b]);
    expect(fetcher).toHaveBeenCalledTimes(1);expect(second.cache.coalesced).toBe(true);
    expect(first.view.current.condition).toBe("Partly cloudy");expect(first.view.days[1].temperature_2m_max).toBeNull();expect(first.view.days[1].condition).toBeNull();
    now+=30000;const cached=await service.query("forecast",parameters);
    expect(cached.cache).toMatchObject({hit:true,ageSeconds:30});expect(cached.fetchedAt).toBe(first.fetchedAt);expect(fetcher).toHaveBeenCalledTimes(1);
    now+=600000;expect((await service.query("forecast",parameters)).cache.hit).toBe(false);expect(fetcher).toHaveBeenCalledTimes(2);expect(service.stats()).toMatchObject({entries:1,active:0,pending:0});
  });
  it.each([
    ["constructor",parameters],["__proto__",parameters],["forecast",{...parameters,url:"http://127.0.0.1"}],
    ["forecast",{...parameters,apikey:"secret"}],["forecast",{...parameters,latitude:91}],
    ["forecast",{...parameters,longitude:181}],["forecast",{...parameters,latitude:[1,2],longitude:[3]}],
    ["forecast",{...parameters,hourly:["bad,url"]}],["forecast",{...parameters,timezone:"Bogus/Timezone"}],
    ["forecast",{...parameters,forecast_days:17}],["historical",{...parameters,start_date:"2026-02-30",end_date:"2026-03-01"}],
    ["historical",{latitude:1,longitude:1,daily:["temperature_2m_max"],start_date:"2000-01-01",end_date:"2026-01-01"}],
    ["forecast",{...parameters,hourly:Array.from({length:41},(_,i)=>"variable_"+i)}],
  ])("rejects unsafe or oversized %s query before fetching",async(name,p)=>{
    const fetcher=vi.fn();await expect(createWeatherService(fetcher).query(name,p as any)).rejects.toMatchObject({status:400});expect(fetcher).not.toHaveBeenCalled();
  });
  it("preserves pressure-level/soil/model identifiers, batch coordinates, units and timezone",()=>{
    const url=weatherParameters("forecast",{latitude:[39,40],longitude:[-84,-85],hourly:["temperature_850hPa","soil_moisture_0_to_1cm"],models:["gfs_seamless"],temperature_unit:"fahrenheit",timeformat:"unixtime",timezone:"America/New_York",forecast_hours:24});
    expect(url.hostname).toBe("api.open-meteo.com");expect(url.searchParams.get("latitude")).toBe("39,40");expect(url.searchParams.get("hourly")).toContain("850hPa");expect(url.searchParams.get("timeformat")).toBe("unixtime");
  });
  it("uses operator-only customer keys and never returns them in source URLs or errors",async()=>{
    vi.stubEnv("OPEN_METEO_API_KEY","private-weather-key");
    const fetcher=vi.fn(async()=>json(fixture));const service=createWeatherService(fetcher as any);
    const result=await service.query("forecast",parameters);
    const actual=(fetcher as any).mock.calls[0][0] as URL;
    expect(actual.hostname).toBe("customer-api.open-meteo.com");expect(actual.searchParams.get("apikey")).toBe("private-weather-key");expect(JSON.stringify(result)).not.toContain("private-weather-key");expect(result.sourceUrl).not.toContain("apikey");
    await expect(createWeatherService(async()=>json({error:true,reason:"bad private-weather-key"},400)).query("forecast",parameters)).rejects.toMatchObject({message:"Open-Meteo: bad [redacted]"});
  });
  it("does not cache failed responses and propagates a readable provider error",async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(json({error:true,reason:"Unavailable variable"},400)).mockResolvedValueOnce(json(fixture));
    const service=createWeatherService(fetcher);await expect(service.query("forecast",parameters)).rejects.toMatchObject({status:400});expect((await service.query("forecast",parameters)).data).toEqual(fixture);expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("backs off on 429 while retaining cached results",async()=>{
    let now=Date.now();const fetcher=vi.fn().mockResolvedValueOnce(json(fixture)).mockResolvedValueOnce(json({},429,{"retry-after":"120"})).mockResolvedValue(json(fixture));
    const service=createWeatherService(fetcher,()=>now);await service.query("forecast",parameters);
    await expect(service.query("forecast",{...parameters,latitude:10})).rejects.toMatchObject({status:429});
    expect((await service.query("forecast",parameters)).cache.hit).toBe(true);
    await expect(service.query("forecast",{...parameters,latitude:11})).rejects.toMatchObject({status:429});expect(fetcher).toHaveBeenCalledTimes(2);
    now+=121000;await service.query("forecast",{...parameters,latitude:11});expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("bounds response bodies and leaves no active requests on overflow",async()=>{
    const service=createWeatherService(async()=>new Response('x'.repeat(2_000_001)));
    await expect(service.query("forecast",parameters)).rejects.toMatchObject({status:400});expect(service.stats()).toMatchObject({entries:0,active:0,pending:0});
  });
  it("discovers all 16 APIs and precise variable fields without a network call",async()=>{
    const fetcher=vi.fn();const service=createWeatherService(fetcher);
    expect((await service.call("weather_capabilities",{})).endpoints).toHaveLength(16);
    const daily=await service.call("weather_capabilities",{endpoint:"forecast",parameter:"daily"});
    expect(daily.parameters.daily.items.enum).toEqual(expect.arrayContaining(["sunrise","temperature_2m_max","moon_phase"]));expect(Object.keys(daily.parameters)).toEqual(["daily"]);expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not pick an ambiguous city or fetch weather for it",async()=>{
    const fetcher=vi.fn(async()=>json({results:[{id:1,name:"Paris"},{id:2,name:"Paris"}]}));
    const service=createWeatherService(fetcher as any);const result=await service.call("weather_city",{city:"Paris"});
    expect(result.status).toBe("needs_selection");expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("returns card-ready US units, real location metadata and the optional hourly window",async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(json({results:[{id:1,name:"Hamilton",admin1:"Ohio",country:"United States",latitude:39.4,longitude:-84.5,timezone:"America/New_York"}]})).mockResolvedValueOnce(json({...fixture,hourly:{time:["2026-10-11T12:00"],temperature_2m:[19],weather_code:[61],is_day:[1],precipitation_probability:[70]}}));
    const result=await createWeatherService(fetcher).call("weather_city",{city:"Hamilton, Ohio",units:"us",includeHourly:true});
    expect(result.status).toBe("ready");expect(result.location.label).toBe("Hamilton, Ohio, United States");
    const url=fetcher.mock.calls[1]![0] as URL;expect(url.searchParams.get("temperature_unit")).toBe("fahrenheit");expect(url.searchParams.get("forecast_hours")).toBe("24");expect(url.searchParams.get("forecast_days")).toBe("7");expect(result.view.current.condition).toBe("Partly cloudy");
    expect(url.searchParams.get("daily")).toContain("moon_phase");expect(url.searchParams.get("hourly")).toContain("is_day");
    expect(result.presentation.weather.hourlyForecast).toEqual([expect.objectContaining({day:"2026-10-11T12:00",datetime:"2026-10-11T12:00",temperature:19,weatherCode:61,isDay:true,precipitationProbability:70})]);
    expect(result.presentation).toMatchObject({component:"WeatherCard",weather:{city:"Hamilton, Ohio, United States",temperature:19,unit:"°C",weatherCode:2,forecast:[{day:"2026-10-11",weatherCode:2},{day:"2026-10-12",weatherCode:null}]}});
  });
  it("does not turn missing or unknown conditions into fair weather",()=>{
    expect(weatherView({current:{weather_code:null}}).current.condition).toBeNull();expect(weatherView({current:{weather_code:999}}).current.condition).toBeNull();
  });
  it("resolves real-sized GeoNames ids without rejecting them as oversized numeric values",async()=>{
    const fetcher=vi.fn(async()=>json({id:2950159,name:"Berlin",latitude:52.52,longitude:13.41}));
    const result=await createWeatherService(fetcher as any).call('weather_geocode',{id:2950159});expect(result.data.id).toBe(2950159);
  });
});

function app(local=false){
 const app=express();app.use(express.json());
 if(local)app.use(localSystemWeatherRoutes());
 else{app.use((req,_res,next)=>{req.actor=req.get("x-agent")?{type:"agent",agentId,companyId:req.get("x-agent")!}:actor as any;next();});app.use(weatherRoutes(db));}
 app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.status??(error.name==="ZodError"?400:500)).json({error:error.message}));return app;
}
describe("weather access and shared bridge",()=>{
 it("enforces company boundaries and deny policies before even catalog reads",async()=>{
  const call=vi.spyOn(systemWeather,"call").mockResolvedValue({provider:"open-meteo"});
  expect((await request(app()).post(`/companies/${companyId}/weather/capabilities`).send({})).status).toBe(200);
  call.mockClear();expect((await request(app()).post(`/companies/${companyId}/weather/city`).set("x-agent","other-company").send({city:"Paris"})).status).toBe(403);
  mocks.decide.mockResolvedValue({allowed:false,explanation:"Denied"});expect((await request(app()).post(`/companies/${companyId}/weather/capabilities`).send({})).status).toBe(403);expect(call).not.toHaveBeenCalled();
 });
 it("intersects voice speaker and agent access and prevents speaker substitution",async()=>{
  const call=vi.spyOn(systemWeather,"call").mockResolvedValue({provider:"open-meteo"});
  expect(await callVoiceApi(db,{actor} as any,{companyId,agentId,issueId,userId:"speaker"},{action:"weather_city",data:JSON.stringify({city:"Hamilton, Ohio"})})).toMatchObject({provider:"open-meteo"});
  expect(mocks.decide.mock.calls.slice(-2).map(([a])=>a.action)).toEqual(["tools:use","company_scope:read"]);
  call.mockClear();await expect(callVoiceApi(db,{actor} as any,{companyId,agentId,issueId,userId:"different"},{action:"weather_city",data:'{"city":"Paris"}'})).rejects.toMatchObject({status:403});expect(call).not.toHaveBeenCalled();
  mocks.decide.mockImplementation(async({actor})=>({allowed:actor.type!=="agent",explanation:"Agent denied"}));
  await expect(executeWeather(db,{actor} as any,companyId,"weather_city",{city:"Paris"},agentId)).rejects.toMatchObject({status:403});expect(call).not.toHaveBeenCalled();
 });
 it.each(["Origin","Cookie","Forwarded","X-Forwarded-For","X-Forwarded-Host","Sec-Fetch-Site"])("rejects %s on the loopback bridge (including reverse proxies)",async header=>{
  const call=vi.spyOn(systemWeather,"call");expect((await request(app(true)).post('/internal/system-weather').set(header,'untrusted').send({tool:"weather_capabilities",arguments:{}})).status).toBe(403);expect(call).not.toHaveBeenCalled();
 });
 it("serves only public weather tool calls locally, with no private input or URL overrides",async()=>{
  const call=vi.spyOn(systemWeather,"call").mockResolvedValue({provider:"open-meteo"});
  expect((await request(app(true)).post('/internal/system-weather').send({tool:"weather_capabilities",arguments:{}})).status).toBe(200);
  call.mockClear();for(const body of [{tool:"read_file",arguments:{}},{tool:"weather_query",arguments:{},companyId:"other"}])expect((await request(app(true)).post('/internal/system-weather').send(body)).status).toBe(400);expect(call).not.toHaveBeenCalled();
 });
 it("keeps URLs, credentials, identities and writes out of agent-facing schemas",()=>{
  expect(WEATHER_TOOL_DEFINITIONS.map(t=>t.name)).toEqual(["weather_capabilities","weather_geocode","weather_city","weather_query"]);
  for(const tool of WEATHER_TOOL_DEFINITIONS)expect(tool.inputSchema.additionalProperties).toBe(false);
  expect(JSON.stringify(WEATHER_TOOL_DEFINITIONS.map(t=>t.inputSchema))).not.toMatch(/apikey|companyId|agentId|runId|token|endpointUrl/);
 });
 it("exposes stateless local MCP without another weather process and preserves tool errors",async()=>{
  const client=request(app(true));
  const init=await client.post('/internal/weather/mcp').set('Sec-Fetch-Mode','cors').send({jsonrpc:'2.0',id:1,method:'initialize',params:{}});
  expect(init.body.result.serverInfo.name).toBe('overview-weather');
  expect((await client.post('/internal/weather/mcp').send({jsonrpc:'2.0',id:2,method:'tools/list'})).body.result.tools).toHaveLength(4);
  const call=vi.spyOn(systemWeather,'call').mockResolvedValue({provider:'open-meteo'});
  const result=await client.post('/internal/weather/mcp').send({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'weather_city',arguments:{city:'Berlin, Germany'},_meta:{progressToken:1}}});
  expect(result.body.result.structuredContent.provider).toBe('open-meteo');expect(call).toHaveBeenCalledWith('weather_city',{city:'Berlin, Germany'});
  call.mockRejectedValue(new Error('Provider unavailable'));const failed=await client.post('/internal/weather/mcp').send({jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'weather_city',arguments:{city:'Berlin'}}});
  expect(failed.body.result).toMatchObject({isError:true});expect(failed.body.result.content[0].text).toBe('Provider unavailable');
  expect((await client.post('/internal/weather/mcp').set('X-Forwarded-For','127.0.0.1').send({jsonrpc:'2.0',id:5,method:'tools/list'})).status).toBe(403);
 });
});
