import { inviteRecipientEmail, normalizeInviteEmail } from "../services/invite-recipient.js";
import { createHash } from "node:crypto";
import type { RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { invites, type Db } from "@whoxos/db";

/** Registration requires possession of an active human invitation, not a Referer. */
export function inviteOnlySignup(db: Db): RequestHandler {
  return async (req, res, next) => {
    if (!req.path.toLowerCase().startsWith("/sign-up")) return next();
    const deny = () => res.status(403).json({
      code: "INVITATION_REQUIRED",
      message: "Account creation requires a valid invitation. Open your invitation link to continue.",
    });
    const token = req.body?.inviteToken;
    if (req.method !== "POST" || req.path !== "/sign-up/email" ||
        typeof token !== "string" || token.length < 16 || token.length > 256) {
      deny();
      return;
    }
    try {
      const [invite] = await db.select().from(invites)
        .where(eq(invites.tokenHash, createHash("sha256").update(token).digest("hex")));
      if (!invite || invite.revokedAt || invite.acceptedAt ||
          invite.expiresAt.getTime() <= Date.now() ||
          !["human", "both"].includes(invite.allowedJoinTypes) ||
          !["company_join", "bootstrap_ceo"].includes(invite.inviteType)) {
        deny();
        return;
      }
      const recipient = inviteRecipientEmail(invite);
      if (recipient && normalizeInviteEmail(req.body?.email) !== recipient) {
        res.status(403).json({ code: "INVITE_EMAIL_MISMATCH", message: "Use the email address this invitation was sent to." });
        return;
      }
      if (recipient) req.body.email = recipient;
      next();
    } catch (error) {
      next(error);
    }
  };
}
