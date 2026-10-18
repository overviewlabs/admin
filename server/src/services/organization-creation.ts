import type { Request } from "express";
import { forbidden } from "../errors.js";
import { isCloudManagedInstance } from "./cloud-instance.js";

/** A configured account ID is exclusive, including against other instance admins. */
export function canCreateOrganization(req: Pick<Request, "actor">): boolean {
  if (req.actor.type !== "board" || isCloudManagedInstance()) return false;
  const creatorId = process.env.WHOXOS_ORGANIZATION_CREATOR_USER_ID?.trim();
  if (creatorId) return req.actor.userId === creatorId;
  return req.actor.source === "local_implicit" || req.actor.isInstanceAdmin === true;
}

export function assertOrganizationCreationAllowed(req: Pick<Request, "actor">) {
  if (!canCreateOrganization(req)) {
    throw forbidden(process.env.WHOXOS_ORGANIZATION_CREATOR_USER_ID?.trim()
      ? "Only the WHOXOS instance owner can create organizations"
      : "Instance admin required");
  }
}
