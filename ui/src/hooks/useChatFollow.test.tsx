// @vitest-environment jsdom
import {useRef} from "react";
import {act,cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {useChatFollow} from "./useChatFollow";

afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("Admin and onboarding readers remain detached through tokens, resizes and visibility changes",()=>{
  let height=1000,resize=()=>{};
  vi.stubGlobal("matchMedia",()=>({matches:true}));
  vi.stubGlobal("ResizeObserver",class {constructor(callback:ResizeObserverCallback){resize=()=>callback([],this as unknown as ResizeObserver);}observe(){}disconnect(){}});
  function Host({content}:{content:number}){
    const ref=useRef<HTMLDivElement|null>(null),follow=useChatFollow(ref,content,"same-chat");
    return <><div data-testid="viewport" ref={node=>{
      ref.current=node;if(!node||node.dataset.geometry)return;node.dataset.geometry="true";let top=0;
      Object.defineProperties(node,{clientHeight:{value:400},scrollHeight:{get:()=>height},scrollTop:{get:()=>top,set:value=>{top=Math.max(0,Math.min(value,height-400));}}});
    }} onScroll={follow.onScroll}><div>Messages</div></div><button onClick={follow.resume}>Latest</button><span>{follow.away?"Reading history":"Following"}</span></>;
  }
  const view=render(<Host content={1}/>),el=screen.getByTestId("viewport");
  expect(el.scrollTop).toBe(600);
  fireEvent.wheel(el,{deltaY:-5});el.scrollTop=595;fireEvent.scroll(el);
  height=1200;view.rerender(<Host content={2}/>);act(()=>resize());
  fireEvent(document,new Event("visibilitychange"));
  expect(el.scrollTop).toBe(595);expect(screen.getByText("Reading history")).toBeTruthy();
  el.scrollTop=798;fireEvent.scroll(el);view.rerender(<Host content={3}/>);
  expect(el.scrollTop).toBe(798);
  fireEvent.click(screen.getByText("Latest"));expect(el.scrollTop).toBe(800);
  height=1400;view.rerender(<Host content={4}/>);expect(el.scrollTop).toBe(1000);
});

it("opens at latest and retains follow when a late visual grows before a scroll event",()=>{
  let height=1000,resize=()=>{};
  vi.stubGlobal("matchMedia",()=>({matches:true}));
  vi.stubGlobal("ResizeObserver",class {constructor(callback:ResizeObserverCallback){resize=()=>callback([],this as unknown as ResizeObserver);}observe(){}disconnect(){}});
  function Host(){
    const ref=useRef<HTMLDivElement|null>(null),follow=useChatFollow(ref,1,"opened-chat");
    return <div data-testid="viewport" ref={node=>{ref.current=node;if(!node||node.dataset.geometry)return;node.dataset.geometry="true";let top=50;Object.defineProperties(node,{clientHeight:{value:400},scrollHeight:{get:()=>height},scrollTop:{get:()=>top,set:value=>{top=Math.max(0,Math.min(value,height-400));}}});}} onScroll={follow.onScroll}><div>Late content</div></div>;
  }
  render(<Host/>);const el=screen.getByTestId("viewport");expect(el.scrollTop).toBe(600);
  height=1500;fireEvent.scroll(el);act(()=>resize());expect(el.scrollTop).toBe(1100);
  fireEvent.wheel(el,{deltaY:-100});el.scrollTop=1000;fireEvent.scroll(el);
  height=1800;act(()=>resize());expect(el.scrollTop).toBe(1000);
});
