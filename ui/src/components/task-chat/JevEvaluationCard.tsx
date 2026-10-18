import { Link } from "@/lib/router";
import { StatusIcon } from "@/components/StatusIcon";
import { Check, ChevronDown, ChartNoAxesColumnIncreasing, LoaderCircle, ArrowDownWideNarrow } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { DecisionEvaluation } from "@/api/decision-evaluations";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function fraction(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
export function probabilityPercent(value: number) {
  // Preserve small nonzero probabilities instead of falsely displaying zero.
  return value > 0 && value < 0.001 ? "<0.1%" : value < 1 && value > 0.999 ? ">99.9%" : `${Math.round(value * 1000) / 10}%`;
}
type TaskReference = NonNullable<DecisionEvaluation["taskReferences"]>[number];
function TaskLink({ task }: { task: TaskReference }) {
  return <Link to={`/issues/${task.id}`} title={task.title} aria-label={`${task.identifier}: ${task.title}`} className="inline-flex max-w-full items-center gap-1 font-normal underline decoration-muted-foreground underline-offset-2 hover:decoration-foreground" data-mention-kind="issue">
    <StatusIcon status={task.status} size="sm" />{task.identifier}
  </Link>;
}
function linkedText(text: string, references: TaskReference[]) {
  const parts = text.split(/([A-Z][A-Z0-9]*-\d+)/g);
  return parts.map((part, i) => {
    const task = references.find(ref => ref.identifier === part);
    return task ? <TaskLink key={i} task={task} /> : part;
  });
}
function conciseLabel(value: string) {
  if (value.length <= 160) return value;
  const short = value.slice(0, 157);
  return `${short.slice(0, Math.max(short.lastIndexOf(" "), 120))}…`;
}
function ProbabilityBar({ label, value, selected, references = [], detail, expanded, onToggle }: { label: string; value: number; selected?: boolean; references?: TaskReference[]; detail?: string; expanded: boolean; onToggle: () => void }) {
  const panelId = useId();
  return <li className="flex min-w-0 flex-col gap-2">
    <Button variant="ghost" className="h-auto w-full min-w-0 flex-col items-stretch gap-2 whitespace-normal px-2 py-2 text-left font-normal" aria-label={`Explore ${label}`} aria-expanded={expanded} aria-controls={panelId} onClick={onToggle}>
      <span className="flex items-start justify-between gap-3 text-sm">
        <span className="min-w-0 break-words">{label}{selected && <Check className="ml-1 inline size-3 text-primary" aria-label="Selected option" />}</span>
        <span className="flex shrink-0 items-center gap-2"><span className="font-mono tabular-nums">{probabilityPercent(value)}</span><ChevronDown className={`size-3 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden /></span>
      </span>
      <progress className="jev-probability-bar h-2 w-full overflow-hidden rounded-full" max={1} value={value} aria-label={label} aria-valuetext={probabilityPercent(value)} />
    </Button>
    <div id={panelId} hidden={!expanded} className={`${expanded ? "flex" : "hidden"} flex-col gap-2 px-2 pb-2 text-xs text-muted-foreground`}>
      {detail && <p className="whitespace-pre-wrap break-words">{linkedText(detail, references)}</p>}
      {!!references.length && <div className="flex flex-wrap gap-2">{references.map(task => <TaskLink key={task.id} task={task} />)}</div>}
      {!detail && !references.length && <p>No additional criterion was supplied.</p>}
    </div>
  </li>;
}
function Answer({ name, raw, question, references }: { name: string; raw: unknown; question: unknown; references: TaskReference[] }) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [highestFirst, setHighestFirst] = useState(true);
  const answer = record(raw), input = record(question), legend = record(answer.legend), criteria = record(input.criteria);
  const instruction = record(input.instructions);
  const title = typeof input.instructions === "string" ? input.instructions : typeof instruction.question === "string" ? instruction.question : name.replaceAll("_", " ");
  const isNoul = answer.type === "noul";
  const options = Object.entries(record(answer.probabilities));
  const valid = isNoul ? fraction(answer.noul) : ["choice", "score"].includes(String(answer.type)) && options.length > 0 && options.every(([, value]) => fraction(value)) && Math.abs(options.reduce((sum, [, value]) => sum + (value as number), 0) - 1) <= 0.02;
  return <section className="flex min-w-0 flex-col gap-3">
    <h4 className="break-words text-sm font-medium">{linkedText(title, references)}</h4>
    {valid ? <>
      {isNoul && <p className="text-xs text-muted-foreground">Truth score</p>}
      {answer.type === "choice" && options.length > 1 && <Button variant="ghost" size="xs" className="self-end text-muted-foreground" aria-pressed={highestFirst} onClick={() => setHighestFirst(value => !value)}><ArrowDownWideNarrow aria-hidden />{highestFirst ? "Highest first" : "Original order"}</Button>}
      <ul className="flex flex-col gap-1">
        {isNoul ? <ProbabilityBar label="Supports the statement" value={answer.noul as number} expanded={expandedKey === "noul"} onToggle={() => setExpandedKey(value => value === "noul" ? null : "noul")} detail="Truth score for this statement, separate from a distribution over alternative choices." /> : (answer.type === "choice" && highestFirst ? [...options].sort((a, b) => (b[1] as number) - (a[1] as number)) : options).map(([key, value]) => {
          const criterion = Array.isArray(input.criteria) ? input.criteria[Number(key)] : criteria[key];
          const structured = record(criterion);
          const original = typeof structured.label === "string" ? structured.label : typeof legend[key] === "string" ? legend[key] as string : typeof criterion === "string" ? criterion : key;
          const refs = references.filter(ref => original.includes(ref.identifier) || Array.isArray(structured.taskReferences) && structured.taskReferences.some(token => token === ref.id || token === ref.identifier));
          // Legacy receipts retain their exact criterion behind a disclosure;
          // referenced task titles keep the option row readable without changing the model result.
          const label = conciseLabel(typeof criterion === "string" && original.length > 160 && refs.length ? refs.map(ref => ref.title).join(" · ") : original);
          const detail = typeof structured.definition === "string" ? structured.definition : original !== label ? original : undefined;
          return <ProbabilityBar key={key} label={label} detail={detail} references={refs} value={value as number} selected={answer.type === "choice" && answer.choice === key} expanded={expandedKey === key} onToggle={() => setExpandedKey(value => value === key ? null : key)} />;
        })}
      </ul>
      {answer.type === "score" && typeof answer.score === "number" && Number.isFinite(answer.score) && <p className="text-xs text-muted-foreground">Score: <span className="font-mono">{answer.score}</span></p>}
      {fraction(answer.confidence) && <p className="text-xs text-muted-foreground">Confidence: <span className="font-mono">{probabilityPercent(answer.confidence)}</span></p>}
    </> : <p className="text-sm text-muted-foreground">Probabilities unavailable for this result.</p>}
  </section>;
}

export function JevEvaluationCard({ evaluation }: { evaluation: DecisionEvaluation }) {
  const pending = ["queued", "running", "dispatching", "pending"].includes(evaluation.status);
  const answers = record(evaluation.result?.answers), questions = record(evaluation.questions);
  const names = [...new Set([...Object.keys(questions), ...Object.keys(answers)])];
  return <Card className="min-w-0 gap-4 p-4" role="group" aria-label="Jev evaluation" data-testid="jev-evaluation-card" data-evaluation-id={evaluation.evaluationId}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-sm font-medium"><ChartNoAxesColumnIncreasing className="size-4 text-primary" aria-hidden />Jev · Real-Time Decision Engine</div>
      <span className={`text-xs ${evaluation.error ? "text-destructive" : "text-muted-foreground"}`}>{evaluation.status === "succeeded" && evaluation.result ? evaluation.result.model : pending ? "Evaluating" : evaluation.error?.code === "context_too_large" ? "Context too large" : "Failed"}</span>
    </div>
    {evaluation.callerName && <p className="text-xs text-muted-foreground">Used by {evaluation.callerName}</p>}
    {pending ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />Evaluating options…</p>
      : evaluation.status === "succeeded" && evaluation.result && names.length ? <div className="flex flex-col gap-5">{names.map(name => <Answer key={name} name={name} raw={answers[name]} question={questions[name]} references={evaluation.taskReferences ?? []} />)}</div>
      : <p role="status" className="text-sm text-muted-foreground">{evaluation.error?.code === "context_too_large" ? "This evaluation included too much task history. Ask the agent to focus on the relevant evidence and try again." : evaluation.error?.message ?? "Evaluation did not return an answer. No probabilities are available."}</p>}
    {(evaluation.purpose || !!evaluation.taskReferences?.length) && <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer">Evaluation details{evaluation.taskReferences?.length ? ` · ${evaluation.taskReferences.length} tasks` : ""}</summary>
      <div className="flex flex-col gap-2 pt-2">
        {evaluation.purpose && <p className="break-words">{evaluation.purpose}</p>}
        {!!evaluation.taskReferences?.length && <div className="flex flex-wrap gap-2">{evaluation.taskReferences.map(task => <TaskLink key={task.id} task={task} />)}</div>}
        {evaluation.evidenceHash && <p>Referenced task evidence was supplied with this evaluation.</p>}
      </div>
    </details>}
  </Card>;
}
import { useId, useState } from "react";
