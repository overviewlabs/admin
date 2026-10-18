import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rm, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import multer from "multer";
import type { Request, Response } from "express";
import { PROJECT_FOLDER_LIMITS, validateProjectUploadPaths } from "@whoxos/shared/project-folder-upload";
import { unprocessable } from "../errors.js";

/** Stream to private staging files, with one aggregate limit across the multipart body. */
export async function receiveProjectFolder(req: Request, res: Response, parent: string) {
  await mkdir(parent, { recursive: true, mode: 0o750 });
  const staging = await mkdtemp(path.join(parent, ".upload-"));
  let total = 0;
  const storage: multer.StorageEngine = {
    _handleFile(_req, file, callback) {
      const target = path.join(staging, randomUUID());
      let size = 0;
      const counter = new Transform({ transform(chunk, _encoding, next) {
        total += chunk.length;
        size += chunk.length;
        next(total > PROJECT_FOLDER_LIMITS.totalBytes ? unprocessable("Folder exceeds the 100 MiB upload limit.") : null, chunk);
      } });
      pipeline(file.stream, counter, createWriteStream(target, { flags: "wx", mode: 0o640 }))
        .then(() => callback(null, { path: target, size }), error => callback(error));
    },
    _removeFile(_req, file, callback) { rm(file.path, { force: true }).then(() => callback(null), callback); },
  };
  try {
    const upload = multer({ storage, limits: { files: PROJECT_FOLDER_LIMITS.files, fileSize: PROJECT_FOLDER_LIMITS.fileBytes, fields: 2, fieldSize: 1024 * 1024, parts: PROJECT_FOLDER_LIMITS.files + 2 } }).array("files", PROJECT_FOLDER_LIMITS.files);
    await new Promise<void>((resolve, reject) => upload(req, res, error => error ? reject(error) : resolve()));
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    if (!name || name.length > 200) throw unprocessable("Enter a project name of 1–200 characters.");
    let paths: string[];
    try { paths = validateProjectUploadPaths(JSON.parse(req.body.paths)); }
    catch (error) { throw unprocessable(error instanceof SyntaxError ? "Invalid folder manifest." : (error as Error).message); }
    const files = req.files as Express.Multer.File[];
    if (!files || files.length !== paths.length) throw unprocessable("Folder upload is incomplete. Please choose the folder again.");
    const content = path.join(staging, "content");
    await mkdir(content, { mode: 0o750 });
    for (let i = 0; i < files.length; i++) {
      const destination = path.join(content, paths[i]!);
      await mkdir(path.dirname(destination), { recursive: true, mode: 0o750 });
      await rename(files[i]!.path, destination);
    }
    return { staging, content, name, fileCount: files.length, totalBytes: total };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    if (error instanceof multer.MulterError) throw unprocessable(error.code === "LIMIT_FILE_SIZE" ? "Each file must be 25 MiB or smaller." : "Folder upload exceeds the supported limits (2,000 files, 100 MiB total).");
    throw error;
  }
}
