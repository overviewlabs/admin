import {describe,expect,it} from "vitest";
import {resolveWeatherAnimation,weatherConditions} from "./weather-animation";
describe("weather snapshot mapping",()=>{
  it.each([[0,"clear","light"],[1,"cloudy","light"],[2,"cloudy","light"],[3,"overcast","heavy"],[45,"fog","medium"],[48,"fog","heavy"],[51,"drizzle","light"],[53,"drizzle","medium"],[55,"drizzle","heavy"],[56,"freezing-rain","light"],[57,"freezing-rain","heavy"],[61,"rain","light"],[63,"rain","medium"],[65,"rain","heavy"],[66,"freezing-rain","light"],[67,"freezing-rain","heavy"],[71,"snow","light"],[73,"snow","medium"],[75,"snow","heavy"],[77,"flurries","light"],[80,"showers","light"],[81,"showers","medium"],[82,"showers","heavy"],[85,"flurries","light"],[86,"snow","heavy"],[95,"storm","medium"],[96,"hail","light"],[97,"storm","heavy"],[99,"hail","heavy"]])("maps WMO %s to %s/%s",(weatherCode,condition,intensity)=>{
    expect(resolveWeatherAnimation({weatherCode:Number(weatherCode),intensity:"light",animationCondition:"clear"})).toMatchObject({condition,intensity});
  });
  it.each(weatherConditions)("supports all three severities and both fidelities for explicit %s",condition=>{
    for(const intensity of ["light","medium","heavy"] as const)for(const fidelity of ["subtle","rich"] as const)expect(resolveWeatherAnimation({animationCondition:condition,intensity,isDay:false,fidelity})).toMatchObject({condition,intensity,time:"night",fidelity});
  });
  it("preserves unknown data instead of inventing fair skies or hazards",()=>{
    expect(resolveWeatherAnimation({})).toBeNull();expect(resolveWeatherAnimation({weatherCode:999,condition:"clear"})).toBeNull();expect(resolveWeatherAnimation({weatherCode:null,cloudCover:100})).toBeNull();
    expect(resolveWeatherAnimation({weatherCode:75,animationCondition:"blizzard"})?.condition).toBe("snow");
    expect(resolveWeatherAnimation({weatherCode:2,cloudCover:80})?.intensity).toBe("medium");
  });
  it("maps real moon phases and gates events to a snapshot in the same timestamp format",()=>{
    for(const [moonPhase,expected] of [[0,"new"],[.125,"waxing-crescent"],[.25,"first-quarter"],[.375,"waxing-gibbous"],[.5,"full"],[.625,"waning-gibbous"],[.75,"last-quarter"],[.875,"waning-crescent"],[1,"new"]] as const)expect(resolveWeatherAnimation({weatherCode:0,moonPhase})?.moonPhase).toBe(expected);
    const data={weatherCode:0,isDay:true,observedAt:"2026-10-12T07:30",sunrise:"2026-10-12T07:30"};expect(resolveWeatherAnimation(data)).toMatchObject({celestialEvent:"sunrise",celestialProgress:.5});
    expect(resolveWeatherAnimation({...data,observedAt:"2026-10-12T13:00"})?.celestialEvent).toBe("none");
    expect(resolveWeatherAnimation({...data,observedAt:"2026-10-12T07:30Z"})?.celestialEvent).toBe("none");
  });
});
