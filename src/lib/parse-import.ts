import { lemmaOf } from "./types";

export type ParsedLine = {
  word: string;
  zh?: string;
  invalid?: boolean;
  raw: string;
};

export function parseImportText(text: string): ParsedLine[] {
  return text
    .split(/\r?\n/)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      const parts = raw.split(/\s*[/,|，]\s*/);
      const word = (parts[0] ?? "").trim();
      const zh = parts.slice(1).join(" ").trim() || undefined;
      if (!/^[a-zA-Z][a-zA-Z'\-\s]*$/.test(word) || /^\d+$/.test(word)) {
        return { word, zh, invalid: true, raw };
      }
      return { word, zh, raw };
    });
}

export function uniqueLemmas(lines: ParsedLine[]): ParsedLine[] {
  const seen = new Set<string>();
  const out: ParsedLine[] = [];
  for (const line of lines) {
    const l = lemmaOf(line.word);
    if (seen.has(l)) continue;
    seen.add(l);
    out.push(line);
  }
  return out;
}
