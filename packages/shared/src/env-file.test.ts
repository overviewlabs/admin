import { describe, expect, it } from "vitest";
import { encodeEnvValue, updateEnvFileContents } from "./env-file.js";

describe("env file editor", () => {
  it("pins minimal and JSON value encoding", () => {
    expect(encodeEnvValue("plain-value", "minimal")).toBe("plain-value");
    expect(encodeEnvValue("#439edb", "minimal")).toBe('"#439edb"');
    expect(encodeEnvValue("plain-value", "json")).toBe('"plain-value"');
  });

  it("preserves unrelated content and CRLF while updating every stale duplicate", () => {
    const original = [
      "# operator comment",
      "UNKNOWN='keep this encoding'",
      "",
      "export WHOXOS_HOME = '/old path'  # managed path",
      "WHOXOS_DUPLICATE=stale",
      'WHOXOS_DUPLICATE="current"',
      "TRAILING=untouched",
      "",
    ].join("\r\n");

    const updated = updateEnvFileContents(
      original,
      {
        WHOXOS_HOME: "/new path",
        WHOXOS_DUPLICATE: "current",
        WHOXOS_WORKTREE_COLOR: "#439edb",
      },
      { valueEncoding: "minimal" },
    );

    expect(updated).toBe([
      "# operator comment",
      "UNKNOWN='keep this encoding'",
      "",
      'export WHOXOS_HOME = "/new path"  # managed path',
      "WHOXOS_DUPLICATE=current",
      'WHOXOS_DUPLICATE="current"',
      "TRAILING=untouched",
      'WHOXOS_WORKTREE_COLOR="#439edb"',
      "",
    ].join("\r\n"));
    expect(updated.replaceAll("\r\n", "")).not.toContain("\n");
  });

  it("uses JSON encoding for changed values without re-encoding current assignments", () => {
    const original = [
      "WHOXOS_CURRENT=plain-value",
      "WHOXOS_CHANGED=old",
      "UNKNOWN=\"operator value\"",
      "",
    ].join("\n");

    expect(
      updateEnvFileContents(
        original,
        {
          WHOXOS_CURRENT: "plain-value",
          WHOXOS_CHANGED: "new",
          WHOXOS_ADDED: "added",
        },
        { valueEncoding: "json" },
      ),
    ).toBe([
      "WHOXOS_CURRENT=plain-value",
      'WHOXOS_CHANGED="new"',
      'UNKNOWN="operator value"',
      'WHOXOS_ADDED="added"',
      "",
    ].join("\n"));
  });

  it("does not treat an unquoted dotenv comment as the managed value", () => {
    expect(
      updateEnvFileContents(
        ["WHOXOS_COLOR=#439edb", "WHOXOS_HOME=old# keep this comment"].join("\n"),
        {
          WHOXOS_COLOR: "#439edb",
          WHOXOS_HOME: "new",
        },
        { valueEncoding: "minimal" },
      ),
    ).toBe(
      ['WHOXOS_COLOR="#439edb"#439edb', "WHOXOS_HOME=new# keep this comment"].join("\n"),
    );
  });

  it("is a no-op when every managed duplicate is already current", () => {
    const original = [
      "export WHOXOS_HOME = '/same path' # first",
      'WHOXOS_HOME="/same path"',
      "UNKNOWN=value",
    ].join("\n");

    expect(updateEnvFileContents(original, { WHOXOS_HOME: "/same path" })).toBe(original);
  });
});
