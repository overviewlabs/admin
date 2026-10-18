export function parseStdoutLine(line, ts) {
  try {
    const value = JSON.parse(line);
    if (value.type === "jev.result" && typeof value.text === "string") {
      return [{ kind: "assistant", ts, text: value.text, channel: "final" }];
    }
  } catch { /* Non-result lines use the standard run log presentation. */ }
  return [{ kind: "stdout", ts, text: line }];
}
