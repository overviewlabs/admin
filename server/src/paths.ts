import fs from "node:fs";
import path from "node:path";
import { resolveDefaultConfigPath } from "./home-paths.js";

const WHOXOS_CONFIG_BASENAME = "config.json";
const WHOXOS_ENV_FILENAME = ".env";

function findConfigFileFromAncestors(startDir: string): string | null {
  const absoluteStartDir = path.resolve(startDir);
  let currentDir = absoluteStartDir;

  while (true) {
    const candidate = path.resolve(currentDir, ".whoxos", WHOXOS_CONFIG_BASENAME);
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    const nextDir = path.resolve(currentDir, "..");
    if (nextDir === currentDir) break;
    currentDir = nextDir;
  }

  return null;
}

export function resolveWHOXOSConfigPath(overridePath?: string): string {
  if (overridePath) return path.resolve(overridePath);
  if (process.env.WHOXOS_CONFIG) return path.resolve(process.env.WHOXOS_CONFIG);
  return findConfigFileFromAncestors(process.cwd()) ?? resolveDefaultConfigPath();
}

export function resolveWHOXOSEnvPath(overrideConfigPath?: string): string {
  return path.resolve(path.dirname(resolveWHOXOSConfigPath(overrideConfigPath)), WHOXOS_ENV_FILENAME);
}
