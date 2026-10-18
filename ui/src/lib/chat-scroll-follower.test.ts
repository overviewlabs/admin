// @vitest-environment jsdom
import {afterEach, describe, expect, it, vi} from "vitest";
import {createChatScrollFollower, shouldFollowChatScroll} from "./chat-scroll-follower";
afterEach(()=>{vi.unstubAllGlobals();document.documentElement.style.removeProperty('--motion-duration-base');});
describe("retargetable chat following",()=>{
  it("never reattaches a small upward scroll until the reader reaches the actual bottom",()=>{
    expect(shouldFollowChatScroll(true,600,595,5,100)).toBe(false);
    expect(shouldFollowChatScroll(false,595,598,2,100)).toBe(false);
    expect(shouldFollowChatScroll(false,598,600,0,100)).toBe(true);
    expect(shouldFollowChatScroll(true,600,600,40,100)).toBe(true);
  });
  it("cancels before the next frame when a scrollbar drag moved the viewport",()=>{
    let callback:FrameRequestCallback|null=null;
    vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{callback=fn;return 1;});
    vi.stubGlobal('cancelAnimationFrame',()=>{callback=null;});
    vi.stubGlobal('matchMedia',()=>({matches:false}));
    document.documentElement.style.setProperty('--motion-duration-base','240ms');
    const el=document.createElement('div');Object.defineProperties(el,{clientHeight:{value:400},scrollHeight:{value:1000}});
    el.scrollTop=400;const motion=createChatScrollFollower(el);motion.follow();
    el.scrollTop=350;const next=callback! as FrameRequestCallback;next(performance.now()+16);
    expect(el.scrollTop).toBe(350);expect(motion.active).toBe(false);expect(callback).toBeNull();
  });
  it("glides toward growing content, never overshoots, and stops requesting frames at rest",()=>{
    let callback: FrameRequestCallback | null=null, height=1000, top=0;
    const el=document.createElement('div');
    Object.defineProperties(el,{clientHeight:{value:400},scrollHeight:{get:()=>height},scrollTop:{get:()=>top,set:value=>{top=Math.round(value);}}});
    vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{callback=fn;return 1;});vi.stubGlobal('cancelAnimationFrame',()=>{callback=null;});
    vi.stubGlobal('matchMedia',()=>({matches:false}));document.documentElement.style.setProperty('--motion-duration-base','240ms');
    const motion=createChatScrollFollower(el);motion.follow();let time=performance.now();
    let last=0;
    for(let i=0;i<60&&callback;i++){
      if(i===3)height=1200;
      const next=callback as FrameRequestCallback;callback=null;next(time+=16);
      expect(top).toBeGreaterThanOrEqual(last);expect(top).toBeLessThanOrEqual(height-400);last=top;
    }
    expect(top).toBe(800);expect(motion.active).toBe(false);expect(callback).toBeNull();
    height=1400;motion.follow();expect(motion.active).toBe(true);motion.cancel();expect(callback).toBeNull();
    top=200;expect(motion.ownsPosition()).toBe(false);
  });
  it("uses an immediate position for reduced motion and creates no idle frames",()=>{
    vi.stubGlobal('matchMedia',()=>({matches:true}));const raf=vi.fn();vi.stubGlobal('requestAnimationFrame',raf);
    const el=document.createElement('div');Object.defineProperties(el,{clientHeight:{value:400},scrollHeight:{value:1000}});
    const motion=createChatScrollFollower(el);motion.follow();expect(el.scrollTop).toBe(1000);expect(raf).not.toHaveBeenCalled();
  });
});
