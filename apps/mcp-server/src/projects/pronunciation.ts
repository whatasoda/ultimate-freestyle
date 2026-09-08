import type { PronunciationEntry, ProjectDocument } from "./schema";

export function effectivePronunciations(
  deckEntries: readonly PronunciationEntry[] | undefined,
  segmentEntries: readonly PronunciationEntry[] | undefined
): PronunciationEntry[] {
  const entries = new Map<string, PronunciationEntry>();
  for (const entry of deckEntries ?? []) entries.set(entry.surface, entry);
  for (const entry of segmentEntries ?? []) entries.set(entry.surface, entry);
  return [...entries.values()].sort((left, right) =>
    [...right.surface].length - [...left.surface].length || left.surface.localeCompare(right.surface, "ja")
  );
}

export function applyPronunciations(
  text: string,
  deckEntries: readonly PronunciationEntry[] | undefined,
  segmentEntries: readonly PronunciationEntry[] | undefined
): string {
  const entries = effectivePronunciations(deckEntries, segmentEntries);
  if (entries.length === 0) return text;
  let result = "";
  for (let index = 0; index < text.length;) {
    const match = entries.find((entry) => text.startsWith(entry.surface, index));
    if (match === undefined) {
      const codePoint = text.codePointAt(index);
      if (codePoint === undefined) break;
      const character = String.fromCodePoint(codePoint);
      result += character;
      index += character.length;
      continue;
    }
    result += match.reading;
    index += match.surface.length;
  }
  return result;
}

export function invalidateAllNarrationAudio(document: ProjectDocument): void {
  for (const slide of document.deck?.slides ?? []) {
    for (const segment of slide.narration?.segments ?? []) segment.audio_src = null;
  }
}
