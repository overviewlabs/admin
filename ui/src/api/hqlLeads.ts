import { api } from "./client";
export const HQL_COMPANY_ID = "6e796ff0-10ed-4c7d-bd6c-10c9386cd30a";
export interface LeadNote { id: string; author: string; text: string; outcome: string; follow_up: string | null; created_at: string }
export interface HqlLead {
  id: string; company: string; domain: string; industry: string; status: string; score: number | null; reviewed_at: string | null; updated_at: string;
  facility: { city: string; state: string; address?: string }; services: string[]; intent: string; why_now: string;
  contact: { name?: string; title?: string; department?: string; phone?: string; phones?: string[]; email?: string; emails?: string[]; path: string; source_url: string; contact_form?: string; retrieved_at?: string };
  evidence: { url: string; fact: string; published_at?: string; retrieved_at: string }[];
  facts?: string[]; inferences?: string[]; unknowns?: string[]; next_action: string; ownership: string; notes: LeadNote[];
  commodity?: string; equipment?: string; lanes?: string[]; freight_evidence?: { url?: string; fact?: string; retrieved_at?: string };
  smb?: { classification?: string; employees?: number | null; employees_max?: number; employee_range?: { min: number; max: number }; employees_basis?: string; annual_revenue_usd?: number | null; major_enterprise_parent?: boolean; source_url?: string; fact?: string; retrieved_at?: string };
  qualification_reason?: string; qualification_issue?: string;
  quality_review?: { sources_reopened?: boolean; verdict_reason?: string; scores?: Record<string, number>; reasons?: Record<string, string> };
}
export interface HqlLeadResult { research_status?: { status: string; detail: string; updated_at: string; last_success_at?: string; next_run_at?: string } | null; leads: HqlLead[]; as_of: string; suppressed: number; pipeline: Record<string, number>; routines: { id: string; title: string; status: string; last_run_at?: string | null; next_run_at?: string | null; last_status?: string | null; detail?: string; cron?: string; timezone?: string; }[] }
export const hqlLeadsApi = {
  list: (company: string) => api.get<HqlLeadResult>(`/companies/${company}/leads`),
  pipeline: (company: string) => api.get<HqlLeadResult>(`/companies/${company}/leads/pipeline`),
  note: (company: string, lead: string, data: { text: string; outcome: string; follow_up: string }) => api.post(`/companies/${company}/leads/${lead}/notes`, data),
};
