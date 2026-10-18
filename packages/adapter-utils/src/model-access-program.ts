/** The requested program is a model default, never an access grant. */
export function isDaybreakBlueDefault(model: string | null | undefined): boolean {
  return model?.trim() === "gpt-6-sol";
}

/** Hide standalone program aliases without disabling existing configurations. */
export function isStandaloneDaybreakModel(model: string): boolean {
  return /^gpt-daybreak-(blue|red)(?:-|$)/i.test(model.trim().split("/").at(-1) ?? "");
}

export function modelAccessProgramLabel(model: string, label = model, verified = false): string {
  if (!isDaybreakBlueDefault(model)) return label;
  return `GPT-6 Sol · Daybreak${verified ? "" : " (access required)"}`;
}
