import { describe, expect, it } from "vitest";
import { currentActivityLabel } from "./current-activity";
import type { TaskChatItem, TaskChatToolItem } from "./task-chat-model";
const tool = (name: string, status: TaskChatToolItem['status'] = 'in_progress'): TaskChatToolItem => ({id:name,kind:'tool',name,status});
describe('execution-based current activity', () => {
  it('uses neutral fallback without evidence', () => {
    expect(currentActivityLabel([])).toBe('Working');
    expect(currentActivityLabel([], 'Waiting to start')).toBe('Waiting to start');
  });
  it.each(['completed','failed','interrupted'] as const)('clears a %s tool without reviving older thinking', status => {
    expect(currentActivityLabel([{id:'r',kind:'thinking',lines:[],streaming:true},tool('web_search',status)])).toBe('Working');
  });
  it('follows search, reading, response and reasoning lifecycles', () => {
    expect(currentActivityLabel([tool('web_search')])).toBe('Searching the web');
    expect(currentActivityLabel([tool('read')])).toBe('Reading a file');
    expect(currentActivityLabel([tool('bash')])).toBe('Running a command');
    expect(currentActivityLabel([tool('web_search','completed'),{id:'m',kind:'message',author:'agent',text:'Answer',streaming:true}])).toBe('Responding');
    expect(currentActivityLabel([{id:'r',kind:'thinking',lines:[],streaming:true}])).toBe('Thinking');
  });
  it('keeps a concurrent active call after another finishes', () => {
    expect(currentActivityLabel([tool('web_search'),tool('read','completed')])).toBe('Searching the web');
  });
  it('uses the latest lifecycle update for the same call', () => {
    expect(currentActivityLabel([tool('web_search'),tool('web_search','completed')])).toBe('Working');
  });
  it('shows pending user actions', () => {
    expect(currentActivityLabel([tool('ask_user','pending')])).toBe('Waiting for your answer');
    expect(currentActivityLabel([tool('bash','pending')])).toBe('Waiting for approval');
  });
  it('handles provider activity groups', () => {
    const items: TaskChatItem[] = [{id:'phase',kind:'activity_phase',items:[tool('web_search')],active:true,summary:'Searching'}];
    expect(currentActivityLabel(items)).toBe('Searching the web');
  });
});
