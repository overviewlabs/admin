import {useEffect,useRef,useState} from 'react';
import {createWeatherBridge,dynamicCondition,type WeatherSnapshot} from './dynamic-weather-data';
import {gridForecastStyles} from '@/lib/dynamic-weather-card/styles';
import {weatherCardConfig} from './dynamic-weather-data';
import {resolveWeatherAnimation} from './weather-animation';
const asset='/vendor/dynamic-weather-card-2026.10.1.js';
let loading:Promise<unknown>|undefined;
export function loadDynamicWeatherCard(){
 return loading??=import(/* @vite-ignore */ asset).catch(error=>{loading=undefined;throw error});
}
interface CardElement extends HTMLElement {
 setConfig(config:Record<string,unknown>):void;hass:ReturnType<ReturnType<typeof createWeatherBridge>['update']>;
 _testTimeOfDay:{type:string;progress:number};_testMoonPhase?:number|null;
}
export function DynamicWeatherCard({weather}:{weather:WeatherSnapshot}){
 const host=useRef<HTMLDivElement>(null),card=useRef<CardElement|null>(null),bridge=useRef(createWeatherBridge());
 const [failed,setFailed]=useState(false);const serialized=JSON.stringify(weather),condition=dynamicCondition(weather);
 useEffect(()=>{
  let cancelled=false;if(!condition){card.current?.remove();card.current=null;return;}
  void loadDynamicWeatherCard().then(()=>{
   if(cancelled||!host.current)return;
   const snapshot=JSON.parse(serialized) as WeatherSnapshot;
   const element=card.current??document.createElement('dynamic-weather-card') as CardElement;
   const animation=resolveWeatherAnimation(snapshot);
   element._testTimeOfDay={type:animation?.celestialEvent==='sunrise'||animation?.celestialEvent==='sunset'?animation.celestialEvent:snapshot.isDay===false?'night':'day',progress:animation?.celestialProgress??0.5};
   element._testMoonPhase=typeof snapshot.moonPhase==='number'?snapshot.moonPhase:null;
   const config=weatherCardConfig(snapshot);
   element.dataset.variant=snapshot.card?.variant||'detailed';
   element.setConfig({...config,height:parseFloat(getComputedStyle(host.current).getPropertyValue('--weather-card-height'))||undefined,
    styles:snapshot.card?.forecastLayout==='strip'?'':gridForecastStyles});
   element.hass=bridge.current.update(snapshot);
   if(!card.current){card.current=element;host.current.append(element)}setFailed(false);
  }).catch(()=>{if(!cancelled)setFailed(true)});
  return()=>{cancelled=true};
 },[serialized,condition]);
 useEffect(()=>()=>{card.current?.remove();card.current=null;bridge.current.clear()},[]);
 return <div className="dynamic-weather-host" data-size={weather.card?.size||"wide"} data-variant={weather.card?.variant||"detailed"} ref={host} data-condition={condition||'unknown'}>
  {!condition||failed?<p className="rich-empty">{!condition?'Weather condition unavailable':'Weather card unavailable'}</p>:null}
 </div>;
}
