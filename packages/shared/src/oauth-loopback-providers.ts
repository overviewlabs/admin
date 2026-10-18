/** Reviewed providers whose sign-in supports a pasted loopback callback. */
export function loopbackOAuthProvider(config: Record<string, unknown> | null | undefined): "robinhood" | "wasabi" | null {
  if (config?.url === "https://agent.robinhood.com/mcp/trading" && config.sourceTemplateKey === "robinhood") return "robinhood";
  if (config?.url === "https://mcp.wasabisys.dev/s3") return "wasabi";
  return null;
}
