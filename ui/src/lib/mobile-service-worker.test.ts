// @vitest-environment node
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
const source=readFileSync(new URL("../../public/sw.js",import.meta.url),"utf8");
function worker() {
  const handlers:Record<string,Function>={};
  const showNotification=vi.fn().mockResolvedValue(undefined);
  const openWindow=vi.fn().mockResolvedValue(undefined);
  const cachePut=vi.fn();
  const fetch=vi.fn().mockRejectedValue(new Error("offline"));
  const context={URL,Response,fetch,caches:{keys:async()=>[],match:async()=>undefined,open:async()=>({put:cachePut})},self:{location:{origin:"https://overviewlabs.ai"},registration:{showNotification},clients:{matchAll:async()=>[],openWindow},addEventListener:(name:string,fn:Function)=>handlers[name]=fn}};
  vm.runInNewContext(source,context);
  return {handlers,showNotification,openWindow,fetch,cachePut};
}
describe("mobile service worker",()=>{
  it("never intercepts authenticated API or Admin responses",()=>{
    const w=worker();const respondWith=vi.fn();
    for(const path of ["/api/companies","/admin-portal/api/chats","/admin-portal/"])w.handlers.fetch({request:{method:"GET",url:"https://overviewlabs.ai"+path,mode:"navigate"},respondWith});
    expect(respondWith).not.toHaveBeenCalled();
  });
  it("returns a real reconnect page when offline rather than cached private HTML",async()=>{
    const w=worker();let response:Promise<Response>;
    w.handlers.fetch({request:{method:"GET",url:"https://overviewlabs.ai/OVE/admin",mode:"navigate"},respondWith:(p:Promise<Response>)=>response=p});
    const result=await response!;expect(result.status).toBe(503);expect(await result.text()).toContain("You’re offline");
  });
  it("displays push and restricts tap navigation to the app origin",async()=>{
    const w=worker();let done:Promise<void>;
    w.handlers.push({data:{json:()=>({title:"WHOXOS",body:"Task completed",url:"https://evil.test/",tag:"test"})},waitUntil:(p:Promise<void>)=>done=p});await done!;
    expect(w.showNotification.mock.calls[0][1].data.url).toBe("https://overviewlabs.ai");
    w.handlers.notificationclick({notification:{close:vi.fn(),data:{url:"https://evil.test/"}},waitUntil:(p:Promise<void>)=>done=p});await done!;expect(w.openWindow).not.toHaveBeenCalled();
  });
});
