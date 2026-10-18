import pc from "picocolors";

const WHOX_ART = ["  WHOXOS"];

const TAGLINE = "The app people use to manage AI agents for work";

export function printWHOXOSCliBanner(): void {
  const lines = [
    "",
    ...WHOX_ART.map((line) => pc.cyan(line)),
    pc.blue("  ───────────────────────────────────────────────────────"),
    pc.bold(pc.white(`  ${TAGLINE}`)),
    "",
  ];

  console.log(lines.join("\n"));
}
