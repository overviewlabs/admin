import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

// Use a dedicated port so e2e tests always start their own server in local_trusted mode,
// even when the dev server is running on :3100 in authenticated mode.
const PORT = Number(process.env.WHOXOS_E2E_PORT ?? 3199);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const WHOXOS_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "whoxos-e2e-home-"));
const WHOXOS_INSTANCE_ID = "playwright-e2e";
const WHOXOS_CONFIG = path.join(WHOXOS_HOME, "instances", WHOXOS_INSTANCE_ID, "config.json");
const WHOXOS_AGENT_JWT_SECRET = process.env.WHOXOS_AGENT_JWT_SECRET ?? "playwright-e2e-agent-jwt-secret";
const WHOXOS_DECISION_SIGNING_SECRET =
  process.env.WHOXOS_DECISION_SIGNING_SECRET ?? "playwright-e2e-decision-signing-secret";
const WHOXOS_TOOL_ACTION_SIGNING_SECRET =
  process.env.WHOXOS_TOOL_ACTION_SIGNING_SECRET ?? "playwright-e2e-tool-action-signing-secret";
const PLAYWRIGHT_CHANNEL = process.env.WHOXOS_PLAYWRIGHT_CHANNEL;

process.env.WHOXOS_HOME = WHOXOS_HOME;
process.env.WHOXOS_CONFIG = WHOXOS_CONFIG;
// Worker processes reload this config; retain the main process's server path
// for specs that seed historical database state in the throwaway instance.
process.env.WHOXOS_E2E_SERVER_CONFIG ??= WHOXOS_CONFIG;
// Specs that mint agent JWTs in-process (via createLocalAgentJwt) must derive
// the same per-instance signing key as the webServer, or verification fails
// with a 401 instead of authenticating as the agent.
process.env.WHOXOS_INSTANCE_ID = WHOXOS_INSTANCE_ID;
process.env.WHOXOS_AGENT_JWT_SECRET = WHOXOS_AGENT_JWT_SECRET;
process.env.WHOXOS_DECISION_SIGNING_SECRET = WHOXOS_DECISION_SIGNING_SECRET;
process.env.WHOXOS_TOOL_ACTION_SIGNING_SECRET = WHOXOS_TOOL_ACTION_SIGNING_SECRET;

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  // These suites target dedicated multi-user configurations/ports and are
  // intentionally not part of the default local_trusted e2e run.
  testIgnore: ["in-feed-native/**", "multi-user.spec.ts", "multi-user-authenticated.spec.ts"],
  timeout: 60_000,
  retries: 0,
  // All specs share one throwaway server, and several toggle instance-level
  // state (the `enableConferenceRoomChat` experimental flag) that changes
  // which UI variant renders. Run files serially so a flag flip in one spec
  // can't change the wizard/thread under another spec mid-flight.
  workers: 1,
  use: {
    baseURL: BASE_URL,
    headless: true,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        ...(PLAYWRIGHT_CHANNEL ? { channel: PLAYWRIGHT_CHANNEL } : {}),
      },
    },
  ],
  // The webServer directive bootstraps a throwaway instance and then starts it.
  // `onboard --yes --run` works in a non-interactive temp WHOXOS_HOME.
  webServer: {
    command: `pnpm whoxos onboard --yes --run`,
    url: `${BASE_URL}/api/health`,
    // Always boot a dedicated throwaway instance for e2e so browser tests
    // never attach to the developer's active WHOXOS home/server.
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      NODE_ENV: "test",
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${path.resolve(import.meta.dirname, "fixtures/agent-chat-github.mjs")}`,
      PORT: String(PORT),
      WHOXOS_OPEN_ON_LISTEN: "false",
      WHOXOS_API_URL: BASE_URL,
      WHOXOS_HOME,
      WHOXOS_INSTANCE_ID,
      WHOXOS_CONFIG,
      WHOXOS_AGENT_JWT_SECRET,
      WHOXOS_DECISION_SIGNING_SECRET,
      WHOXOS_TOOL_ACTION_SIGNING_SECRET,
      WHOXOS_BIND: "loopback",
      WHOXOS_DEPLOYMENT_MODE: "local_trusted",
      WHOXOS_DEPLOYMENT_EXPOSURE: "private",
    },
  },
  outputDir: "./test-results",
  reporter: [["list"], ["html", { open: "never", outputFolder: "./playwright-report" }]],
});
