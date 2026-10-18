import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
const guard = vi.hoisted(() => vi.fn());
vi.mock("../routes/authz.js", () => ({ assertInstanceAdmin: guard }));
vi.mock("../services/server-monitor.js", () => ({ getServerMonitor: vi.fn() }));
import { serverMonitorRoutes } from "../routes/server-monitor.js";
function app(userId: string | null = "owner") {
 const app = express();
 app.use((req, _res, next) => { Object.assign(req, { actor: { type: "board", userId } }); next(); });
 app.use(serverMonitorRoutes({} as never));
 app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(403).json({ error: error.message }));
 return app;
}
describe("Admin portal gateway", () => {
 it("checks server administrator access without requiring an organization", async () => {
  guard.mockReturnValue(undefined);
  const response = await request(app()).get("/instance/admin-portal/authorize");
  expect(response.status).toBe(204);
  expect(response.headers['remote-user']).toBe('owner');
  expect(guard).toHaveBeenLastCalledWith(expect.objectContaining({ actor: { type: "board", userId: "owner" } }));
 });
 it("requires a signed-in human even when a local administrator guard succeeds", async () => {
  guard.mockReturnValue(undefined);
  const response = await request(app(null)).get("/instance/admin-portal/authorize");
  expect(response.status).toBe(403);
  expect(response.headers['remote-user']).toBeUndefined();
 });
 it("does not grant a portal identity when access is denied", async () => {
  guard.mockImplementationOnce(() => { throw new Error('Denied'); });
  const response = await request(app()).get("/instance/admin-portal/authorize");
  expect(response.status).toBe(403);
  expect(response.headers['remote-user']).toBeUndefined();
 });
 it.each([['POST', undefined,403],['POST','https://evil.test',403],['GET','https://evil.test',403],['POST','https://overviewlabs.ai',204]])('checks forwarded mutation origins %s %s', async (method, origin, status) => {
  guard.mockReturnValue(undefined);
  let req=request(app()).get('/instance/admin-portal/authorize').set('X-Forwarded-Method',method!);
  if(origin)req=req.set('Origin',origin);
  expect((await req).status).toBe(status);
 });
});
