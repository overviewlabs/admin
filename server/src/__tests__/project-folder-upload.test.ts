import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { receiveProjectFolder } from "../services/project-folder-upload.js";
import { validateProjectUploadPaths, skipProjectUploadPath } from "@whoxos/shared/project-folder-upload";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "project-upload-test-"));
  roots.push(root);
  const app = express();
  app.post("/upload", async (req, res, next) => {
    try { const received = await receiveProjectFolder(req, res, root); res.json(received); }
    catch (error) { next(error); }
  });
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(422).json({ error: error.message }));
  return { app, root };
}
describe("project folder import", () => {
  it.each(["../escape", "/absolute", "a/../../escape", "a\\escape", "a//b", "a/./b", "a\u0000b", "C:/file", ".git/config", "node_modules/x"])("rejects unsafe or excluded path %s", value => {
    expect(() => validateProjectUploadPaths([value])).toThrow();
  });
  it("rejects collisions and file/directory conflicts", () => {
    expect(() => validateProjectUploadPaths(["Src/a", "src/A"])).toThrow();
    expect(() => validateProjectUploadPaths(["src/a", "src"])).toThrow();
    expect(skipProjectUploadPath("src/node_modules/pkg/index.js")).toBe(true);
  });
  it("preserves nested paths, unicode, empty and binary files", async () => {
    const { app } = await fixture();
    const binary = Buffer.from([0, 255, 128, 10]);
    const response = await request(app).post("/upload").field("name", "Example").field("paths", JSON.stringify(["src/日本語.bin", "empty.txt"]))
      .attach("files", binary, "blob.bin").attach("files", Buffer.alloc(0), "empty.txt");
    expect(response.status).toBe(200);
    expect(response.body.fileCount).toBe(2);
    expect(response.body.totalBytes).toBe(4);
    expect(await readFile(path.join(response.body.content, "src/日本語.bin"))).toEqual(binary);
    expect(await readFile(path.join(response.body.content, "empty.txt"))).toHaveLength(0);
  });
  it("cleans staged files on an incomplete manifest", async () => {
    const { app, root } = await fixture();
    const response = await request(app).post("/upload").field("name", "Example").field("paths", '["a","b"]').attach("files", Buffer.from("x"), "a");
    expect(response.status).toBe(422);
    expect(await readdir(root)).toEqual([]);
  });
  it("rejects oversized files and cleans staging", async () => {
    const { app, root } = await fixture();
    const response = await request(app).post("/upload").field("name", "Example").field("paths", '["a"]').attach("files", Buffer.alloc(25 * 1024 * 1024 + 1), "a");
    expect(response.status).toBe(422);
    expect(await readdir(root)).toEqual([]);
  });
  it("enforces aggregate size across files", async () => {
    const { app, root } = await fixture();
    let req = request(app).post("/upload").field("name", "Example").field("paths", JSON.stringify(["a", "b", "c", "d", "e"]));
    for (const name of ["a", "b", "c", "d", "e"]) req = req.attach("files", Buffer.alloc(21 * 1024 * 1024), name);
    expect((await req).status).toBe(422);
    expect(await readdir(root)).toEqual([]);
  });
});
