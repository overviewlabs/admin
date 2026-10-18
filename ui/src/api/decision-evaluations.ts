import { api } from "./client";

export interface DecisionEvaluation {
  evaluationId: string;
  callerRunId: string;
  callerName: string | null;
  createdAt: string;
  status: string;
  purpose: string | null;
  questions: unknown;
  taskReferences?: Array<{ id: string; identifier: string; title: string; status: string }>;
  evidenceHash?: string | null;
  error?: { code: string; message: string } | null;
  result: { model: string; answers: unknown; usage?: unknown } | null;
}
export interface DecisionEvaluationPage { items: DecisionEvaluation[]; nextCursor: string | null }
export const decisionEvaluationsApi = {
  list: (issueId: string, cursor?: string) => api.get<DecisionEvaluationPage>(
    `/issues/${issueId}/decision-evaluations${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
  ),
};
