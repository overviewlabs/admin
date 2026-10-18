import { forbidden } from "../errors.js";

/** Server-owned invitation metadata. Never infer the recipient from the accepting request. */
export function normalizeInviteEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function inviteRecipientEmail(invite: { defaultsPayload: Record<string, unknown> | null }): string | null {
  const defaults = invite.defaultsPayload;
  if (!defaults || !Object.hasOwn(defaults, "recipientEmail")) return null;
  const email = normalizeInviteEmail(defaults.recipientEmail);
  // Corrupt bindings must never turn into shareable invitations.
  if (!email) throw forbidden("This invitation has an invalid recipient. Request a new invitation.");
  return email;
}

export function bindInviteRecipient(defaults: Record<string, unknown> | null, recipient: string | null | undefined) {
  const result = { ...defaults };
  delete result.recipientEmail;
  if (recipient != null) {
    const email = normalizeInviteEmail(recipient);
    if (!email) throw forbidden("Invalid invitation recipient");
    result.recipientEmail = email;
  }
  return Object.keys(result).length ? result : null;
}

export function assertInviteRecipient(invite: { defaultsPayload: Record<string, unknown> | null }, email: unknown) {
  const recipient = inviteRecipientEmail(invite);
  if (recipient && recipient !== normalizeInviteEmail(email)) {
    throw forbidden("This invitation belongs to a different email address. Sign in with the invited email to continue.");
  }
}
