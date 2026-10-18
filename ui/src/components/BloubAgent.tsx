import { useEffect, useId, useMemo, useRef, useState, type SVGProps } from "react";
import { BotEngine, type BotFrame } from "../lib/bloub/engine";
import { EXPRESSIONS, type BotExpression } from "../lib/bloub/expressions";
import type { BloubAppearance } from "../lib/bloub-appearance";
import { SHAPES } from "../lib/bloub/skins";
import { RAYON, DEMI_VIEWBOX } from "../lib/bloub/repere";
import type { StateId } from "../lib/bloub/states";
import { BloubGaze } from "../lib/bloub-gaze";
import { BloubIdle } from "../lib/bloub-idle";
import { subscribeBloubAnimation } from "../lib/bloub-animation";
import { bloubColorForVariant } from "../lib/bloub-appearance";
import { cn } from "../lib/utils";

export function bloubStateForStatus(status?: string): StateId {
  if (status === "speaking" || status === "streaming") return "play";
  if (status === "working") return "orbit";
  if (status === "running" || status === "thinking") return "thinking";
  if (["error", "failed", "interrupted", "refused", "truncated", "cancelled", "timed_out"].includes(status ?? "")) return "alert";
  if (["paused", "terminated", "dormant", "sleep"].includes(status ?? "")) return "sleep";
  if (["pending_approval", "awaiting_approval", "queued"].includes(status ?? "")) return "notify";
  return "idle";
}

function restingFrame(state: StateId, shape: number[] | null, expression: BotExpression | null) {
  const engine = new BotEngine(RAYON, state, shape, expression);
  if (state === "idle") engine.setLook(new BloubIdle().sample(0).look, 0, 0);
  return engine.sample(1);
}

export interface BloubAgentProps extends SVGProps<SVGSVGElement> {
  status?: string;
  /** Existing saved icon keys remain valid and select a stable Bloub silhouette. */
  variant?: string | null;
  animate?: boolean;
  appearance?: BloubAppearance;
}

