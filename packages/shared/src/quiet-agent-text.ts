/** Presentation only: retain original messages and run logs for auditing. */
export function stripSkillAnnouncements(text: string, streaming = false): string {
  const usePrefix = /^(?:(?:i|we)(?:['’](?:m|re|ll)|\s+(?:am|are|will))?\s+(?:(?:now|also)\s+)?(?:use|using|apply|applying|follow|following|load|loading|invoke|invoking|select|selecting|activate|activating)\b|(?:using|applying|following|loading|invoking|activating)\b|skills?\s+(?:in use|selected)\s*:)/i;
  let changed = false;
  const clean = (block: string, trailing: boolean) => {
    const sentences = block.match(/[\s\S]+?(?:[.!?](?=\s|$)|$)/g) ?? [block];
    const kept = sentences.filter((sentence, sentenceIndex) => {
      const plain = sentence.replace(/^\s*(?:(?:[-*+] |\d+[.)] )|#{1,6} )?/, "").replace(/[*_`]/g, "").trim();
      if (!usePrefix.test(plain)) return true;
      const announcement = /\bskills?\b/i.test(plain);
      // Hold ambiguous trailing announcements while they are still streaming.
      const partial = streaming && trailing && sentenceIndex === sentences.length - 1 && !/[.!?]$/.test(plain);
      if (announcement || partial) { changed = true; return false; }
      return true;
    });
    return kept.length === sentences.length ? block : kept.join("").trimStart();
  };
  let fence: string | undefined;
  let buffer = "";
  let result = "";
  for (const line of text.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    const protectedLine = fence || marker || /^(?:\s*>| {4}|\t)/.test(line);
    if (protectedLine) {
      result += clean(buffer, false) + line;
      buffer = "";
    } else if (!line.trim()) {
      const cleaned = clean(buffer, false);
      result += cleaned;
      if (!buffer.trim() || cleaned.trim()) result += line;
      buffer = "";
    } else buffer += line;
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = undefined;
    }
  }
  result += clean(buffer, true);
  return changed ? result : text;
}
