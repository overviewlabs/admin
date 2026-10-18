// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {WeatherCardView,NewsFeedView,StockChartView,chartGeometry,weatherVisual,weatherTime} from "./rich-components";
import {InteractiveAnswer} from "./InteractiveAnswer";
import {ThemeProvider} from "@/context/ThemeContext";

vi.mock("./dynamic-weather-card",()=>({DynamicWeatherCard:({weather}:{weather:{city:string;humidity?:number}})=><div className="dynamic-weather-host" data-condition="rainy"><h3>{weather.city}</h3><span>{weather.humidity}%</span></div>}));
const observers=new Set<(visible:boolean)=>void>();
beforeEach(()=>{
  vi.stubGlobal("matchMedia",()=>({matches:false,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal("IntersectionObserver",class {notify:(visible:boolean)=>void;constructor(callback:IntersectionObserverCallback){this.notify=visible=>callback([{isIntersecting:visible} as IntersectionObserverEntry],this as unknown as IntersectionObserver);observers.add(this.notify);}observe(){this.notify(true);}disconnect(){observers.delete(this.notify);}});
  vi.stubGlobal("ResizeObserver",class {observe(){}disconnect(){}});
  vi.spyOn(HTMLMediaElement.prototype,"pause").mockImplementation(()=>{});
});
afterEach(()=>{cleanup();observers.clear();vi.restoreAllMocks();vi.unstubAllGlobals();});
describe("rich native chat components",()=>{
  it("formats offset-bearing weather times in the location timezone without guessing local timestamps",()=>{
    expect(weatherTime("2026-10-12T01:00:00Z","Asia/Tokyo")).toMatch(/10:00/);
    expect(weatherTime("2026-10-12T10:00:00","Asia/Tokyo")).toBe("2026-10-12 10:00:00");
    expect(weatherTime("Today at 10:00 EDT")).toBe("Today at 10:00 EDT");
    expect(weatherTime("2026-10-12T01:00:00Z","Not/AZone")).toBe("2026-10-12T01:00:00Z");
  });
  it("composes rich components inside native tabs",async()=>{
    const source='root = Stack([tabs])\ntabs = Tabs([TabItem("weather","Weather",[weather]),TabItem("news","News",[news])])\nweather = WeatherCard({city:"Hamilton",temperature:62,unit:"°F",condition:"Overcast",weatherCode:3})\nnews = NewsFeed([{title:"Verified headline",url:"https://news.example/story",publisher:"Publisher"}])';
    render(<InteractiveAnswer source={source}/>,{wrapper:ThemeProvider});
    // OpenUI can activate the latest tab as hoisted definitions arrive.
    const weatherTab=await screen.findByRole("tab",{name:"Weather"});
    fireEvent.mouseDown(weatherTab,{button:0,ctrlKey:false});
    await screen.findByRole("heading",{name:"Hamilton"});
    fireEvent.mouseDown(screen.getByRole("tab",{name:"News"}),{button:0,ctrlKey:false});
    await screen.findByRole("heading",{name:"Verified headline"});
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("selects real weather scenes, automatically manages motion, and preserves missing values",()=>{
    expect(weatherVisual(0)).toBe("clear");expect(weatherVisual(3)).toBe("overcast");expect(weatherVisual(65)).toBe("rain");expect(weatherVisual(75)).toBe("snow");expect(weatherVisual(95)).toBe("storm");expect(weatherVisual(undefined,"Partly cloudy")).toBe("cloudy");expect(weatherVisual()).toBe("unknown");
    const {container}=render(<WeatherCardView weather={{city:"Hamilton",temperature:16.5,unit:"°C",weatherCode:65,condition:"Rain",humidity:91}}/>);
    expect(container.querySelector(".dynamic-weather-host")?.getAttribute("data-condition")).toBe("rainy");
    expect(screen.queryByText("Wind")).toBeNull();
    expect(screen.queryByRole("button",{name:/weather animation/})).toBeNull();
    expect(screen.getByText("91%")).toBeTruthy();
  });
  it("streams a registered domain component instead of treating it as an unknown function",async()=>{
    render(<InteractiveAnswer source={'root = Stack([weather])\nweather = WeatherCard({city:"Hamilton, Ohio",temperature:62,unit:"°F",condition:"Rain",weatherCode:63,isDay:false,humidity:90,sourceUrl:"https://open-meteo.com/en/docs"})'}/>,{wrapper:ThemeProvider});
    await screen.findByRole("heading",{name:"Hamilton, Ohio"});
    expect(screen.queryByRole("alert")).toBeNull();expect(document.querySelector('.dynamic-weather-host[data-condition="rainy"]')).toBeTruthy();
  });
  it("loads only the clicked provider player, retains it during playback offscreen, and stops on demand",async()=>{
    const source='root = Stack([videos])\nvideos = VideoGallery([{title:"First video",src:"https://youtu.be/M7lc1UVf-VE"},{title:"Second video",src:"https://vimeo.com/123456789"}])';
    render(<InteractiveAnswer source={source}/>,{wrapper:ThemeProvider});
    await screen.findByRole("button",{name:"Play First video"});expect(document.querySelectorAll("iframe")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button",{name:"Play First video"}));
    expect(document.querySelectorAll("iframe")).toHaveLength(1);
    const frame=document.querySelector("iframe")!;expect(frame.src).toContain("youtube-nocookie.com/embed/");expect(frame.getAttribute("referrerpolicy")).toBe("strict-origin-when-cross-origin");
    fireEvent.load(frame);
    observers.forEach(notify=>notify(false));
    await waitFor(()=>expect(document.querySelector("iframe")).toBe(frame));
    fireEvent.click(screen.getByRole("button",{name:"Stop player"}));
    await waitFor(()=>expect(document.querySelector("iframe")).toBeNull());
  });
  it("keeps explicitly playing native audio mounted when scrolled away",async()=>{
    render(<InteractiveAnswer source={'root = Stack([track])\ntrack = MusicPlayer({title:"Voice note",src:"/api/attachments/audio/content",author:"Example"})'}/>,{wrapper:ThemeProvider});
    await screen.findByRole("heading",{name:"Voice note"});const audio=document.querySelector("audio")!;
    expect(audio.preload).toBe("none");fireEvent.play(audio);observers.forEach(notify=>notify(false));
    await waitFor(()=>expect(document.querySelector("audio")).toBe(audio));
    fireEvent.pause(audio);await waitFor(()=>expect(document.querySelector("audio")).toBe(audio));
    expect(audio.preload).toBe("none");
  });
  it("uses safe story links and a deliberate fallback for missing thumbnails",()=>{
    render(<NewsFeedView articles={[{title:"Actual headline",url:"https://news.example/story",publisher:"Publisher"},{title:"Bad URL",url:"javascript:alert(1)"}]}/>);
    expect(screen.getByRole("link",{name:"Actual headline"}).getAttribute("href")).toBe("https://news.example/story");
    expect(screen.queryByRole("link",{name:"Bad URL"})).toBeNull();expect(document.querySelectorAll(".rich-news-placeholder")).toHaveLength(2);
  });
  it("keeps range controls available when a narrow range has too few observations",()=>{
    render(<StockChartView stock={{symbol:"WEEKLY",price:110,series:[{time:"2026-10-01",value:100},{time:"2026-10-10",value:110}]}}/>);
    fireEvent.click(screen.getByRole("button",{name:"1D"}));
    expect(screen.queryByRole("img")).toBeNull();expect(screen.getByText(/Not enough observations in this range/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"ALL"}));
    expect(screen.getByRole("img",{name:/WEEKLY price chart/})).toBeTruthy();
  });
  it("inspects supplied prices without changing the quoted snapshot and does not invent missing history",()=>{
    render(<StockChartView stock={{symbol:"DEMO",price:110,currency:"USD",changePercent:10,series:[{time:"2026-10-01",value:100},{time:"2026-10-02",value:110}]}}/>);
    const chart=screen.getByRole("img",{name:/DEMO price chart/});fireEvent.keyDown(chart,{key:"Home"});
    expect(screen.getByText("$110.00",{selector:"strong"})).toBeTruthy();expect(screen.getByText("2026-10-01 · $100.00")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"1W"}));expect(screen.getByRole("button",{name:"1W"}).getAttribute("aria-pressed")).toBe("true");
    cleanup();render(<StockChartView stock={{symbol:"DEMO",price:100}}/>);expect(screen.queryByRole("img")).toBeNull();expect(screen.getByText(/Historical price data wasn’t supplied/)).toBeTruthy();
    const flat=chartGeometry([{value:5},{value:5}]);expect(flat.coordinates[0].y).toBeCloseTo(120);expect(flat.line).not.toMatch(/NaN|Infinity/);
  });
});
