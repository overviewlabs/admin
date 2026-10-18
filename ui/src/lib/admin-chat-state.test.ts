import { describe, expect, it } from "vitest";
import {
  activeAdminMessages,
  applyAdminChatEvent,
  mergeAdminOutput,
} from "./admin-chat-state";
import type { AdminChat, AdminMessage } from "../api/native-admin";
const message = (
  id: string,
  parent: string | null,
  content = "",
): AdminMessage => ({
  id,
  parent_id: parent,
  role: "assistant",
  content,
  done: false,
  output: [],
});
const chat = (messages: AdminMessage[], current = "b"): AdminChat => ({
  chat: {
    id: "chat",
    title: "Admin",
    updated_at: 0,
    current_message_id: current,
  },
  messages,
});
describe("native Admin conversation state", () => {
  it("shows the selected conversation branch, excluding regenerated siblings", () => {
    expect(
      activeAdminMessages(
        chat([message("a", null), message("old", "a"), message("b", "a")]),
      ).map((m) => m.id),
    ).toEqual(["a", "b"]);
  });
  it("bounds traversal even when historical parent data contains a cycle", () => {
    expect(
      activeAdminMessages(chat([message("a", "b"), message("b", "a")])),
    ).toHaveLength(2);
  });
  it("merges changing tool status while retaining the separate tool result", () => {
    const initial = [
      {
        type: "function_call",
        call_id: "tool",
        status: "pending",
        name: "run",
      },
      { type: "function_call_output", call_id: "tool", output: "ok" },
    ];
    const result = mergeAdminOutput(initial, {
      type: "function_call",
      call_id: "tool",
      status: "completed",
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ status: "completed", name: "run" });
    expect(result[1].output).toBe("ok");
    expect(initial[0].status).toBe("pending");
  });
  it("isolates events by chat and appends deltas only to the target message", () => {
    const initial = chat([
      message("a", null, "Original"),
      message("b", "a", "Hello"),
    ]);
    expect(
      applyAdminChatEvent(initial, {
        chat_id: "other",
        message_id: "b",
        delta: "wrong",
      }),
    ).toBe(initial);
    const result = applyAdminChatEvent(initial, {
      chat_id: "chat",
      message_id: "b",
      delta: " world",
      done: true,
    });
    expect(result?.messages[1]).toMatchObject({
      content: "Hello world",
      done: true,
    });
    expect(result?.messages[0].content).toBe("Original");
    expect(initial.messages[1].content).toBe("Hello");
  });
});

import { defaultAdminModel } from "../api/native-admin";
describe("Admin model fallback", () => {
  const models = [
    { id: "first", name: "First" },
    { id: "second", name: "Second" },
  ];
  it("honors a configured model when it remains available", () =>
    expect(defaultAdminModel({ models, default: "second" })).toBe("second"));
  it("selects an available model when the default is unset or retired", () => {
    expect(defaultAdminModel({ models, default: null })).toBe("first");
    expect(defaultAdminModel({ models, default: "retired" })).toBe("first");
  });
  it("does not invent a model when none are available", () =>
    expect(defaultAdminModel({ models: [], default: "missing" })).toBe(""));
});
