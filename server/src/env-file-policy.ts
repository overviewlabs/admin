export function shouldLoadWorkingDirectoryEnv(input: {
  cwdEnvExists: boolean;
  isWHOXOSEnvFile: boolean;
  env?: NodeJS.ProcessEnv;
}): boolean {
  const env = input.env ?? process.env;
  return env.WHOXOS_DISABLE_CWD_ENV_FILE !== "true"
    && input.cwdEnvExists
    && !input.isWHOXOSEnvFile;
}
