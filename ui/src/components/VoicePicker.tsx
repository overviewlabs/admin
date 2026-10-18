import { useEffect, useRef, useState } from "react";
import { Loader2, Play, Square } from "lucide-react";
import { VOICE_CATALOG } from "@/lib/voice-catalog";
import type { VoiceAssignment } from "@whoxos/shared/agent-voice";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type Voice = typeof VOICE_CATALOG[number];
function GenderDot({ gender }: { gender: Voice["gender"] }) {
  return <span className={`voice-gender-dot voice-gender-${gender.toLowerCase()}`} role="img" aria-label={gender} title={gender} />;
}
export function VoicePicker({ value, onChange, disabled, assignments, assignmentState, currentAgentId }: {
  value: Voice["name"];
  onChange: (voice: Voice["name"]) => void;
  disabled?: boolean;
  assignments: VoiceAssignment[];
  assignmentState: "loading" | "error" | "ready";
  currentAgentId: string;
}) {
  const [search, setSearch] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);
  const owners = new Map(assignments.map(assignment => [assignment.voice, assignment]));
  const query = search.trim().toLowerCase();
  const matches = VOICE_CATALOG.filter(voice => query === "male" || query === "female"
    ? voice.gender.toLowerCase() === query
    : `${voice.name} ${voice.gender} ${voice.tone} ${owners.get(voice.name)?.agentName ?? (assignmentState === "ready" ? "Available" : "")}`.toLowerCase().includes(query));
  function stop() { const current = audio.current; audio.current = null; if (current) { current.pause(); current.removeAttribute("src"); current.load(); } setPlaying(null); setLoading(false); }
  useEffect(() => () => { const current = audio.current; audio.current = null; current?.pause(); current?.removeAttribute("src"); current?.load(); }, []);
  async function preview(voice: Voice) {
    const wasPlaying = playing === voice.name;
    stop(); setError("");
    if (wasPlaying) return;
    const current = new Audio(voice.previewUrl); audio.current = current;
    setPlaying(voice.name); setLoading(true);
    current.onended = () => { if (audio.current === current) stop(); };
    current.onerror = () => { if (audio.current === current) { stop(); setError(`Could not load ${voice.name}'s preview. Please try again.`); } };
    try { await current.play(); if (audio.current === current) setLoading(false); }
    catch { if (audio.current === current) { stop(); setError(`Could not play ${voice.name}'s preview. Please try again.`); } }
  }
  return <div className="min-w-0 space-y-3">
    <Input aria-label="Search voices" placeholder="Search voice, agent, gender, or tone…" value={search} onChange={event => setSearch(event.target.value)} disabled={disabled} />
    <div className="max-h-96 overflow-auto rounded-md border border-border">
      <table className="w-full text-left text-sm" aria-label="Available voices">
        <thead className="sticky top-0 z-10 bg-muted text-muted-foreground"><tr><th scope="col" className="px-3 py-2 font-medium">Voice</th><th scope="col" className="px-3 py-2 font-medium">Gender</th><th scope="col" className="px-3 py-2 font-medium">Tone</th><th scope="col" className="px-3 py-2 font-medium">Assigned to</th><th scope="col" className="px-3 py-2 text-right font-medium">Preview</th></tr></thead>
        <tbody>{matches.map(voice => <tr key={voice.name} className={`border-t border-border hover:bg-accent ${value === voice.name ? "bg-accent" : ""}`}>
          <td className="px-3 py-2"><label className="flex items-center gap-2 whitespace-nowrap cursor-pointer"><input type="radio" name="agent-voice" aria-label={`Select ${voice.name}`} checked={value === voice.name} disabled={disabled || assignmentState !== "ready"} onChange={() => { onChange(voice.name); stop(); }} /><span>{voice.name}</span></label></td>
          <td className="px-3 py-2"><span className="flex items-center gap-2"><GenderDot gender={voice.gender} />{voice.gender}</span></td>
          <td className="px-3 py-2"><span className="whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{voice.tone}</span></td>
          <td className="px-3 py-2 text-muted-foreground">{assignmentState !== "ready" ? assignmentState === "loading" ? "Loading…" : "Unavailable" : owners.has(voice.name) ? <span>{owners.get(voice.name)!.agentName}{owners.get(voice.name)!.agentId === currentAgentId ? " (this agent)" : ""}</span> : "Available"}</td>
          <td className="px-3 py-2 text-right"><Button type="button" variant="ghost" size="icon-sm" disabled={disabled} aria-label={`${playing === voice.name ? "Stop" : "Preview"} ${voice.name}`} onClick={() => void preview(voice)}>{playing === voice.name ? loading ? <Loader2 className="size-4 animate-spin" /> : <Square className="size-4" /> : <Play className="size-4" />}</Button></td>
        </tr>)}</tbody>
      </table>
      {matches.length === 0 && <p className="p-3 text-sm text-muted-foreground">No matching voices.</p>}
    </div>
    <p className="text-xs text-muted-foreground">Google voice samples. Guide the accent through speaking preferences.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
