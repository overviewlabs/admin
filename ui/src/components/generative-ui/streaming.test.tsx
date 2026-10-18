// @vitest-environment jsdom
import {act, cleanup, renderHook} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";
import {completeStatements, useStableStream} from "./streaming";
afterEach(()=>{cleanup();vi.useRealTimers();});
describe("stable component streaming",()=>{
  it("holds partial tables, strings and escaped quotes until their statement ends",()=>{
    const ready = 'root = Stack([table])\n';
    expect(completeStatements(ready+'table = Table([Col("Name", ["One", "Two')).toBe(ready);
    const multiline = 'table = Table([\nCol("Name", ["One\\\"two", "Three"])\n])\n';
    expect(completeStatements(ready+multiline+'later = TextContent("unfinished')).toBe(ready+multiline);
  });
  it("coalesces continuously arriving tokens without starvation and flushes the final line",()=>{
    vi.useFakeTimers();document.documentElement.style.setProperty('--motion-duration-instant','80ms');
    const root = 'root = Stack([text])\n';
    const hook=renderHook(({source,complete,visible})=>useStableStream(source,complete,visible),{initialProps:{source:root,complete:false,visible:true}});
    hook.rerender({source:root+'text = TextContent("Fir',complete:false,visible:true});
    act(()=>vi.advanceTimersByTime(40));
    hook.rerender({source:root+'text = TextContent("First")\n',complete:false,visible:true});
    act(()=>vi.advanceTimersByTime(40));
    expect(hook.result.current).toContain('TextContent("First")');
    const final=root+'text = TextContent("Final")';
    hook.rerender({source:final,complete:true,visible:true});expect(hook.result.current).toBe(final);
    hook.rerender({source:final+'\nlater = TextContent("Hidden")\n',complete:false,visible:false});
    expect(vi.getTimerCount()).toBe(0);
  });
});
