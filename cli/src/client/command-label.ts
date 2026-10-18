export function buildCliCommandLabel(): string {
  const args = process.argv.slice(2);
  return args.length > 0 ? `whoxos ${args.join(" ")}` : "whoxos";
}
