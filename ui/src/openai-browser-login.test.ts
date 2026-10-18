import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
const state=vi.hoisted(()=>({ children: [] as any[], spawn: vi.fn() }));
vi.mock("node:child_process",()=>({spawn:state.spawn}));
vi.mock("@whoxos/adapter-codex-local/server",async()=>await import("../../packages/adapters/codex-local/src/server/device-login-parse"));
import {startOpenAiBrowserLogin,stopOpenAiBrowserLogin,openAiBrowserLoginState} from "../../server/src/services/openai-browser-login";
beforeEach(()=>{vi.stubEnv("OVERVIEW_OPENAI_BROWSER_LOGIN","true");state.children=[];state.spawn.mockReset();state.spawn.mockImplementation(()=>{const child=new EventEmitter() as any;child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=vi.fn();child.exitCode=null;state.children.push(child);return child;});vi.useFakeTimers();});
afterEach(()=>{for(let i=0;i<10;i++)stopOpenAiBrowserLogin(`session-${i}`);vi.useRealTimers();vi.unstubAllEnvs();});
const prompt="https://auth.openai.com/codex/device\nEnter this one-time code:\nABCD-EFGHI\n";
describe("browser OpenAI login",()=>{
 it("runs only a fixed login command with an isolated credential home",async()=>{
  const result=startOpenAiBrowserLogin("session-0","/tmp/isolated-login");state.children[0].stdout.emit("data",Buffer.from(prompt));
  expect(await result).toEqual({deviceUrl:"https://auth.openai.com/codex/device",deviceCode:"ABCD-EFGHI",browserError:undefined});
  const [binary,args,options]=state.spawn.mock.calls[0];expect(binary).toBe("/usr/local/bin/codex");expect(args).toEqual(["-c",'cli_auth_credentials_store="file"',"login","--device-auth"]);expect(options.env.CODEX_HOME).toBe("/tmp/isolated-login");expect(options.env.DATABASE_URL).toBeUndefined();expect(options.shell).toBeUndefined();
  await startOpenAiBrowserLogin("session-0","/tmp/isolated-login");expect(state.spawn).toHaveBeenCalledTimes(1);
 });
 it("rejects a login URL on any other origin and times out",async()=>{
  const result=startOpenAiBrowserLogin("session-0","/tmp/a");state.children[0].stdout.emit("data",Buffer.from(prompt.replace('auth.openai.com','evil.example')));await vi.advanceTimersByTimeAsync(20000);expect((await result).deviceUrl).toBeUndefined();expect(openAiBrowserLoginState('session-0').browserError).toContain('did not return');expect(state.children[0].kill).toHaveBeenCalledWith('SIGTERM');
 });
 it("does not expose raw process errors or credential-like output",async()=>{
  const result=startOpenAiBrowserLogin("session-0","/tmp/a");state.children[0].emit('error',new Error('sensitive-value'));expect(JSON.stringify(await result)).not.toContain('sensitive-value');
 });
 it("is disabled by default",async()=>{vi.stubEnv('OVERVIEW_OPENAI_BROWSER_LOGIN','');await expect(startOpenAiBrowserLogin('session-0','/tmp/a')).rejects.toThrow('disabled');expect(state.spawn).not.toHaveBeenCalled();});
 it("cancels and removes the attempt",async()=>{const result=startOpenAiBrowserLogin('session-0','/tmp/a');state.children[0].stdout.emit('data',Buffer.from(prompt));await result;stopOpenAiBrowserLogin('session-0');expect(state.children[0].kill).toHaveBeenCalledWith('SIGTERM');expect(openAiBrowserLoginState('session-0').deviceCode).toBeUndefined();});
});
