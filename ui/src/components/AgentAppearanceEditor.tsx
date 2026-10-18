import { useState } from "react";
import { BloubAgent } from "./BloubAgent";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { BLOUB_COLORS, BLOUB_SHAPES, BLOUB_EXPRESSIONS, type BloubAppearance } from "../lib/bloub-appearance";

export function AgentAppearanceEditor({ value, variant, onSave, onClose }: {
  value: BloubAppearance;
  variant?: string | null;
  onSave: (value: BloubAppearance) => Promise<unknown>;
  onClose?: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setSaving(true); setError("");
    try { await onSave(draft); onClose?.(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not save appearance."); }
    finally { setSaving(false); }
  }
  return (
    <section id="agent-appearance-editor" aria-label="Agent appearance editor" className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div>
        <h2 className="text-base font-semibold">Agent appearance</h2>
        <p className="text-sm text-muted-foreground">Customize this agent’s color, shape, and expression.</p>
      </div>
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col items-center justify-center gap-2 rounded-lg bg-muted/20 py-6 lg:sticky lg:top-6 lg:self-start lg:py-8">
          <BloubAgent variant={variant} appearance={draft} status="idle" className="size-56 sm:size-72 lg:size-80" />
          <span className="mb-5 text-xs text-muted-foreground">Live preview</span>
          <fieldset disabled={saving} className="w-full px-4">
            <legend className="mb-3 text-sm font-medium">Color</legend>
            <div className="grid grid-cols-6 justify-items-center gap-2">
              {BLOUB_COLORS.map(color => (
                <button key={color} type="button" aria-label={color[0].toUpperCase() + color.slice(1)}
                  aria-pressed={draft.color === color} title={color[0].toUpperCase() + color.slice(1)}
                  onClick={() => setDraft(current => ({ ...current, color }))}
                  className={cn("rounded-full border-2 p-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50",
                    draft.color === color ? "border-foreground" : "border-transparent hover:border-border")}>
                  <svg viewBox="0 0 32 32" aria-hidden="true" data-bloub-color={color} className="bloub-agent size-7">
                    <circle cx="16" cy="16" r="16" fill="var(--bloub-color)" />
                  </svg>
                </button>
              ))}
            </div>
          </fieldset>

        </div>
        <fieldset disabled={saving} className="min-w-0 space-y-5">
          <legend className="sr-only">Appearance settings</legend>
          {(["shape", "expression"] as const).map(field => (
            <fieldset key={field} className="min-w-0">
              <legend className="mb-2 text-sm font-medium">{field === "shape" ? "Shape" : "Eyes / expression"}</legend>
              <div className="grid grid-cols-4 gap-2">
                {Object.entries(field === "shape" ? BLOUB_SHAPES : BLOUB_EXPRESSIONS).map(([id, label]) => (
                  <button key={id} type="button" aria-label={label} aria-pressed={draft[field] === id}
                    onClick={() => setDraft(current => ({ ...current, [field]: id }))}
                    className={cn("flex min-w-0 flex-col items-center gap-1 rounded-lg border p-2 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50",
                      draft[field] === id ? "border-foreground bg-accent" : "border-transparent hover:bg-accent/50")}>
                    <BloubAgent animate={false} variant={variant} status="idle" className="size-12"
                      appearance={{ ...draft, [field]: id }} />
                    <span className="text-xs leading-tight text-muted-foreground">{label}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          ))}

        </fieldset>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" disabled={saving} onClick={() => { setDraft(value); setError(""); onClose?.(); }}>Discard</Button>
        <Button size="sm" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save appearance"}</Button>
      </div>
    </section>
  );
}
