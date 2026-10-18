import { describe, expect, it } from "vitest";
import { PERMISSION_KEYS } from "@whoxos/shared";
import {
  agentJoinGrantsFromDefaults,
  humanJoinGrantsFromDefaults,
} from "../services/invite-grants.js";
import {
  grantsForHumanRole,
  normalizeHumanRole,
  resolveHumanInviteRole,
} from "../services/company-member-roles.js";

describe("agentJoinGrantsFromDefaults", () => {
  it("adds tasks:assign when invite defaults do not specify agent grants", () => {
    expect(agentJoinGrantsFromDefaults(null)).toEqual([
      {
        permissionKey: "tasks:assign",
        scope: null,
      },
    ]);
  });

  it("preserves invite agent grants and appends tasks:assign", () => {
    expect(
      agentJoinGrantsFromDefaults({
        agent: {
          grants: [
            {
              permissionKey: "agents:create",
              scope: null,
            },
          ],
        },
      }),
    ).toEqual([
      {
        permissionKey: "agents:create",
        scope: null,
      },
      {
        permissionKey: "tasks:assign",
        scope: null,
      },
    ]);
  });

  it("does not duplicate tasks:assign when invite defaults already include it", () => {
    expect(
      agentJoinGrantsFromDefaults({
        agent: {
          grants: [
            {
              permissionKey: "tasks:assign",
              scope: { projectId: "project-1" },
            },
          ],
        },
      }),
    ).toEqual([
      {
        permissionKey: "tasks:assign",
        scope: { projectId: "project-1" },
      },
    ]);
  });
});

describe("human invite roles", () => {
  it.each(["owner", "admin"] as const)("maps %s to every company permission", (role) => {
    expect(grantsForHumanRole(role)).toEqual(
      PERMISSION_KEYS.map((permissionKey) => ({ permissionKey, scope: null })),
    );
  });

  it("defaults legacy or missing roles to operator", () => {
    expect(normalizeHumanRole("member")).toBe("operator");
    expect(resolveHumanInviteRole(null)).toBe("operator");
  });

  it("reads the configured human invite role from defaults", () => {
    expect(
      resolveHumanInviteRole({
        human: {
          role: "viewer",
        },
      }),
    ).toBe("viewer");
  });

  it("falls back to role grants when human invite defaults omit explicit grants", () => {
    expect(humanJoinGrantsFromDefaults(null, "operator")).toEqual([
      { permissionKey: "tasks:assign", scope: null },
    ]);
  });

  it("preserves explicit human invite grants", () => {
    expect(
      humanJoinGrantsFromDefaults(
        {
          human: {
            grants: [
              {
                permissionKey: "users:invite",
                scope: { companyId: "company-1" },
              },
            ],
          },
        },
        "operator",
      ),
    ).toEqual([
      {
        permissionKey: "users:invite",
        scope: { companyId: "company-1" },
      },
    ]);
  });
});
