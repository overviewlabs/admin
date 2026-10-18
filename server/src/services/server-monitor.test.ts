import express, { type Request } from "express";
import request from "supertest";
import { describe, it, expect, vi, afterEach } from "vitest";
import type { Db } from "@whoxos/db";
import { cpuUsage, collectServerMonitor, hasBlockMount } from "./server-monitor.js";
import * as root from "./production-root.js";
import { serverMonitorRoutes } from "../routes/server-monitor.js";
import { errorHandler } from "../middleware/error-handler.js";
afterEach(() => vi.restoreAllMocks());
describe("server monitor", () => {
  it("does not mistake an unmounted directory for block storage", () => {
    expect(hasBlockMount("1 0 8:1 / / rw - ext4 /dev/sdb1 rw")).toBe(false);
    expect(hasBlockMount("2 1 8:0 / /.WHOX rw - ext4 /dev/sda rw")).toBe(true);
  });
  it("computes interval CPU usage including idle samples", () => {
    expect(cpuUsage({idle: 10,total: 20},{idle: 30,total: 100})).toBe(75);
    expect(cpuUsage({idle: 10,total: 20},{idle: 10,total: 20})).toBe(0);
  });
  it("collects finite host metrics without process arguments or environments", async () => {
    const value = await collectServerMonitor();
    expect(value.cpu.cores).toBeGreaterThan(0);
    expect(value.memory.totalBytes).toBeGreaterThan(0);
    expect(value.uptimeSeconds).toBeGreaterThan(0);
    expect(value.services.every(s => Object.keys(s).sort().join() === "load,name,scope,state,subState")).toBe(true);
    expect(value.cpu.percent).toBeGreaterThanOrEqual(0);
    expect(value.cpu.percent).toBeLessThanOrEqual(100);
  });
  it("rejects other organizations before collecting host metrics", async () => {
    const app = express();
    app.use((req, _res, next) => { req.actor = {type: "board", userId: "owner", isInstanceAdmin: true, companyIds: ["other"]} as Request["actor"]; next(); });
    app.use(serverMonitorRoutes({} as Db)); app.use(errorHandler);
    expect((await request(app).get("/companies/other/monitor")).status).toBe(403);
  });
  it("requires the manager authorization check and disables HTTP caching", async () => {
    const auth = vi.spyOn(root, "assertProductionRootManager").mockResolvedValue(undefined);
    const app = express(); app.use(serverMonitorRoutes({} as Db));
    const response = await request(app).get(`/companies/${root.PRODUCTION_ROOT_COMPANY_ID}/monitor`);
    expect(auth).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
  });
});
