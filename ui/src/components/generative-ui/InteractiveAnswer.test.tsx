// @vitest-environment jsdom
import {act, cleanup, render, screen, fireEvent, waitFor} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {ThemeProvider, useTheme} from "@/context/ThemeContext";
import {MarkdownBody} from "../MarkdownBody";
import {InteractiveAnswer} from "./InteractiveAnswer";
import {TaskChatBubble} from "../task-chat/TaskChatBubble";

const observers = new Set<(visible: boolean) => void>();
const prefix = 'root = Stack([field, total, reset, later])\n$qty = "10"\nfield = FormControl("Units", Input("qty", "Units", "number", {min:0}, $qty))\ntotal = TextContent("Example total: $" + ($qty * 2))\nreset = Button("Reset", Action([@Reset($qty)]), "secondary")\n';
function Wrapper({children}: {children: React.ReactNode}) {
  return <ThemeProvider>{children}<Toggle/></ThemeProvider>;
}
function Toggle() {const {toggleTheme}=useTheme(); return <button onClick={toggleTheme}>Toggle theme</button>;}
beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class {
    notify: (visible: boolean)=>void;
    constructor(callback: IntersectionObserverCallback) { this.notify = visible => callback([{isIntersecting:visible} as IntersectionObserverEntry], this as unknown as IntersectionObserver);observers.add(this.notify); }
    observe() {this.notify(true);}
    disconnect() {observers.delete(this.notify);}
  });
  vi.stubGlobal('ResizeObserver', class {observe() {} disconnect() {}});
});
afterEach(() => {cleanup();vi.unstubAllGlobals();observers.clear();});
describe('native OpenUI chat rendering', () => {
  it('holds a streaming task visual until the fence closes, then reveals the finished UI', async () => {
    const source='```openui\n'+prefix;
    const bubble=(text:string)=><TaskChatBubble item={{id:'stream',kind:'message',author:'agent',text,streaming:true}}/>;
    const view=render(bubble(source),{wrapper:Wrapper});
    expect(screen.queryByText('Example total: $20')).toBeNull();
    expect(screen.queryByText('Preparing interactive answer…')).toBeNull();
    view.rerender(bubble(source+'later = TextContent("Ready")\n```'));
    await screen.findByText('Ready');
    expect(screen.getByText('Example total: $20')).toBeTruthy();
  });
  it('keeps partial Markdown visuals invisible until the program is complete', async () => {
    const source = '```openui\nroot = Stack([label])\nlabel = TextContent("Ready")';
    const view = render(<MarkdownBody interactive>{source}</MarkdownBody>, {wrapper:Wrapper});
    expect(screen.queryByText('Ready')).toBeNull();
    view.rerender(<MarkdownBody interactive>{source+'\n'}</MarkdownBody>);
    expect(screen.queryByText('Ready')).toBeNull();
    view.rerender(<MarkdownBody interactive>{source+'\n```'}</MarkdownBody>);
    await screen.findByText('Ready');
  });
  it('reveals completed controls together and preserves state through updates and themes', async () => {
    const view = render(<MarkdownBody interactive>{'```openui\n'+prefix}</MarkdownBody>, {wrapper:Wrapper});
    expect(screen.queryByRole('spinbutton')).toBeNull();
    view.rerender(<MarkdownBody interactive>{'```openui\n'+prefix+'later = TextContent("First snapshot")\n```'}</MarkdownBody>);
    const input = await screen.findByRole('spinbutton', {name:'Units'});
    await screen.findByText('First snapshot');
    expect((input as HTMLInputElement).disabled).toBe(false);
    fireEvent.change(input, {target:{value:'35'}});
    await screen.findByText('Example total: $70');
    view.rerender(<MarkdownBody interactive>{'```openui\n'+prefix+'later = TextContent("Complete update")\n```'}</MarkdownBody>);
    await screen.findByText('Complete update');
    expect(screen.getByRole('spinbutton', {name:'Units'})).toBe(input);
    fireEvent.click(screen.getByText('Toggle theme'));
    expect((input as HTMLInputElement).value).toBe('35');
    fireEvent.click(screen.getByRole('button', {name:'Reset'}));
    await screen.findByText('Example total: $20');
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('renders native tables, charts, and composed views', async () => {
    render(<InteractiveAnswer source={'root = Stack([chart, table, tabs])\nchart = BarChart(["A","B"], [Series("Units", [20,40])])\ntable = Table([Col("Name", ["A","B"]), Col("Units", [20,40], "number")])\ntabs = Tabs([TabItem("first","First",[TextContent("First view")]),TabItem("second","Second",[TextContent("Second view")])])'} />, {wrapper:Wrapper});
    await screen.findByRole('table');
    await screen.findByRole('tab', {name:'Second'});
    fireEvent.mouseDown(screen.getByRole('tab', {name:'Second'}),{button:0,ctrlKey:false});
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('keeps the same renderer and input mounted offscreen without resetting state or height', async () => {
    render(<InteractiveAnswer source={prefix+'later = TextContent("Done")'} />, {wrapper:Wrapper});
    const input = await screen.findByRole('spinbutton',{name:'Units'});
    fireEvent.change(input,{target:{value:'35'}});
    await screen.findByText('Example total: $70');
    await act(async () => {observers.forEach(notify=>notify(false));});
    expect(screen.getByRole('spinbutton')).toBe(input);
    expect(screen.getByTestId('interactive-answer').style.height).toBe('');
    expect(screen.getByTestId('interactive-answer').dataset.visible).toBe('false');
    await act(async () => {observers.forEach(notify=>notify(true));});
    await screen.findByText('Example total: $70');
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('35');
    expect(screen.getByRole('spinbutton')).toBe(input);
  });
  it('keeps old source readable without executing the retired framework', async () => {
    render(<InteractiveAnswer legacy source={'{"html":["<script>window.legacyExecuted=true</script>"]}'} />, {wrapper:Wrapper});
    expect(screen.getByText(/previous format/)).toBeTruthy();
    expect(screen.getByRole('button',{name:'Recreate interactive answer'})).toBeTruthy();
    expect((window as unknown as {legacyExecuted?: boolean}).legacyExecuted).toBeUndefined();
    expect(document.querySelector('iframe')).toBeNull();
  });
  it('reports malformed final interfaces without crashing the conversation', async () => {
    render(<InteractiveAnswer source={'root = MissingComponent("x")'} />, {wrapper:Wrapper});
    await waitFor(()=>expect(screen.getByRole('alert')).toBeTruthy());
  });
  it('opens a gallery image in the site preview dialog', async () => {
    render(<InteractiveAnswer source={'root = Stack([gallery])\ngallery = ImageGallery([{src:"https://example.com/photo.png",alt:"Warehouse",details:"Example photo"}])'} />, {wrapper:Wrapper});
    const button = await screen.findByRole('button',{name:'Open Warehouse'});
    fireEvent.click(button);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('heading',{name:'Warehouse'})).toBeTruthy();
  });
  it('keeps responsive nested layouts and modal actions bound to native state', async () => {
    const source = 'root = Stack([row, dialog])\n$open = false\n$qty = "10"\nrow = Stack([field, open], "row", "m", "start", "between", false)\nfield = FormControl("Units", Input("qty", "Units", "number", {min:0}, $qty))\nopen = Button("Open details", Action([@Set($open, true)]), "secondary")\ndialog = Modal("Details", $open, [field, total, close], "lg")\ntotal = TextContent("Units in dialog: " + $qty)\nclose = Button("Close details", Action([@Set($open, false)]), "secondary")';
    const view=render(<InteractiveAnswer source={source}/>, {wrapper:Wrapper});
    const input=await screen.findByRole('spinbutton',{name:'Units'});
    fireEvent.change(input,{target:{value:'35'}});
    fireEvent.click(screen.getByRole('button',{name:'Open details'}));
    expect(screen.getByRole('dialog').classList.contains('openui-answer')).toBe(true);
    await screen.findByText('Units in dialog: 35');
    fireEvent.click(screen.getByText('Toggle theme'));
    expect(screen.getByText('Units in dialog: 35')).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Close details'}));
    await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
    view.rerender(<InteractiveAnswer source={source+'\n'}/>);
    expect(screen.getByRole('spinbutton',{name:'Units'})).toBe(input);
    expect((input as HTMLInputElement).value).toBe('35');
    expect(document.querySelector('.openui-layout[data-direction="row"]')).toBeTruthy();
  });
  it('keeps a range calendar accessible and retains its selection after closing', async () => {
    render(<InteractiveAnswer source={'root = Stack([field])\nfield = FormControl("Delivery date", DatePicker("delivery", "range"))'}/>, {wrapper:Wrapper});
    fireEvent.click(await screen.findByRole('button',{name:'Delivery date'}));
    const dialog=screen.getByRole('dialog');
    const days=dialog.querySelectorAll<HTMLButtonElement>('.openui-calendar-range-day-button:not([disabled])');
    expect(days.length).toBeGreaterThan(14);
    fireEvent.click(days[10]);fireEvent.click(days[14]);
    fireEvent.click(screen.getByRole('button',{name:'Done'}));
    await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('button',{name:'Delivery date'}).textContent).not.toBe('Select date');
    fireEvent.click(screen.getByRole('button',{name:'Delivery date'}));
    expect(screen.getByRole('heading',{name:'Select date range'})).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  }, 15_000);
  it.each(['root = Stack([])', 'root = Stack([missing])'])('shows an empty or incomplete final program instead of an endless loader: %s', async source => {
    const view = render(<InteractiveAnswer source={source} complete={false}/>, {wrapper:Wrapper});
    await screen.findByTestId('interactive-answer');
    view.rerender(<InteractiveAnswer source={source} complete/>);
    await screen.findByRole('alert');
    expect(screen.queryByText('Preparing interactive answer…')).toBeNull();
  });
});
