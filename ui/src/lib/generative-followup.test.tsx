// @vitest-environment jsdom
import {act,useRef,useState} from "react";
import {createRoot} from "react-dom/client";
import {afterEach,describe,expect,it,vi} from "vitest";
import {prepareGenerativeFollowup,useGenerativeFollowup} from "./generative-followup";
(globalThis as unknown as {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
afterEach(()=>document.body.replaceChildren());
describe("interactive answer follow-ups",()=>{
  it("prepares a draft only in its own conversation and preserves an existing draft",()=>{
    const host=document.createElement("div");document.body.append(host);const root=createRoot(host),submit=vi.fn();
    function Chat({name,initial=""}:{name:string;initial?:string}){
      const ref=useRef<HTMLDivElement>(null),[draft,setDraft]=useState(initial);
      useGenerativeFollowup(ref,draft,setDraft);
      return <section data-generative-chat-scope><div id={name+"-answer"}/><div ref={ref} data-generative-composer="true"><output id={name}>{draft}</output><button onClick={submit}>Send</button></div></section>;
    }
    act(()=>root.render(<><Chat name="first" initial="Keep my draft"/><Chat name="second"/></>));
    expect(()=>prepareGenerativeFollowup(document.getElementById("first-answer")!,"New request")).toThrow("kept");
    act(()=>prepareGenerativeFollowup(document.getElementById("second-answer")!,"Compare the chosen values"));
    expect(document.getElementById("first")?.textContent).toBe("Keep my draft");expect(document.getElementById("second")?.textContent).toBe("Compare the chosen values");expect(submit).not.toHaveBeenCalled();act(()=>root.unmount());
  });
});
