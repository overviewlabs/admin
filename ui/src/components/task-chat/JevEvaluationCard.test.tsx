// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DecisionEvaluation } from "@/api/decision-evaluations";
import { JevEvaluationCard } from "./JevEvaluationCard";

vi.mock("@/lib/router", () => ({ Link: ({ to, children, ...props }: any) => <a href={to} {...props}>{children}</a> }));

let container: HTMLDivElement, root: Root;
const evaluation: DecisionEvaluation = {
  evaluationId: "receipt", callerRunId: "caller", callerName: "Engineering", createdAt: "2026-10-06T12:00:00Z", status: "succeeded", purpose: "Route this request", questions: {
    team: { type: "choice", instructions: "Which team should handle this?", criteria: { technical: "Technical support", billing: "Billing" } },
  }, result: { model: "jev-1.13.0", answers: { team: { type: "choice", choice: "technical", confidence: 0.9, probabilities: { technical: 0.78, billing: 0.22 } } } },
};
const render = async (value: DecisionEvaluation) => act(async () => { root.render(<JevEvaluationCard evaluation={value} />); });
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
describe("Jev probability card", () => {
  it("expands option evidence on click and keeps only one option expanded", async () => {
    await render({ ...evaluation, questions: { team: { instructions: "Which team?", criteria: { technical: { label: "Technical support", definition: "Fix the confirmed integration failure" }, billing: { label: "Billing", definition: "Resolve the disputed charge" } } } } });
    const options = [...container.querySelectorAll('button[aria-expanded]')] as HTMLButtonElement[];
    expect(options.map(button => button.getAttribute("aria-expanded"))).toEqual(["false", "false"]);
    await act(async () => options[0].click());
    expect(options[0].getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(options[0].getAttribute("aria-controls")!)?.hidden).toBe(false);
    await act(async () => options[1].click());
    expect(options.map(button => button.getAttribute("aria-expanded"))).toEqual(["false", "true"]);
    expect([...container.querySelectorAll("progress")].map(bar => bar.value)).toEqual([0.78, 0.22]);
  });
  it("changes choice order without changing its actual probabilities", async () => {
    await render({ ...evaluation, result: { model: "jev-1.13.0", answers: { team: { type: "choice", choice: "billing", confidence: 0.8, probabilities: { technical: 0.22, billing: 0.78 } } } } });
    expect([...container.querySelectorAll("progress")].map(bar => bar.getAttribute("aria-label"))).toEqual(["Billing", "Technical support"]);
    await act(async () => (container.querySelector('button[aria-pressed]') as HTMLButtonElement).click());
    expect([...container.querySelectorAll("progress")].map(bar => bar.value)).toEqual([0.22, 0.78]);
  });
  it("shows actionable context errors and never renders stale failed answers", async () => {
    await render({ ...evaluation, status: "failed", error: { code: "context_too_large", message: "Too much task context. Select relevant evidence." } });
    expect(container.textContent).toContain("Context too large");
    expect(container.textContent).toContain("focus on the relevant evidence");
    expect(container.querySelectorAll("progress")).toHaveLength(0);
  });
  it("shows actual option probabilities with accessible bars and separate confidence", async () => {
    await render(evaluation);
    expect(container.textContent).toContain("Used by Engineering");
    expect(container.textContent).toContain("Technical support");
    expect(container.textContent).toContain("78%"); expect(container.textContent).toContain("22%");
    expect(container.textContent).toContain("Confidence: 90%");
    expect([...container.querySelectorAll("progress")].map(bar => [bar.value, bar.max, bar.getAttribute("aria-label")])).toEqual([[0.78, 1, "Technical support"], [0.22, 1, "Billing"]]);
  });
  it("updates the same receipt from pending to complete without duplicate cards", async () => {
    await render({ ...evaluation, status: "running", result: null });
    expect(container.textContent).toContain("Evaluating options"); expect(container.querySelectorAll("progress")).toHaveLength(0);
    await render(evaluation);
    expect(container.querySelectorAll('[data-testid="jev-evaluation-card"]')).toHaveLength(1);
    expect(container.textContent).not.toContain("Evaluating options");
    expect(container.querySelectorAll("progress")).toHaveLength(2);
  });
  it("renders Score options using their legend without confusing the score with probability", async () => {
    await render({ ...evaluation, questions: {}, result: { model: "jev-latest", answers: { urgency: { type: "score", score: 1.25, confidence: 0.8, legend: { "0": "Calm", "1": "Urgent", "2": "Critical" }, probabilities: { "0": 0, "1": 0.75, "2": 0.25 } } } } });
    expect([...container.querySelectorAll("progress")].map(bar => bar.getAttribute("aria-label"))).toEqual(["Calm", "Urgent", "Critical"]);
    expect(container.textContent).toContain("Score: 1.25"); expect(container.textContent).toContain("0%");
  });
  it("labels Noul as a truth score without inventing an alternative distribution", async () => {
    await render({ ...evaluation, questions: {}, result: { model: "jev-latest", answers: { urgent: { type: "noul", noul: 0.99 } } } });
    expect(container.textContent).toContain("Truth score"); expect(container.textContent).toContain("99%");
    expect(container.querySelectorAll("progress")).toHaveLength(1); expect(container.textContent).not.toContain("Confidence");
  });
  it.each([null, { type: "choice", probabilities: { x: -0.1, y: 1.1 } }, { type: "choice", probabilities: { x: 0.2 } }, { type: "noul", noul: "0.9" }])("never fabricates bars for missing or invalid answers", async answer => {
    await render({ ...evaluation, result: { model: "jev-latest", answers: { team: answer } } });
    expect(container.querySelectorAll("progress")).toHaveLength(0); expect(container.textContent).toContain("Probabilities unavailable");
  });
  it("does not render stale answers from a failed evaluation", async () => {
    await render({ ...evaluation, status: "failed", result: null });
    expect(container.textContent).toContain("No probabilities are available"); expect(container.querySelectorAll("progress")).toHaveLength(0);
  });
  it("keeps small probabilities visible and renders criterion text safely", async () => {
    await render({ ...evaluation, questions: { team: { instructions: "<script>unsafe</script>", criteria: { technical: "<img src=x onerror=alert(1)>", billing: "Other" } } }, result: { model: "jev-latest", answers: { team: { type: "choice", probabilities: { technical: 0.00001, billing: 0.99999 } } } } });
    expect(container.textContent).toContain("<0.1%"); expect(container.textContent).toContain(">99.9%");
    expect(container.querySelector("script, img")).toBeNull();
  });
});


it("keeps labels concise and uses native task links without displaying discussion as options", async () => {
  await render({ ...evaluation, taskReferences: [{ id: "task-id", identifier: "TASK-501", title: "Release verification", status: "blocked" }], evidenceHash: "snapshot-hash", questions: { team: { instructions: { question: "Which focus addresses the observed release discrepancy?" }, criteria: { technical: { label: "Reconcile the release", definition: "Address observed release discrepancies", taskReferences: ["TASK-501"] }, billing: { label: "Gather missing evidence" } } } } });
  expect(container.textContent).toContain("Reconcile the release");
  expect(container.querySelector('a[href="/issues/task-id"]')?.textContent).toContain("TASK-501");
  expect(container.querySelector('a[href="/issues/task-id"]')?.getAttribute("title")).toBe("Release verification");
  expect(container.querySelector("progress")?.getAttribute("aria-label")).toBe("Reconcile the release");
  expect(container.textContent).toContain("Which focus addresses the observed release discrepancy?");
});
