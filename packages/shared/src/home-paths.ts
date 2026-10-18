import os from "node:os";
import path from "node:path";

export const DEFAULT_WHOXOS_INSTANCE_ID = "default";
export const WHOXOS_CONFIG_BASENAME = "config.json";
export const WHOXOS_ENV_FILENAME = ".env";

const PATH_SEGMENT_RE = /^[a-zA-Z0-9_-]+$/;

export function expandHomePrefix(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.resolve(os.homedir(), value.slice(2));
  return value;
}

export function resolveWHOXOSHomeDir(homeOverride?: string): string {
  const raw = homeOverride?.trim() || process.env.WHOXOS_HOME?.trim();
  if (raw) return path.resolve(expandHomePrefix(raw));
  return path.resolve(os.homedir(), ".whoxos");
}

export function resolveWHOXOSInstanceId(instanceIdOverride?: string): string {
  const raw = instanceIdOverride?.trim() || process.env.WHOXOS_INSTANCE_ID?.trim() || DEFAULT_WHOXOS_INSTANCE_ID;
  if (!PATH_SEGMENT_RE.test(raw)) {
    throw new Error(`Invalid WHOXOS_INSTANCE_ID '${raw}'.`);
  }
  return raw;
}

export function resolveWHOXOSInstanceRoot(input: {
  homeDir?: string;
  instanceId?: string;
} = {}): string {
  return path.resolve(resolveWHOXOSHomeDir(input.homeDir), "instances", resolveWHOXOSInstanceId(input.instanceId));
}

export function resolveWHOXOSInstanceConfigPath(input: {
  homeDir?: string;
  instanceId?: string;
} = {}): string {
  return path.resolve(resolveWHOXOSInstanceRoot(input), WHOXOS_CONFIG_BASENAME);
}

export function resolveWHOXOSConfigPathForInstance(input: {
  homeDir?: string;
  instanceId?: string;
} = {}): string {
  return resolveWHOXOSInstanceConfigPath(input);
}

export function resolveWHOXOSEnvPathForConfig(configPath: string): string {
  return path.resolve(path.dirname(configPath), WHOXOS_ENV_FILENAME);
}

export function resolveDefaultEmbeddedPostgresDir(input: {
  homeDir?: string;
  instanceId?: string;
} = {}): string {
  return path.resolve(resolveWHOXOSInstanceRoot(input), "db");
}

export function resolveDefaultLogsDir(input: {
  homeDir?: string;
  instanceId?: string;
} = {}): string {
  return path.resolve(resolveWHOXOSInstanceRoot(input), "logs");
}

export function resolveDefaultSecretsKeyFilePath(input: {
  homeDir?: string;
  instanceId?: string;
} = {}): string {
  return path.resolve(resolveWHOXOSInstanceRoot(input), "secrets", "master.key");
}

export function resolveDefaultStorageDir(input: {
  homeDir?: string;
  instanceId?: string;
} = {}): string {
  return path.resolve(resolveWHOXOSInstanceRoot(input), "data", "storage");
}

export function resolveDefaultBackupDir(input: {
  homeDir?: string;
  instanceId?: string;
} = {}): string {
  return path.resolve(resolveWHOXOSInstanceRoot(input), "data", "backups");
}

export function resolveHomeAwarePath(value: string): string {
  return path.resolve(expandHomePrefix(value));
}
