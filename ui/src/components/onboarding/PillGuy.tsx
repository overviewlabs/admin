import { BloubAgent } from "../BloubAgent";

/** Compatibility entry point shared by onboarding, agent creation and profiles. */
export function PillGuy({ state, className }: {
  state: "dormant" | "alive";
  className?: string;
}) {
  return <BloubAgent status={state} className={className} />;
}
