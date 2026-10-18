import fs from "node:fs";
import {
  findWHOXOSConfigKeyWarnings,
  whoxosConfigSchema,
  type WHOXOSConfig,
} from "@whoxos/shared";
import { ZodError } from "zod";
import { resolveWHOXOSConfigPath } from "./paths.js";

function formatConfigValidationError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const issuePath = issue.path.length > 0 ? issue.path.join(".") : "<root>";
      return `${issuePath}: ${issue.message}`;
    })
    .join("; ");
}

export function readConfigFile(): WHOXOSConfig | null {
  const configPath = resolveWHOXOSConfigPath();

  if (!fs.existsSync(configPath)) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid WHOXOS config at ${configPath}: failed to read or parse JSON: ${reason}`);
  }

  try {
    const config = whoxosConfigSchema.parse(raw);
    for (const warning of findWHOXOSConfigKeyWarnings(config)) {
      console.warn(
        `Unknown config key ${warning.path}; did you mean ${warning.suggestion}? It will be preserved.`,
      );
    }
    return config;
  } catch (error) {
    if (error instanceof ZodError) {
      throw new Error(`Invalid WHOXOS config at ${configPath}: ${formatConfigValidationError(error)}`);
    }

    throw error;
  }
}
