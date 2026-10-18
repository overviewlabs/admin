import { describe, expect, it } from "vitest";
import type { AdapterConfigSchema, ConfigFieldSchema } from "@whoxos/adapter-utils";
import { fieldMatchesVisibleWhen, buildSchemaAdapterConfig } from "./schema-config-fields";
import { defaultCreateValues } from "../components/agent-config-defaults";

const sourceField: ConfigFieldSchema = {
  key: "provider",
  label: "Provider",
  type: "select",
  options: [
    { label: "Claude", value: "claude" },
    { label: "Codex", value: "codex" },
  ],
};

const schema: AdapterConfigSchema = {
  fields: [sourceField],
};

function targetWithVisibleWhen(visibleWhen: Record<string, unknown>): ConfigFieldSchema {
  return {
    key: "model",
    label: "Model",
    type: "text",
    meta: { visibleWhen },
  };
}

describe("fieldMatchesVisibleWhen", () => {
  it("treats an empty values array as no match", () => {
    const field = targetWithVisibleWhen({ key: "provider", values: [] });

    expect(fieldMatchesVisibleWhen(field, () => "claude", schema)).toBe(false);
  });

  it("treats all non-string values as no match", () => {
    const field = targetWithVisibleWhen({ key: "provider", values: [null, 42] });

    expect(fieldMatchesVisibleWhen(field, () => "claude", schema)).toBe(false);
  });

  it("matches non-empty string values", () => {
    const field = targetWithVisibleWhen({ key: "provider", values: ["claude"] });

    expect(fieldMatchesVisibleWhen(field, () => "claude", schema)).toBe(true);
    expect(fieldMatchesVisibleWhen(field, () => "codex", schema)).toBe(false);
  });
});

describe("external adapter credential bindings", () => {
  it("preserves secret references alongside typed decision configuration", () => {
    const binding = { type: "secret_ref" as const, secretId: "a5abf6c4-8d58-4d54-acee-af25a5e63e1f", version: "latest" as const };
    const config = buildSchemaAdapterConfig({
      ...defaultCreateValues,
      adapterType: "typesafe",
      envBindings: { TYPESAFE_API_KEY: binding },
      adapterSchemaValues: { model: "jev-preview", questionsJson: '{"urgent":{"type":"noul","instructions":"Is this urgent?"}}' },
    });
    expect(config.env).toEqual({ TYPESAFE_API_KEY: binding });
    expect(config.model).toBe("jev-preview");
    expect(config.questionsJson).toContain('"type":"noul"');
  });
});
