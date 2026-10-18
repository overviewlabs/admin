import {resolveWeatherAnimation,type WeatherAnimationData} from './weather-animation';
export interface WeatherCardOptions {
 variant?:'current'|'forecast'|'detailed'|'compact';size?:'compact'|'wide'|'full';title?:string;
 forecastDays?:number;forecastHours?:number;showDaily?:boolean;showHourly?:boolean;
 forecastLayout?:'grid'|'strip';temperatureBars?:boolean;forecastWind?:boolean;hourlyChart?:boolean;
 quality?:'high'|'medium'|'low';visualStyle?:'modern'|'classic';
 showClock?:boolean;showDate?:boolean;showHumidity?:boolean;showWind?:boolean;
 showSunTimes?:boolean;glassDrops?:boolean;windEffects?:boolean;
}
type ForecastSnapshot=WeatherAnimationData&{day:string;datetime?:string;high?:number|null;low?:number|null;temperature?:number|null;precipitationProbability?:number|null;precipitation?:number|null;wind?:number|null;windDirection?:number|null};
export interface WeatherSnapshot extends WeatherAnimationData {
 city:string;temperature?:number|null;unit:string;feelsLike?:number|null;humidity?:number|null;
 wind?:number|null;windUnit?:string;windDirection?:string;windBearing?:number|null;windGust?:number|null;
 pressure?:number|null;pressureUnit?:string;uvIndex?:number|null;dewPoint?:number|null;precipitation?:number|null;
 timezone?:string;card?:WeatherCardOptions;forecast?:ForecastSnapshot[];dailyForecast?:ForecastSnapshot[];hourlyForecast?:ForecastSnapshot[];
}
export function dynamicCondition(data:WeatherAnimationData):string|null {
 const scene=resolveWeatherAnimation(data);if(!scene)return null;
 switch(scene.condition){
  case 'clear':return data.isDay===false?'clear-night':'sunny';
  case 'cloudy':return 'partlycloudy';case 'overcast':return 'cloudy';
  case 'drizzle':case 'freezing-rain':return 'rainy';
  case 'rain':case 'showers':return scene.intensity==='heavy'?'pouring':'rainy';
  case 'snow':case 'flurries':case 'blizzard':return 'snowy';case 'sleet':return 'snowy-rainy';
  case 'storm':return 'lightning-rainy';case 'hail':return 'hail';
  case 'fog':case 'mist':return 'fog';case 'wind':return 'windy';
  default:return null;
 }
}
export function dynamicForecast(weather:WeatherSnapshot){
 return (weather.forecast||[]).flatMap(day=>{
  const datetime=day.datetime||day.day;
  if(!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(datetime)||!Number.isFinite(Date.parse(datetime)))return [];
  const condition=dynamicCondition(day);
  return [{datetime:datetime.length===10?datetime+'T12:00:00':datetime,temperature:day.high??day.temperature??undefined,templow:day.low??undefined,condition:condition??'unknown',precipitation_probability:day.precipitationProbability??undefined,wind_speed:day.wind??undefined,wind_bearing:day.windDirection??undefined,...(day.precipitation!=null?{precipitation:day.precipitation}:{})}];
 });
}
export function weatherForecastSets(weather:WeatherSnapshot){
 const legacy=weather.forecast||[],daily=weather.dailyForecast||legacy.filter(d=>!(/T\d/.test(d.datetime||d.day))),hourly=weather.hourlyForecast||legacy.filter(d=>/T\d/.test(d.datetime||d.day));
 const options=weather.card||{};
 return {daily:dynamicForecast({...weather,forecast:daily}).slice(0,Math.max(1,Math.min(16,options.forecastDays??daily.length))),hourly:dynamicForecast({...weather,forecast:hourly}).slice(0,Math.max(1,Math.min(24,options.forecastHours??hourly.length)))};
}
export function weatherCardConfig(weather:WeatherSnapshot){
 const options=weather.card||{},sets=weatherForecastSets(weather),forecast=options.variant!=='current'&&options.variant!=='compact';
 const low=(weather.dailyForecast||weather.forecast||[]).find(d=>(d.datetime||d.day).slice(0,10)===weather.observedAt?.slice(0,10))?.low;
 return {type:'custom:dynamic-weather-card',entity:'weather.overview',name:options.title||weather.city,language:'en',
  tap_action:{action:'none'},hold_action:{action:'none'},double_tap_action:{action:'none'},
  layout:options.variant==='compact'?'minimal':'default',visual_style:options.visualStyle||'modern',animation_quality:options.quality||'medium',
  show_daily_forecast:options.showDaily??(forecast&&sets.daily.length>0),show_hourly_forecast:options.showHourly??(forecast&&sets.hourly.length>0),
  daily_forecast_days:sets.daily.length||1,hourly_forecast_hours:sets.hourly.length||1,
  show_temperature_bars:options.temperatureBars!==false,show_forecast_wind:options.forecastWind!==false,hourly_forecast_chart:options.hourlyChart===true,
  show_feels_like:weather.feelsLike!=null,show_min_temp:low!=null,show_humidity:options.showHumidity!==false&&weather.humidity!=null,
  show_wind:options.showWind!==false&&weather.wind!=null,show_wind_gust:weather.windGust!=null,
  show_sunrise_sunset:options.showSunTimes!==false&&Boolean(weather.sunrise&&weather.sunset),
  show_clock:options.showClock===true,show_date:options.showDate===true,show_raindrops:options.glassDrops!==false,show_wind_effects:options.windEffects!==false,
  show_pressure:weather.pressure!=null,show_uv_index:weather.uvIndex!=null,show_dew_point:weather.dewPoint!=null};
}
export function createWeatherBridge(){
 type Forecast=ReturnType<typeof dynamicForecast>;type Event={type:string;forecast:Forecast};
 const listeners=new Map<(event:Event)=>void,string>();let sets:{daily:Forecast;hourly:Forecast}={daily:[],hourly:[]};
 return {update(weather:WeatherSnapshot){
  sets=weatherForecastSets(weather);
  const list=(type:string)=>type==='daily'?sets.daily:type==='hourly'?sets.hourly:[];
  for(const [callback,type] of listeners)callback({type,forecast:list(type)});
  return {language:'en',locale:{language:'en',number_format:'language',time_format:'24'},
   config:{time_zone:weather.timezone||'UTC',unit_system:{temperature:weather.unit}},themes:{},selectedTheme:null,
   states:{'weather.overview':{entity_id:'weather.overview',state:dynamicCondition(weather)||'unknown',attributes:{
    templow:(weather.dailyForecast||weather.forecast)?.find(day=>(day.datetime||day.day).slice(0,10)===weather.observedAt?.slice(0,10))?.low??undefined,
    friendly_name:weather.city,temperature:weather.temperature??undefined,temperature_unit:weather.unit,
    apparent_temperature:weather.feelsLike??undefined,humidity:weather.humidity??undefined,
    wind_speed:weather.wind??undefined,wind_speed_unit:weather.windUnit||'km/h',wind_bearing:weather.windBearing??undefined,
    wind_direction:weather.windDirection,wind_gust_speed:weather.windGust??undefined,
    pressure:weather.pressure??undefined,pressure_unit:weather.pressureUnit||'hPa',uv_index:weather.uvIndex??undefined,
    dew_point:weather.dewPoint??undefined,precipitation:weather.precipitation??undefined,
    sunrise:weather.sunrise,sunset:weather.sunset,forecast:[]
   }}},connection:{subscribeMessage:async(callback:(event:Event)=>void,message:Record<string,unknown>)=>{
    const type=String(message.forecast_type);listeners.set(callback,type);callback({type,forecast:list(type)});return ()=>{listeners.delete(callback)};
   }}};
 },clear(){listeners.clear()}};
}
