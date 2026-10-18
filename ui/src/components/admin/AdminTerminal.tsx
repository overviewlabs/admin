import { useEffect, useRef, useState } from "react";
import { Plus, Terminal as TerminalIcon, X, RefreshCw } from "lucide-react";
import { useLocation, useNavigate } from "../../lib/router";
import { useTheme } from "../../context/ThemeContext";
import { useAdminQuery, useAdminAction } from "../../hooks/useNativeAdmin";
import {
  ensureAdminSession,
  adminRequest,
  adminJson,
  adminUrl,
  adminSocketUrl,
  type AdminTerminal as TerminalInfo,
} from "../../api/native-admin";
import { Button } from "../ui/button";
import { AdminError, AdminHeading, AdminPrompt } from "./AdminControls";
import type { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

function canvasColor(value: string) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) return value;
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  return `#${Array.from(ctx.getImageData(0, 0, 1, 1).data)
    .slice(0, 3)
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("")}`;
}
function TerminalView({ id }: { id: string }) {
  const host = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | undefined>(undefined);
  const { theme } = useTheme();
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [attempt, setAttempt] = useState(0);
  function applyTheme() {
    if (!host.current || !terminal.current) return;
    const style = getComputedStyle(host.current);
    terminal.current.options.theme = {
      background: canvasColor(style.backgroundColor),
      foreground: canvasColor(style.color),
      cursor: canvasColor(style.color),
    };
  }
  useEffect(() => {
    applyTheme();
  }, [theme]);
  useEffect(() => {
    let disposed = false;
    let ws: WebSocket | undefined;
    let cleanup: (() => void) | undefined;
    setError("");
    setConnected(false);
    void ensureAdminSession()
      .then(() =>
        Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]),
      )
      .then(([{ Terminal }, { FitAddon }]) => {
        if (disposed || !host.current) return;
        const style = getComputedStyle(host.current);
        const term = new Terminal({
          cursorBlink: true,
          scrollback: 5000,
          fontFamily: style.fontFamily,
          fontSize: parseFloat(style.fontSize),
          allowProposedApi: false,
        });
        terminal.current = term;
        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(host.current);
        applyTheme();
        ws = new WebSocket(
          adminSocketUrl(`terminal/${encodeURIComponent(id)}/ws`),
        );
        ws.binaryType = "arraybuffer";
        const resize = () => {
          if (!host.current?.clientWidth || !host.current.clientHeight) return;
          fit.fit();
          if (ws?.readyState === WebSocket.OPEN) {
            const packet = new Uint8Array(5);
            packet[0] = 2;
            const data = new DataView(packet.buffer);
            data.setUint16(1, term.cols);
            data.setUint16(3, term.rows);
            ws.send(packet);
          }
        };
        const observer = new ResizeObserver(resize);
        observer.observe(host.current);
        resize();
        const input = term.onData((text) => {
          if (ws?.readyState === WebSocket.OPEN) {
            const bytes = new TextEncoder().encode(text);
            const data = new Uint8Array(bytes.length + 1);
            data.set(bytes, 1);
            ws.send(data);
          }
        });
        ws.onopen = () => {
          if (!disposed) {
            setConnected(true);
            resize();
            term.focus();
          }
        };
        ws.onmessage = (event) => {
          if (!disposed)
            term.write(
              typeof event.data === "string"
                ? event.data
                : new Uint8Array(event.data),
            );
        };
        ws.onerror = () => {
          if (!disposed)
            setError("Could not connect to this terminal. Try reconnecting.");
        };
        ws.onclose = (event) => {
          if (!disposed) {
            setConnected(false);
            setError(
              event.code === 4004
                ? "This terminal has ended. Open a new terminal to continue."
                : "Terminal disconnected. Reconnect to resume this session.",
            );
          }
        };
        cleanup = () => {
          observer.disconnect();
          input.dispose();
          ws?.close();
          term.dispose();
          terminal.current = undefined;
        };
      })
      .catch((e) => {
        if (!disposed)
          setError(e instanceof Error ? e.message : "Terminal could not load.");
      });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [id, attempt]);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span role="status">{connected ? "Connected" : "Disconnected"}</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setAttempt((n) => n + 1)}
        >
          <RefreshCw className="size-4" />
          Reconnect
        </Button>
      </div>
      <AdminError error={error} />
      <div
        ref={host}
        aria-label="Root terminal"
        className="native-admin-terminal min-h-64 flex-1 min-w-0 overflow-hidden rounded-lg border bg-background p-3 font-mono text-base md:text-sm"
      />
    </div>
  );
}
export function AdminTerminals() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const selected = params.get("session");
  const workspace = params.get("workspace") || undefined;
  const sessions = useAdminQuery<TerminalInfo[]>("terminal", true, 10_000);
  const action = useAdminAction();
  const [closing, setClosing] = useState<TerminalInfo>();
  const activeId = selected || sessions.data?.[0]?.session_id;
  return (
    <div className="flex flex-1 min-h-0 flex-col gap-4">
      <AdminHeading title="Terminal" description={workspace || "Server shell"}>
        <Button
          disabled={action.busy}
          onClick={() =>
            void action.run(
              () =>
                adminRequest<TerminalInfo>(
                  "terminal",
                  adminJson({ cwd: workspace }),
                ),
              (session) =>
                navigate(
                  adminUrl("terminal", {
                    session: session.session_id,
                    workspace,
                  }),
                ),
            )
          }
        >
          <Plus className="size-4" />
          New terminal
        </Button>
      </AdminHeading>
      <AdminError
        error={sessions.error || action.error}
        retry={() => void sessions.refetch()}
      />
      {!!sessions.data?.length && (
        <div className="flex gap-2 overflow-x-auto shrink-0 pb-1">
          {sessions.data.map((session, i) => (
            <div
              key={session.session_id}
              className="flex shrink-0 items-center rounded-lg border"
            >
              <Button
                variant={
                  activeId === session.session_id ? "secondary" : "ghost"
                }
                onClick={() =>
                  navigate(
                    adminUrl("terminal", {
                      session: session.session_id,
                      workspace,
                    }),
                  )
                }
              >
                <TerminalIcon className="size-4" />
                Terminal {i + 1}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Close terminal ${i + 1}`}
                onClick={() => setClosing(session)}
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      {activeId ? (
        <TerminalView key={activeId} id={activeId} />
      ) : (
        !sessions.isPending && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground">
            <TerminalIcon className="size-8" />
            <p>Open a terminal to work on the server.</p>
          </div>
        )
      )}
      {closing && (
        <AdminPrompt
          title="Close terminal"
          description="This ends the shell and any commands running in it."
          label=""
          confirm="Close terminal"
          destructive
          onClose={() => setClosing(undefined)}
          onConfirm={async () => {
            await adminRequest(`terminal/${closing.session_id}`, {
              method: "DELETE",
            });
            if (activeId === closing.session_id)
              navigate(adminUrl("terminal", { workspace }));
          }}
        />
      )}
    </div>
  );
}
