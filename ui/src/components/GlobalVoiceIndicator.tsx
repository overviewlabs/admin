import { VoiceConferencePanel } from "./VoiceConferencePanel";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, AudioLines, MicOff, X } from "lucide-react";

import { Link } from "@/lib/router";

import { useOptionalVoiceSession } from "@/context/VoiceSessionContext";
import type { VoicePhase } from "@/lib/agent-voice-live";
import { Button } from "./ui/button";
import { getAudioContext, VoiceBeam } from "voice-glow";
import { useTheme } from "@/context/ThemeContext";

const PHASE_LABELS: Record<VoicePhase, string> = {
  connecting: "Connecting",
  listening: "Listening",
  thinking: "Thinking",
  waiting: "Waiting for voice allowance",
  speaking: "Speaking",
};

/** Persistent controls and original voice beams for the pinned conversation. */
export function GlobalVoiceIndicator() {
  const voice = useOptionalVoiceSession();
  return <VoiceIndicator voice={voice} conference />;
}

type OrganizationVoice = NonNullable<ReturnType<typeof useOptionalVoiceSession>>;
type IndicatorVoice = Pick<OrganizationVoice, "active" | "error" | "phase" | "stream" | "stop" | "dismissError">
  & Partial<Pick<OrganizationVoice, "agent" | "connectionStep" | "activity" | "microphones" | "microphoneId" | "changeMicrophone" | "connectionRequired" | "start" | "searchUnavailable">>;

/** Shared screen-edge animation and controls for organization and Admin calls. */
export function VoiceIndicator({ voice, conference = false }: { voice: IndicatorVoice | null; conference?: boolean }) {
  const { theme } = useTheme();
  const [beamScale, setBeamScale] = useState(2.6);
  const [pane, setPane] = useState<HTMLElement | null>(null);
  const visible = Boolean(voice?.active || voice?.error);
  const animationGeneration = useRef(0);
  const animateStream = voice?.active && voice.phase !== "connecting" ? voice.stream : null;
  useEffect(() => {
    if (!animateStream) return;
    // VoiceBeam reuses a page-wide analyzer context. Release its processing
    // when voice ends without closing the singleton needed by the next call.
    // Pane/navigation changes only move the decoration, so are not dependencies.
    const context = getAudioContext();
    const generation = ++animationGeneration.current;
    return () => {
      // Beam teardown may touch (and resume) the singleton analyzer. Suspend
      // after those cleanups, unless a replacement call already adopted it.
      queueMicrotask(() => {
        if (animationGeneration.current === generation && context && context.state !== "closed") void context.suspend().catch(() => {});
      });
    };
  }, [animateStream]);
  useLayoutEffect(() => {
    if (!visible) return;
    let currentPane: HTMLElement | null | undefined;
    const locatePane = () => {
      if (currentPane?.isConnected) return;
      const nextPane = document.querySelector<HTMLElement>("[data-voice-pane]");
      if (nextPane !== currentPane) { currentPane = nextPane; setPane(nextPane); }
    };
    locatePane();
    // Lazy routes can replace the shell. Move only the presentation portal;
    // the voice session stays mounted above the router.
    const observer = new MutationObserver(locatePane);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [visible]);
  useLayoutEffect(() => {
    if (!visible) return;
    const target = pane ?? document.getElementById("root");
    if (!target) return;
    const measure = () => {
      const width = target.getBoundingClientRect().width;
      if (width) setBeamScale(width < 768 ? 1.2 : 2.6);
    };
    measure();
    // Resize the decoration without changing the page layout.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(target);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);

    };
  }, [visible, pane]);
  if (!voice || (!voice.active && !voice.error)) return null;

  const agentName = voice.agent?.name || "Agent";
  const companyName = voice.agent?.companyName || voice.agent?.companyPrefix || "Original organization";
  const companyPath = voice.agent?.companyPrefix ? `/${encodeURIComponent(voice.agent.companyPrefix)}` : null;
  const chatPath = companyPath && voice.agent ? `${companyPath}/chats/${encodeURIComponent(voice.agent.id)}` : null;

  return createPortal(
    <div className="global-voice-overlay" data-active={voice.active} data-phase={voice.phase} data-fullscreen={!pane}>
      {/* Keep startup free of four canvas renderers; controls remain immediate.
          The same four-sided animation begins once audio is ready. */}
      {voice.active && voice.phase !== "connecting" && (
        <div className="global-voice-glow-frame" aria-hidden="true">
          {(["bottom", "top", "left", "right"] as const).map((edge) => (
            <VoiceBeam key={edge} className="global-voice-glow" data-edge={edge}
              stream={voice.stream} processing={voice.phase === "thinking"}
              scale={beamScale} idle={0.55} theme={theme}>
              <div className="global-voice-glow-host" />
            </VoiceBeam>
          ))}
        </div>
      )}
      <div className="global-voice-controls" aria-label="Voice conversation">
        <AudioLines className="global-voice-status-icon size-4 shrink-0" aria-hidden="true" />
        <div className="global-voice-identity min-w-0">
          <span className="truncate text-xs font-medium" title={`${agentName} · ${companyName}`}>{agentName} · {companyName}</span>
          <span className="truncate text-xs text-muted-foreground" role="status">
            {voice.active ? (voice.phase === "connecting" ? voice.connectionStep || "Connecting" : PHASE_LABELS[voice.phase]) : "Voice stopped"}
            {voice.active && voice.activity && voice.phase !== "connecting" ? ` · ${voice.activity}` : ""}
          </span>
        </div>
        {Boolean(voice.microphones?.length) && (
          <select aria-label="Voice microphone" className="max-w-40 rounded border bg-background px-1 py-1 text-xs" value={voice.microphoneId ?? ""} onChange={event => void voice.changeMicrophone?.(event.target.value)}>
            <option value="">System microphone</option>
            {voice.microphones?.map(device => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
          </select>
        )}
        {chatPath && (
          <Button variant="ghost" size="xs" asChild>
            <Link to={chatPath} aria-label={`Return to chat with ${agentName}`}><ArrowUpRight aria-hidden="true" />Return to chat</Link>
          </Button>
        )}
        {voice.active && conference && <VoiceConferencePanel />}
        {voice.active && <Button variant="secondary" size="xs" onClick={voice.stop}><MicOff aria-hidden="true" />End voice</Button>}
        {voice.error && (
          <div className="global-voice-error">
            <p className="min-w-0 flex-1 text-xs text-destructive" role="alert">{voice.error}</p>
            {voice.connectionRequired && <Link to={`/${voice.agent?.companyPrefix ?? ""}/apps/connect?source=gemini`} className="text-xs underline">Connect Gemini</Link>}
            {!voice.active && !voice.connectionRequired && voice.agent && <Button size="xs" variant="secondary" onClick={() => { if (voice.agent) void voice.start?.(voice.agent); }}>Try voice again</Button>}
            <Button variant="ghost" size="icon-xs" onClick={voice.dismissError} aria-label="Dismiss voice error"><X aria-hidden="true" /></Button>
          </div>
        )}
        {voice.active && voice.searchUnavailable && <p className="basis-full text-xs text-muted-foreground" role="status">{voice.searchUnavailable}</p>}
      </div>
    </div>, pane ?? document.body,
  );
}
