/** Folder-import contract shared by the browser and server. */
export const PROJECT_FOLDER_LIMITS = { files: 2000, fileBytes: 25 * 1024 * 1024, totalBytes: 100 * 1024 * 1024 } as const;
const excluded = new Set([".git", "node_modules", ".venv", "venv", "__pycache__", ".DS_Store"]);
export function skipProjectUploadPath(value: string): boolean {
  return value.split("/").some(part => excluded.has(part));
}
export function validateProjectUploadPaths(paths: unknown): string[] {
  if (!Array.isArray(paths) || !paths.length || paths.length > PROJECT_FOLDER_LIMITS.files) throw new Error("Choose a folder with 1–2,000 files.");
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of paths) {
    if (typeof value !== "string" || value.length > 1024 || /[\\\x00-\x1f\x7f:]/.test(value)) throw new Error("The folder contains an invalid file path.");
    const parts = value.split("/");
    if (parts.length > 32 || parts.some(part => !part || part === "." || part === ".." || part.length > 255) || skipProjectUploadPath(value)) throw new Error("The folder contains an unsupported file path.");
    const key = value.normalize("NFC").toLowerCase();
    if (seen.has(key)) throw new Error("The folder contains duplicate file paths (including case differences).");
    seen.add(key);
    result.push(value);
  }
  for (const key of seen) {
    const parts = key.split("/");
    for (let i = 1; i < parts.length; i++) if (seen.has(parts.slice(0, i).join("/"))) throw new Error("A file conflicts with a folder of the same name.");
  }
  return result;
}
