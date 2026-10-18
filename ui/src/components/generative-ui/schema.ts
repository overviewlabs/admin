export const MAX_WIDGET_SOURCE = 100_000;
export const MAX_WIDGET_STATEMENTS = 300;
export function allowedLink(value: unknown): string | null {
  const url = value && typeof value === "object" ? (value as {url?:unknown}).url : null;
  if (typeof url !== "string" || url.length > 2000) return null;
  try { const parsed = new URL(url);return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.href : null; } catch {return null;}
}
export function imageSource(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") && !/[\r\n]/.test(value)) return value;
  if (/^data:image\/(?:png|jpeg|webp|gif|avif);base64,[a-z0-9+/=]+$/i.test(value)) return value;
  return allowedLink({url: value});
}
export function sourceError(source: string): string | null {
  if (source.length > MAX_WIDGET_SOURCE) return "This interactive answer is too large. Ask for a smaller visual.";
  if (source.split("\n").length > MAX_WIDGET_STATEMENTS) return "This interactive answer has too many statements. Ask for a smaller visual.";
  if (/^[\s]*[\[{]/.test(source)) return "Use OpenUI Lang component definitions rather than a script bundle.";
  const program = source.replace(/"(?:\\.|[^"\\])*"?/g, '""');
  if (/\b(?:Query|Mutation)\s*\(|@Run\s*\(/.test(program)) return "This visual requests an unavailable browser tool. Ask the agent to supply the data in the conversation.";
  return null;
}
