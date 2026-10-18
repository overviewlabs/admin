import { useState, useMemo } from "react";
import { AGENT_ICON_NAMES, type AgentIconName } from "@whoxos/shared";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { BLOUB_COLORS, bloubColorForVariant, type BloubColor } from "../lib/bloub-appearance";
import { BloubAgent } from "./BloubAgent";

const DEFAULT_ICON: AgentIconName = "bot";

interface AgentIconProps {
  icon: string | null | undefined;
  className?: string;
  status?: string;
}

export function AgentIcon({ icon, className, status }: AgentIconProps) {
  return <BloubAgent variant={icon} status={status} className={className} />;
}

interface AgentIconPickerProps {
  value: string | null | undefined;
  onChange: (icon: string) => void;
  children: React.ReactNode;
}

export function AgentIconPicker({ value, onChange, children }: AgentIconPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [color, setColor] = useState<BloubColor | "all">("all");

  const filtered = useMemo(() => {
    const entries = AGENT_ICON_NAMES.filter(name => color === "all" || bloubColorForVariant(name) === color);
    if (!search) return entries;
    const q = search.toLowerCase();
    return entries.filter((name) => name.includes(q));
  }, [search, color]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <p className="text-sm font-medium mb-2">Agent appearance</p>
        <div className="flex flex-wrap gap-1 mb-3" role="group" aria-label="Filter avatar colors">
          {(["all", ...BLOUB_COLORS] as const).map(option => (
            <button key={option} type="button" aria-pressed={color === option} onClick={() => setColor(option)} className={cn("rounded px-2 py-1 text-xs capitalize hover:bg-accent", color === option && "bg-accent ring-1 ring-primary")}>{option}</button>
          ))}
        </div>
        <Input
          placeholder="Search agent styles..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-2 h-8 text-sm"
          autoFocus
        />
        <div className="grid grid-cols-7 gap-1 max-h-48 overflow-y-auto">
          {filtered.map((name) => (
            <button
              key={name}
              onClick={() => {
                onChange(name);
                setOpen(false);
                setSearch("");
              }}
              className={cn(
                "flex items-center justify-center h-8 w-8 rounded hover:bg-accent transition-colors",
                (value ?? DEFAULT_ICON) === name && "bg-accent ring-1 ring-primary"
              )}
              title={`${bloubColorForVariant(name)} ${name}`}
              aria-label={`${bloubColorForVariant(name)} ${name}`}
              type="button"
            >
              <BloubAgent variant={name} animate={false} className="h-6 w-6" />
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="col-span-7 text-xs text-muted-foreground text-center py-2">No agent styles match</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
