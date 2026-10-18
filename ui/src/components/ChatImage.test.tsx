// @vitest-environment jsdom
import {act} from "react";
import {createRoot} from "react-dom/client";
import {afterEach,beforeEach,describe,expect,it} from "vitest";
import {ChatImage} from "./ChatImage";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host)});
afterEach(()=>{act(()=>root.unmount());host.remove()});
describe('chat image delivery',()=>{
  it('falls back once, then offers a manual retry without looping',()=>{
    act(()=>root.render(<ChatImage src="/original" fallbackSrc="data:image/webp;base64,AAAA" alt="Photo"/>));
    act(()=>host.querySelector('img')!.dispatchEvent(new Event('error')));
    expect(host.querySelector('img')!.getAttribute('src')).toBe('data:image/webp;base64,AAAA');
    act(()=>host.querySelector('img')!.dispatchEvent(new Event('error')));
    expect(host.querySelector('img')).toBeNull();expect(host.textContent).toContain('Image unavailable');
    act(()=>host.querySelector('button')!.click());expect(host.querySelector('img')!.getAttribute('src')).toBe('/original');
    act(()=>host.querySelector('img')!.dispatchEvent(new Event('load')));
    expect(host.querySelector('[data-image-state]')!.getAttribute('data-image-state')).toBe('loaded');
  });
  it('clears failure when navigating to another image and avoids nested retry buttons',()=>{
    act(()=>root.render(<ChatImage src="/first" retryable={false}/>));
    act(()=>host.querySelector('img')!.dispatchEvent(new Event('error')));expect(host.querySelector('button')).toBeNull();
    act(()=>root.render(<ChatImage src="/second" retryable={false}/>));expect(host.querySelector('img')!.getAttribute('src')).toBe('/second');expect(host.textContent).not.toContain('unavailable');
  });
});
