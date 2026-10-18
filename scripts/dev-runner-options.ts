import path from "node:path";
import {
  DEFAULT_WHOXOS_INSTANCE_ID,
  expandHomePrefix,
  resolveWHOXOSConfigPathForInstance,
  resolveWHOXOSInstanceId,
} from "../packages/shared/src/home-paths.ts";

export interface AppliedDevRunnerOptions {
  forwardedArgs: string[];
  dataDir: string | null;
}

function requireOptionValue(
  args: string[],
  index: number,
  option: string,
): string {
  const value = args[index + 1]?.trim();
  if (!value || value.startsWith("-")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

export function applyDevRunnerOptions(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): AppliedDevRunnerOptions {
  const forwardedArgs: string[] = [];
  let dataDirRaw: string | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--data-dir" || arg === "-d") {
      dataDirRaw = requireOptionValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--data-dir=")) {
      const value = arg.slice("--data-dir=".length).trim();
      if (!value) throw new Error("--data-dir requires a value");
      dataDirRaw = value;
      continue;
    }
    forwardedArgs.push(arg);
  }

  if (!dataDirRaw) {
    return { forwardedArgs, dataDir: null };
  }

  const dataDir = path.resolve(cwd, expandHomePrefix(dataDirRaw));
  const hasExplicitConfig = Boolean(env.WHOXOS_CONFIG?.trim());
  const hasExplicitContext = Boolean(env.WHOXOS_CONTEXT?.trim());

  env.WHOXOS_HOME = dataDir;
  if (!hasExplicitConfig) {
    const instanceId = resolveWHOXOSInstanceId(
      env.WHOXOS_INSTANCE_ID ?? DEFAULT_WHOXOS_INSTANCE_ID,
    );
    env.WHOXOS_INSTANCE_ID = instanceId;
    env.WHOXOS_CONFIG = resolveWHOXOSConfigPathForInstance({
      homeDir: dataDir,
      instanceId,
    });
  }
  if (!hasExplicitContext) {
    env.WHOXOS_CONTEXT = path.resolve(dataDir, "context.json");
  }

  return { forwardedArgs, dataDir };
}
