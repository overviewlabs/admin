import {z} from "zod/v4";
type Condition=typeof weatherConditions[number];
type Intensity="light"|"medium"|"heavy";
type MoonPhase=typeof moonPhases[number];
interface WeatherConfig {condition:Condition;intensity?:Intensity;time?:"day"|"night";fidelity?:"subtle"|"rich";moonPhase?:MoonPhase;celestialEvent?:"none"|"sunrise"|"sunset"|"moonrise"|"moonset";celestialProgress?:number;}

export const weatherConditions=["clear","cloudy","overcast","rain","drizzle","showers","freezing-rain","sleet","snow","flurries","blizzard","storm","fog","mist","haze","smog","smoke","dust","wind","hail"] as const;
export const moonPhases=["new","waxing-crescent","first-quarter","waxing-gibbous","full","waning-gibbous","last-quarter","waning-crescent"] as const;
export const animationFields={
  animationCondition:z.enum(weatherConditions).optional(),intensity:z.enum(["light","medium","heavy"]).optional(),
  fidelity:z.enum(["subtle","rich"]).optional(),cloudCover:z.number().min(0).max(100).nullish(),
  moonPhase:z.union([z.enum(moonPhases),z.number().min(0).max(1)]).nullish(),
  sunrise:z.string().optional(),sunset:z.string().optional(),moonrise:z.string().optional(),moonset:z.string().optional(),
};
export interface WeatherAnimationData {
  weatherCode?:number|null;condition?:string;animationCondition?:Condition;intensity?:Intensity;
  fidelity?:"subtle"|"rich";isDay?:boolean;cloudCover?:number|null;moonPhase?:MoonPhase|number|null;
  observedAt?:string;sunrise?:string;sunset?:string;moonrise?:string;moonset?:string;
}
// Open-Meteo WMO severity, never classify unknown codes as sunny or derive
// blizzards/hail/smog from temperature, wind, or AQI alone.
const wmo:Record<number,[Condition,Intensity]>={
  0:["clear","light"],1:["cloudy","light"],2:["cloudy","light"],3:["overcast","heavy"],
  45:["fog","medium"],48:["fog","heavy"],51:["drizzle","light"],53:["drizzle","medium"],55:["drizzle","heavy"],
  56:["freezing-rain","light"],57:["freezing-rain","heavy"],61:["rain","light"],63:["rain","medium"],65:["rain","heavy"],
  66:["freezing-rain","light"],67:["freezing-rain","heavy"],71:["snow","light"],73:["snow","medium"],75:["snow","heavy"],
  77:["flurries","light"],80:["showers","light"],81:["showers","medium"],82:["showers","heavy"],
  85:["flurries","light"],86:["snow","heavy"],95:["storm","medium"],96:["hail","light"],97:["storm","heavy"],99:["hail","heavy"],
};
export function resolveWeatherAnimation(data:WeatherAnimationData):WeatherConfig|null{
  let condition:Condition|undefined,intensity:Intensity|undefined;
  const coded=data.weatherCode==null?undefined:wmo[data.weatherCode];
  if(coded){[condition,intensity]=coded;
    if((data.weatherCode===1||data.weatherCode===2)&&data.cloudCover!=null)intensity=data.cloudCover<35?"light":data.cloudCover<85?"medium":"heavy";
  }else if(data.weatherCode!=null){return null;}else{
    const named=(data.animationCondition||data.condition||"").trim().toLowerCase().replace(/\s+/g,"-");
    if(weatherConditions.includes(named as Condition))condition=named as Condition;
    else if(named==="clear-sky"||named==="sunny")condition="clear";
    else if(/thunderstorm/.test(named))condition="storm";
    else if(/freezing-(rain|drizzle)/.test(named))condition="freezing-rain";
    else if(/snow-showers|snow-grains/.test(named))condition="flurries";
    else if(/partly-cloudy|mainly-clear|mostly-cloudy/.test(named))condition="cloudy";
    else if(/^(light|moderate|heavy|dense|slight)-(rain|drizzle|snowfall)$/.test(named))condition=named.endsWith("snowfall")?"snow":named.endsWith("drizzle")?"drizzle":"rain";
    if(!condition)return null;
    intensity=data.intensity||(/heavy|dense/.test(named)?"heavy":/light|slight|partly|mainly/.test(named)?"light":"medium");
  }
  const moonPhase=typeof data.moonPhase==="number"?moonPhases[Math.round(data.moonPhase*8)%8]:data.moonPhase??"new";
  const config:WeatherConfig={condition,intensity,time:data.isDay===false?"night":"day",fidelity:data.fidelity||"rich",moonPhase,celestialEvent:"none"};
  // Compare provider-local timestamps ONLY to timestamps in the same format.
  // Never use the viewer's timezone or wall clock to change a saved snapshot.
  const valid=data.observedAt;
  if(valid&&data.isDay!=null){
    const hasOffset=(s:string)=>/(?:Z|[+-]\d{2}:\d{2})$/.test(s);
    for(const event of ["sunrise","sunset","moonrise","moonset"] as const){
      const at=data[event];if(!at||hasOffset(at)!==hasOffset(valid))continue;
      const parse=(s:string)=>Date.parse(hasOffset(s)?s:`${s}Z`);
      const delta=parse(valid)-parse(at);
      if(Number.isFinite(delta)&&Math.abs(delta)<=15*60*1000){config.celestialEvent=event;config.celestialProgress=(delta+15*60*1000)/(30*60*1000);break;}
    }
  }
  return config;
}
