import { z } from "zod";

export const TREASURY_COMPANY_ID = "0d8aad87-64f2-4f9c-a92c-94a261e140f7";
const cents = z.number().int().min(1).max(1_000_000_000);
export const treasuryLimitsSchema = z.object({
  currency: z.literal("USD"),
  totalCapitalCents: cents,
  maximumTradeCents: cents,
  dailyLossLimitCents: cents,
  permittedAssetClasses: z.array(z.enum(["equity", "option"])).min(1).max(2)
    .transform((values) => [...new Set(values)].sort()),
  permittedSymbols: z.array(z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9.-]{0,15}$/)).min(1).max(100)
    .transform((values) => [...new Set(values)].sort()),
}).strict().superRefine((value, ctx) => {
  for (const field of ["maximumTradeCents", "dailyLossLimitCents"] as const) {
    if (value[field] > value.totalCapitalCents) ctx.addIssue({ code: "custom", path: [field], message: "Must not exceed your total capital allocation" });
  }
});
export const saveTreasurySettingsSchema = z.object({
  expectedRevision: z.string().uuid().nullable(),
  limits: treasuryLimitsSchema,
}).strict();
export type TreasuryLimits = z.infer<typeof treasuryLimitsSchema>;
export interface TreasurySettings {
  companyId: string;
  userId: string;
  revision: string | null;
  limits: TreasuryLimits | null;
  updatedAt: string | null;
  liveEnabled: false;
}
