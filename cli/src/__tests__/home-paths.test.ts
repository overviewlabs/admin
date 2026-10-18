import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  describeLocalInstancePaths,
  expandHomePrefix,
  resolveWHOXOSHomeDir,
  resolveWHOXOSInstanceId,
} from "../config/home.js";

const ORIGINAL_ENV = { ...process.env };

describe("home path resolution", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("defaults to ~/.whoxos and default instance", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "whoxos-home-paths-"));
    process.env.WHOXOS_HOME = home;
    delete process.env.WHOXOS_INSTANCE_ID;

    const paths = describeLocalInstancePaths();
    expect(paths.homeDir).toBe(home);
    expect(paths.instanceId).toBe("default");
    expect(paths.configPath).toBe(path.resolve(home, "instances", "default", "config.json"));
  });

  it("supports WHOXOS_HOME and explicit instance ids", () => {
    process.env.WHOXOS_HOME = "~/whoxos-home";

    const home = resolveWHOXOSHomeDir();
    expect(home).toBe(path.resolve(os.homedir(), "whoxos-home"));
    expect(resolveWHOXOSInstanceId("dev_1")).toBe("dev_1");
  });

  it("rejects invalid instance ids", () => {
    expect(() => resolveWHOXOSInstanceId("bad/id")).toThrow(/Invalid WHOXOS_INSTANCE_ID/);
  });

  it("expands ~ prefixes", () => {
    expect(expandHomePrefix("~")).toBe(os.homedir());
    expect(expandHomePrefix("~/x/y")).toBe(path.resolve(os.homedir(), "x/y"));
  });
});
