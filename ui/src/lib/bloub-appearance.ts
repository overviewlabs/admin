import { AGENT_ICON_NAMES } from "@whoxos/shared";

/** Saved, server-supported icon keys identify both a silhouette and a color. */
const LEGACY_BLOUB_COLORS = ["mint", "rose", "sky", "amber", "violet", "coral"] as const;
export const BLOUB_COLORS = [
  ...LEGACY_BLOUB_COLORS, "emerald", "teal", "cyan", "cobalt", "indigo", "lavender",
  "orchid", "magenta", "cherry", "peach", "tangerine", "lemon", "lime", "sage",
  "cocoa", "copper", "slate", "pearl",
] as const;

export type BloubColor = typeof BLOUB_COLORS[number];
export function bloubColorForVariant(variant?: string | null): BloubColor {
  const index = AGENT_ICON_NAMES.indexOf((variant ?? "bot") as typeof AGENT_ICON_NAMES[number]);
  return LEGACY_BLOUB_COLORS[Math.max(0, index) % LEGACY_BLOUB_COLORS.length];
}

export const BLOUB_SHAPES = {
  auto: "Default", cercle: "Round", galet: "Pebble", squircle: "Rounded square",
  capsule: "Capsule", triangle: "Triangle", hexagone: "Hexagon", nuage: "Cloud", goutte: "Droplet",
} as const;
export const BLOUB_EXPRESSIONS = {
  neutre: "Neutral", attentif: "Attentive", surpris: "Surprised", excite: "Excited",
  heureux: "Happy", hilare: "Laughing", colere: "Angry", triste: "Sad", effraye: "Scared",
  mefiant: "Skeptical", confus: "Confused", curieux: "Curious", fier: "Proud",
  timide: "Shy", blase: "Unimpressed", somnolent: "Sleepy",
} as const;
export interface BloubAppearance {
  expression: keyof typeof BLOUB_EXPRESSIONS;
  color: BloubColor;
  shape: keyof typeof BLOUB_SHAPES;
}
export function readBloubAppearance(metadata?: Record<string, unknown> | null, variant?: string | null): BloubAppearance {
  const raw = metadata?.avatarAppearance;
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    expression: Object.hasOwn(BLOUB_EXPRESSIONS, String(value.expression)) ? value.expression as BloubAppearance["expression"] : "neutre",
    color: BLOUB_COLORS.includes(value.color as BloubColor) ? value.color as BloubColor : bloubColorForVariant(variant),
    shape: Object.hasOwn(BLOUB_SHAPES, String(value.shape)) ? value.shape as BloubAppearance["shape"] : "auto",
  };
}
