import { Writable } from "node:stream";
import express from "express";
import pino from "pino";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { HTTP_LOG_REDACT_PATHS } from "../middleware/http-log-redaction.js";
import { createHttpLogger } from "../middleware/logger.js";

describe("private transfer HTTP logging", () => {
  it.each(
    ["private-definition-qualification", "private-history-transfer", "private-worker-transfer", "private-quote-transfer", "private-future/rejected"].flatMap(endpoint =>
      [200, 403, 500].flatMap(status =>
        [false, true].flatMap(mounted => [false, true].map(raw => ({ endpoint, status, mounted, raw }))),
      ),
    ),
  )("omits $endpoint contents (status=$status mounted=$mounted raw=$raw)", async ({ endpoint, status, mounted, raw }) => {
    const canary = "private-transfer-payload-canary";
    const chunks: string[] = [];
    const stream = new Writable({ write(chunk, _encoding, done) { chunks.push(chunk.toString()); done(); } });
    const app = express();
    const routes = express.Router();
    const logger = createHttpLogger(pino({ redact: [...HTTP_LOG_REDACT_PATHS] }, stream));
    if (mounted) routes.use(logger);
    else app.use(logger);
    app.use(raw ? express.raw({ type: "*/*" }) : express.json());
    routes.use((req, res) => {
      res.setHeader("x-provider-reply", canary);
      if (status >= 400) {
        (res as any).__errorContext = { error: { message: canary }, reqBody: req.body, reqParams: { text: canary } };
        (res as any).err = new Error(`Provider echoed ${canary}`);
      }
      res.status(status).end();
    });
    app.use("/api", routes);
    // PATCH deliberately exercises rejection logging independent of route method.
    const response = await request(app).patch(`/api/tool-connections/${canary}/${endpoint}/`)
      .query({ payload: canary }).set("x-whoxos-tool-gateway-token", canary)
      .set("x-arbitrary-private-header", canary).send({ envelope: canary });
    expect(response.status).toBe(status);
    const output = chunks.join("");
    expect(output).not.toContain(canary);
    const log = JSON.parse(output.trim());
    expect(log.req).toEqual({ id: expect.any(Number), method: "PATCH", url: "/api/tool-connections/:connectionId/private-transfer" });
    expect(log.res).toEqual({ statusCode: status });
    expect(log.responseTime).toEqual(expect.any(Number));
    if (status >= 400) {
      expect(log.reqBody).toBe("[REDACTED]");
      expect(log.errorContext).toEqual({ name: "Error" });
      expect(log.err.message).toBe("Private tool transfer failed");
      expect(log.err.stack).toBe("");
    }
  });

  it("redacts gateway bearer headers on ordinary routes too", async () => {
    const chunks: string[] = [];
    const stream = new Writable({ write(chunk, _encoding, done) { chunks.push(chunk.toString()); done(); } });
    const app = express();
    app.use(createHttpLogger(pino({ redact: [...HTTP_LOG_REDACT_PATHS] }, stream)));
    app.use((_req, res) => res.status(404).end());
    await request(app).get("/api/not-a-route").set("x-whoxos-tool-gateway-token", "gateway-secret-canary")
      .set("x-whox-tool-gateway-token", "gateway-secret-canary");
    expect(chunks.join("")).not.toContain("gateway-secret-canary");
    const log = JSON.parse(chunks.join("").trim());
    expect(log.req.headers["x-whoxos-tool-gateway-token"]).toBe("[Redacted]");
    expect(log.req.headers["x-whox-tool-gateway-token"]).toBe("[Redacted]");
  });
});
