import { modelAccessProgramLabel } from "@whoxos/adapter-utils";
import { Badge } from "./ui/badge";

/** Render the catalog label without interpreting its badge as an access grant. */
export function ModelAccessLabel({ label }: { label: string }) {
  const display = modelAccessProgramLabel(label, label);
  const marker = " · Daybreak";
  const index = display.indexOf(marker);
  if (index < 0) return <>{display}</>;
  const accessRequired = display.endsWith(" (access required)");
  return (
    <span className="inline-flex items-center gap-2">
      <span>{display.slice(0, index)}</span>
      <Badge variant="outline" className="model-daybreak-badge">
        Daybreak
      </Badge>
      {accessRequired && <span className="text-xs text-muted-foreground">access required</span>}
    </span>
  );
}