export function BloubAgent({ status, variant, appearance, animate = true, className, ...props }: BloubAgentProps) {
  const state = bloubStateForStatus(status);
  const expression = EXPRESSIONS.find(item => item.id === appearance?.expression) ?? null;
  const shape = useMemo(() => {
    if (appearance?.shape && appearance.shape !== "auto") return SHAPES.find(item => item.id === appearance.shape)?.radii ?? null;
    if (!variant || variant === "bot") return null;
    const hash = [...variant].reduce((n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) >>> 0, 0);
    return SHAPES[hash % SHAPES.length].radii;
  }, [variant, appearance?.shape]);
  const engine = useMemo(() => new BotEngine(RAYON, "idle", shape, expression), [shape, expression]);
  const [frame, setFrame] = useState<BotFrame>(() => restingFrame(state, shape, expression));
  const svg = useRef<SVGSVGElement>(null);
  const clock = useRef(0);
  const uid = useId().replaceAll(":", "");
  const maskId = `bloub-${uid}`;
  const gradientId = `${maskId}-color`;
  const color = appearance?.color ?? bloubColorForVariant(variant);

  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let visible = typeof IntersectionObserver === "undefined";
    let unsubscribe: (() => void) | undefined;
    let previous = 0;
    engine.setState(state, clock.current);
    engine.setLook(state === "idle" ? new BloubIdle().sample(0).look : null, clock.current, 0.2);
    const idle = state === "idle" ? new BloubIdle(Math.random, clock.current) : null;
    const gaze = new BloubGaze();
    const phase = Math.random() * Math.PI * 2;
    if (idle) setFrame(restingFrame(state, shape, expression));
    const update = (time: number) => {
      const dt = previous ? Math.min((time - previous) / 1000, 0.1) : 0;
      clock.current += dt;
      previous = time;
      const behavior = idle?.sample(clock.current);
      if (behavior) engine.setLook(gaze.step(behavior.look, dt, 10), clock.current, 0);
      const next = engine.sample(clock.current, behavior?.lid);
      if (idle) {
        // Keep idle animation off React's render path, especially on mobile.
        for (const path of element.querySelectorAll<SVGPathElement>("[data-bloub-body]")) path.setAttribute("d", next.bodyPath);
        element.querySelectorAll<SVGPathElement>("[data-bloub-eye]").forEach((eye, i) => {
          const pose = next.eyes[i];
          if (!pose) { eye.setAttribute("opacity", "0"); return; }
          eye.setAttribute("d", pose.d);
          eye.setAttribute("transform", pose.matrix);
          eye.setAttribute("opacity", String(pose.alpha));
        });
        // Gentle individual breathing; transform the complete face and body together.
        const breath = Math.sin(clock.current * 1.35 + phase);
        element.style.setProperty("--bloub-breath", String(breath));
      } else setFrame(next);
    };
    const sync = () => {
      unsubscribe?.(); unsubscribe = undefined; previous = 0;
      const motion = animate && media && !media.matches && typeof requestAnimationFrame === "function";
      if (!motion) {
        element.style.removeProperty("--bloub-breath");
        setFrame(restingFrame(state, shape, expression));
      } else if (visible) {
        unsubscribe = subscribeBloubAnimation(update);
      }
    };
    const observer = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting; sync();
    }) : undefined;
    observer?.observe(element);
    media?.addEventListener?.("change", sync);
    sync();
    return () => { element.style.removeProperty("--bloub-breath"); unsubscribe?.(); observer?.disconnect(); media?.removeEventListener?.("change", sync); };
  }, [engine, state, shape, expression, animate]);

  const vb = DEMI_VIEWBOX;
  const dots = frame.dots.map((dot, i) => dot.d ? (
    <path key={i} d={dot.d} transform={`translate(${dot.x} ${dot.y}) rotate(${dot.rot ?? 0}) scale(${RAYON})`} fill="currentColor" opacity={dot.opacity * (dot.depth ?? 1)} />
  ) : <circle key={i} cx={dot.x} cy={dot.y} r={dot.r} fill="currentColor" opacity={dot.opacity * (dot.depth ?? 1)} />);
  return (
    <svg ref={svg} viewBox={`${-vb} ${-vb} ${vb * 2} ${vb * 2}`} aria-hidden="true" focusable="false"
      data-bloub-color={color} data-bloub-state={state} className={cn("bloub-agent shrink-0", !props.width && !props.height && "size-4", className)} {...props}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--bloub-color-light)" />
          <stop offset="100%" stopColor="var(--bloub-color)" />
        </linearGradient>
        <mask id={maskId} className="bloub-agent-mask" maskUnits="userSpaceOnUse" x={-vb} y={-vb} width={vb * 2} height={vb * 2}>
          <path data-bloub-body="" d={frame.bodyPath} fill="var(--bloub-mask-solid)" />
          {frame.eyes.map((eye, i) => <path data-bloub-eye="" key={i} d={eye.d} transform={eye.matrix} opacity={eye.alpha} fill="var(--bloub-mask-hole)" />)}
          {frame.notch && <circle cx={frame.notch.x} cy={frame.notch.y} r={frame.notch.r} fill="var(--bloub-mask-hole)" />}
        </mask>
      </defs>
      <g fill="none" stroke="currentColor" strokeLinecap="round">
        {frame.arcs.map(arc => <path key={arc.id} d={arc.back} strokeWidth={arc.width} opacity={arc.opacity} />)}
      </g>
      {frame.dotsBehind && dots}
      <g opacity={frame.bodyAlpha}>
        <path data-bloub-body="" d={frame.bodyPath} fill="var(--bloub-paper)" />
        <rect x={-vb} y={-vb} width={vb * 2} height={vb * 2} fill={`url(#${gradientId})`} mask={`url(#${maskId})`} />
      </g>
      {!frame.dotsBehind && dots}
      {frame.notif && <circle cx={frame.notif.x} cy={frame.notif.y} r={frame.notif.r} fill="currentColor" />}
      <g fill="none" stroke="currentColor" strokeLinecap="round">
        {frame.arcs.map(arc => <path key={arc.id} d={arc.front} strokeWidth={arc.width} opacity={arc.opacity} />)}
      </g>
    </svg>
  );
}
