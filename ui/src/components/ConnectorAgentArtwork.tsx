import { BloubAgent } from "./BloubAgent";

/** Uses the same animated avatars as the product, so the artwork stays current. */
export function ConnectorAgentArtwork() {
  return (
    <div className="connector-agent-art flex h-full w-full items-center justify-center gap-2 overflow-hidden" role="img" aria-label="Mint and rose Bloub agents with Gmail, Notion, GitHub, Linear, and Slack connectors">
      {[{ variant: "bot", apps: ["gmail", "notion"] }, { variant: "cpu", apps: ["github", "linear", "slack"] }].map(({ variant, apps }) => (
        <div key={variant} className="relative flex h-full w-1/2 flex-col items-center" aria-hidden="true">
          <BloubAgent variant={variant} />
          <div className="connector-agent-logos absolute bottom-2 flex gap-1">
            {apps.map((app, i) => (
              <div key={app} className={`connector-agent-logo flex items-center justify-center rounded-md p-1.5 shadow-sm ${i % 2 ? "rotate-6" : "-rotate-6"}`}>
                <img src={`/brands/apps/${app}.svg`} alt="" className="size-full object-contain" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
