// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatMessageEditor } from "./ChatMessageEditor";
import type { MarkdownEditorRef } from "./MarkdownEditor";
import { ChatInput, ChatInputEditor, ChatInputSubmitButton, ChatInputMentionButton, parseEditorContent } from "./ui/chat-input";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement, root: Root;
let handle: MarkdownEditorRef | null;
const tick = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); }); };
beforeEach(() => {
  container = document.createElement("div");document.body.append(container);root = createRoot(container);handle = null;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({x:0,y:0,top:0,bottom:20,left:0,right:100,width:100,height:20,toJSON:()=>({})});
  Range.prototype.getBoundingClientRect = () => ({x:0,y:0,top:0,bottom:20,left:0,right:100,width:100,height:20,toJSON:()=>({})});
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(async () => { await act(async () => root.unmount());container.remove();vi.restoreAllMocks(); });
async function render(props: Partial<React.ComponentProps<typeof ChatMessageEditor>> = {}) {
  function Harness() {
    const [value,setValue] = useState(props.value ?? "");
    return <><ChatMessageEditor {...props} ref={ref=>{handle=ref}} value={value} onChange={text=>{setValue(text);props.onChange?.(text)}} /><output>{value}</output></>;
  }
  await act(async () => root.render(<Harness />));await tick();
}
const editor = () => container.querySelector<HTMLElement>('[role="textbox"]')!;
const value = () => container.querySelector('output')!.textContent;
async function insert(text: string) { await act(async () => handle!.insertMarkdown(text));await tick(); }
async function key(key: string, init: KeyboardEventInit = {}) {
  await act(async () => editor().dispatchEvent(new KeyboardEvent("keydown",{key,code:key,...init,bubbles:true,cancelable:true})));
}
describe("simple-ai chat input integration", () => {
  it("keeps the toolbar in the same input context as the editor", async () => {
    const send = vi.fn();
    await render({ value: "hello", onSubmit: send, children: <><ChatInputMentionButton /><ChatInputSubmitButton /></> });
    expect(container.querySelectorAll('[data-slot="chat-input"]')).toHaveLength(1);
    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Send"]')!;
    await act(async () => button.click());
    expect(send).toHaveBeenCalledTimes(1);
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Insert @"]')!.click());
    await tick();
    expect(value()).toContain("@");
  });
  it("keeps draft whitespace, Markdown, newlines and literal HTML text intact", async () => {
    const source='  **bold**\n\n![image](https://example.com/image.png)\n<script>alert(1)</script>  ';
    await render({value:source});expect(value()).toBe(source);expect(editor().querySelector('script')).toBeNull();
    await act(async()=>handle!.clear());expect(value()).toBe('');await insert(source);expect(value()).toBe(source);
  });
  it("sends on Enter, keeps Shift+Enter as a newline, and does not send while composing IME", async () => {
    const submit=vi.fn();await render({value:'hello',onSubmit:submit,submitOnEnter:true});
    await key('Enter',{shiftKey:true});expect(submit).not.toHaveBeenCalled();
    await key('Enter');expect(submit).toHaveBeenCalledTimes(1);
    await act(async()=>editor().dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true})));
    await key('Enter',{isComposing:true});expect(submit).toHaveBeenCalledTimes(1);
  });
  it("retains Cmd/Ctrl+Enter submission and ordinary multiline Enter when requested", async () => {
    const submit=vi.fn();await render({value:'hello',onSubmit:submit});await key('Enter');expect(submit).not.toHaveBeenCalled();
    await key('Enter',{ctrlKey:true});expect(submit).toHaveBeenCalledTimes(1);
  });
  it("prevents edits and submission when the composer is disabled", async () => {
    const submit=vi.fn();await render({value:'saved',readOnly:true,onSubmit:submit,submitOnEnter:true});
    expect(editor().getAttribute('contenteditable')).toBe('false');await key('Enter');expect(submit).not.toHaveBeenCalled();expect(value()).toBe('saved');
  });
  it("inserts pasted image upload URLs into the existing Markdown payload", async () => {
    const upload=vi.fn(async()=> 'https://example.com/image.png');await render({imageUploadHandler:upload});
    const file=new File(['image'],'sample.png',{type:'image/png'});const paste=new Event('paste',{bubbles:true,cancelable:true});
    Object.defineProperty(paste,'clipboardData',{value:{files:[file],types:['Files'],getData:()=>''}});
    await act(async()=>editor().dispatchEvent(paste));await tick();expect(upload).toHaveBeenCalledWith(file);expect(value()).toBe('![sample.png](https://example.com/image.png)');
  });
  it("uploads pasted images into the owning attachment row without changing the text", async () => {
    const upload=vi.fn(async()=> '/api/files/image.png');
    await render({value:'Keep this text',imageUploadHandler:upload,imageAttachmentOnly:true});
    const file=new File(['image'],'sample.png',{type:'image/png'}),paste=new Event('paste',{bubbles:true,cancelable:true});
    Object.defineProperty(paste,'clipboardData',{value:{files:[file],types:['Files'],getData:()=>''}});
    await act(async()=>editor().dispatchEvent(paste));await tick();
    expect(upload).toHaveBeenCalledWith(file);expect(value()).toBe('Keep this text');expect(editor().querySelector('img')).toBeNull();
  });
  it("selects agent mentions without losing their app identity links", async () => {
    await render({mentions:[{id:'agent:agent-1',agentId:'agent-1',name:'Alice',kind:'agent'}]});await insert('@Ali');await tick();
    const option=Array.from(document.body.querySelectorAll('button')).find(button=>button.textContent==='Alice');expect(option).toBeTruthy();
    await act(async()=>option!.click());await tick();expect(value()).toContain('[@Alice](');expect(value()).toContain('agent-1');
  });
  it("leaves pasted documents with the owning composer when clipboard data also contains an image", async () => {
    const upload=vi.fn(async()=> 'https://example.com/image.png'),attachDocument=vi.fn();
    await render({imageUploadHandler:upload,onDropFile:attachDocument});
    const image=new File(['image'],'sample.png',{type:'image/png'}),documentFile=new File(['text'],'notes.txt',{type:'text/plain'});
    const paste=new Event('paste',{bubbles:true,cancelable:true});
    Object.defineProperty(paste,'clipboardData',{value:{files:[image,documentFile],types:['Files'],getData:()=>''}});
    await act(async()=>editor().dispatchEvent(paste));await tick();
    expect(upload).toHaveBeenCalledTimes(1);expect(attachDocument).not.toHaveBeenCalled();
    expect(value()).toBe('![sample.png](https://example.com/image.png)');
  });
  it("preserves slash command routing and excludes unavailable commands", async () => {
    await render({actionCommands:[{id:'action:new',kind:'action',command:'new',name:'New session',description:'Reset',aliases:['new']},{id:'action:hidden',kind:'action',command:'hidden',name:'Hidden',description:'Unavailable',aliases:['hidden'],disabled:true}]});
    await insert('/new');await tick();const option=Array.from(document.body.querySelectorAll('button')).find(button=>button.textContent==='new');expect(option).toBeTruthy();await act(async()=>option!.click());await tick();expect(value()?.trim()).toBe('/new');
    expect(document.body.textContent).not.toContain('Hidden');
  });
  it("turns the shared submit button into Stop while streaming", async () => {
    const stop=vi.fn(),send=vi.fn();await act(async()=>root.render(<ChatInput status="streaming" onStop={stop} onSubmit={send}><ChatInputEditor/><ChatInputSubmitButton/></ChatInput>));await tick();
    const button=container.querySelector<HTMLButtonElement>('button[aria-label="Stop"]')!;await act(async()=>button.click());expect(stop).toHaveBeenCalledTimes(1);expect(send).not.toHaveBeenCalled();
  });
  it("serializes line breaks and mention references without trimming queued drafts", () => {
    expect(parseEditorContent({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'  first '}]},{type:'paragraph'},{type:'paragraph',content:[{type:'text',text:'last  '}]}]},undefined,{}).text).toBe('  first \n\nlast  ');
  });
});
