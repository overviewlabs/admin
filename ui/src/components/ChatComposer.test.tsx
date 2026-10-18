// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatComposer, type ChatComposerProps } from "./ChatComposer";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Stateful harness so the controlled textarea reflects typed input. */
function Harness(props: Partial<ChatComposerProps> & { initial?: string }) {
  const { initial = "", onChange, ...rest } = props;
  const [value, setValue] = useState(initial);
  return (
    <ChatComposer
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
      onSubmit={rest.onSubmit ?? (() => {})}
      {...rest}
    />
  );
}

function typeInput(textarea: HTMLDivElement, text: string) {
  textarea.innerHTML = text.split("\n").map(line => `<p>${line.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</p>`).join("");
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("ChatComposer", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  function input() {
    return container.querySelector<HTMLDivElement>('[data-testid="chat-composer-input"]')!;
  }
  function sendButton() {
    return container.querySelector<HTMLButtonElement>('button[aria-label="Send message"]')!;
  }
  function attachButton() {
    return container.querySelector<HTMLButtonElement>('button[aria-label="Attach files"]');
  }

  it("renders a rich text input + send and no attach button without a handler", async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<Harness placeholder="Ask anything…" />);
    });
    expect(input()).toBeTruthy();
    expect(input().getAttribute("aria-label")).toBe("Ask anything…");
    expect(attachButton()).toBeNull();
    // No formatting toolbar — there is exactly one button (send) when bare.
    expect(container.querySelectorAll("button").length).toBe(1);
    act(() => root.unmount());
  });

  it("shows the attach affordance when onAttachFiles is provided", async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<Harness onAttachFiles={() => {}} />);
    });
    expect(attachButton()).toBeTruthy();
    act(() => root.unmount());
  });

  it("disables send while empty and enables it once there is text", async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<Harness />);
    });
    expect(sendButton().disabled).toBe(true);
    await act(async () => {
      typeInput(input(), "hello");
    });
    expect(sendButton().disabled).toBe(false);
    act(() => root.unmount());
  });

  it("submits on click", async () => {
    const onSubmit = vi.fn();
    const root = createRoot(container);
    await act(async () => {
      root.render(<Harness onSubmit={onSubmit} initial="hi" />);
    });
    await act(async () => {
      sendButton().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it('submitKey="enter": plain Enter submits, Shift+Enter does not', async () => {
    const onSubmit = vi.fn();
    const root = createRoot(container);
    await act(async () => {
      root.render(<Harness onSubmit={onSubmit} initial="hi" submitKey="enter" />);
    });
    await act(async () => {
      input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, shiftKey: true }));
    });
    expect(onSubmit).not.toHaveBeenCalled();
    await act(async () => {
      input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it('submitKey="mod-enter": plain Enter does not submit, Cmd/Ctrl+Enter does', async () => {
    const onSubmit = vi.fn();
    const root = createRoot(container);
    await act(async () => {
      root.render(<Harness onSubmit={onSubmit} initial="hi" submitKey="mod-enter" />);
    });
    await act(async () => {
      input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(onSubmit).not.toHaveBeenCalled();
    await act(async () => {
      input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, metaKey: true }));
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it("singleLine strips newlines from input", async () => {
    const onChange = vi.fn();
    const root = createRoot(container);
    await act(async () => {
      root.render(<Harness singleLine onChange={onChange} />);
    });
    await act(async () => {
      typeInput(input(), "one\ntwo");
    });
    expect(onChange).toHaveBeenLastCalledWith("one two");
    act(() => root.unmount());
  });

  it("default (multiline) mode soft-wraps and auto-grows instead of clipping (PAP-116)", async () => {
    // The conference room composer adopts this default mode. Text must wrap and
    // the box grow up to a cap — never clip horizontally or show an idle scrollbar.
    const root = createRoot(container);
    await act(async () => {
      root.render(<Harness />);
    });
    const el = input();
    expect(el.getAttribute("aria-multiline")).toBe("true");
    expect(el.parentElement?.className).toContain("overflow-y-auto");
    expect(el.parentElement?.className).toContain("max-h-(--sz-200px)");
    expect(el.parentElement?.className).not.toContain("whitespace-nowrap");
    expect(el.parentElement?.className).not.toContain("overflow-x-auto");
    act(() => root.unmount());
  });

  it("singleLine mode clips to one row (opt-in only)", async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<Harness singleLine />);
    });
    const el = input();
    expect(el.parentElement?.className).toContain("whitespace-nowrap");
    expect(el.parentElement?.className).toContain("whitespace-nowrap");
    expect(el.parentElement?.className).toContain("max-h-(--sz-22px)");
    act(() => root.unmount());
  });

  it('tone="planning" is reflected on the container', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<Harness tone="planning" />);
    });
    const box = container.querySelector('[data-testid="chat-composer"]');
    expect(box?.getAttribute("data-tone")).toBe("planning");
    act(() => root.unmount());
  });

  it('tone="ask" is reflected on the container', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<Harness tone="ask" />);
    });
    const box = container.querySelector('[data-testid="chat-composer"]');
    expect(box?.getAttribute("data-tone")).toBe("ask");
    expect(box?.className).toContain("sky");
    act(() => root.unmount());
  });

  it('defaults to the opaque "card" surface', async () => {
    // PAP-131: surface is opt-in — existing adopters keep the bg-card box.
    const root = createRoot(container);
    await act(async () => {
      root.render(<Harness />);
    });
    const box = container.querySelector('[data-testid="chat-composer"]')!;
    expect(box.getAttribute("data-surface")).toBe("card");
    expect(box.className).toContain("bg-card");
    expect(box.className).not.toContain("backdrop-blur");
    // Rounded corners are shared chrome on both surfaces.
    expect(box.className).toContain("rounded-md");
    act(() => root.unmount());
  });

  it('surface="translucent" applies the task glass recipe and keeps shared chrome (PAP-131)', async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<Harness surface="translucent" />);
    });
    const box = container.querySelector('[data-testid="chat-composer"]')!;
    expect(box.getAttribute("data-surface")).toBe("translucent");
    // Glass recipe — mirrors the task-comments composer shell.
    expect(box.className).toContain("bg-background/95");
    expect(box.className).toContain("supports-[backdrop-filter]:bg-background/85");
    expect(box.className).toContain("backdrop-blur");
    expect(box.className).toContain("shadow-(--shadow-extract-4)");
    expect(box.className).toContain("dark:shadow-(--shadow-extract-5)");
    expect(box.className).not.toContain("bg-card");
    // Shared chrome survives: rounded-md corners + neutral focus darkening.
    expect(box.className).toContain("rounded-md");
    expect(box.className).toContain("focus-within:border-muted-foreground/40");
    act(() => root.unmount());
  });

  it("translucent surface keeps the drag-over attach layering", async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<Harness surface="translucent" onAttachFiles={() => {}} />);
    });
    const box = container.querySelector<HTMLDivElement>('[data-testid="chat-composer"]')!;
    await act(async () => {
      const dataTransfer = { types: ["Files"], dropEffect: "none" };
      const evt = new Event("dragenter", { bubbles: true }) as DragEvent & {
        dataTransfer: typeof dataTransfer;
      };
      Object.defineProperty(evt, "dataTransfer", { value: dataTransfer });
      box.dispatchEvent(evt);
    });
    expect(container.querySelector('[data-testid="chat-composer-drop-overlay"]')).toBeTruthy();
    act(() => root.unmount());
  });
});
