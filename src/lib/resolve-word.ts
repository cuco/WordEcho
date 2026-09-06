import type { DictCoreWord, DictLookupWord, ResolvedWord, WordPack, WordRecord } from "./types";
import { lemmaOf } from "./types";

export type ResolveLookup = {
  local: WordRecord[];
  dictCore: DictCoreWord[];
  packs: WordPack[];
  /** Optional offline lookup dict (query-only; not a study bank). */
  dictLookup?: (lemma: string) => DictLookupWord | null;
};

export type AiEnrichFn = (lemmas: string[]) => Promise<
  {
    lemma: string;
    ipa: string;
    pos: string;
    meaningZh: string;
    examples: { en: string; zh: string }[];
  }[]
>;

function fromLocal(local: WordRecord): ResolvedWord {
  return {
    lemma: local.lemma,
    display: local.display,
    ipa: local.ipa,
    meaningZh: local.meaningZh,
    pos: local.pos,
    examples: local.examples,
    enrichStatus: local.enrichStatus,
    source: "local",
  };
}

/** Offline sources excluding IndexedDB (dict-core → pack → dict-lookup). */
export function lookupReference(
  lemma: string,
  lookup: ResolveLookup,
  displayHint?: string,
): ResolvedWord | null {
  const dict = lookup.dictCore.find((w) => w.lemma === lemma);
  if (dict) {
    return {
      lemma: dict.lemma,
      display: dict.display,
      ipa: dict.ipa,
      meaningZh: dict.zh,
      pos: dict.pos,
      examples: dict.examples,
      enrichStatus: "complete",
      source: "dict-core",
    };
  }
  for (const pack of lookup.packs) {
    const pw = pack.words.find((w) => lemmaOf(w.lemma ?? w.word) === lemma);
    if (pw) {
      return {
        lemma,
        display: pw.word,
        ipa: pw.ipa,
        meaningZh: pw.zh,
        pos: pw.pos,
        examples: pw.examples,
        enrichStatus: "complete",
        source: "pack",
      };
    }
  }
  const fromLookup = lookup.dictLookup?.(lemma);
  if (fromLookup?.zh) {
    return {
      lemma,
      display: displayHint ?? lemma,
      ipa: fromLookup.ipa || null,
      meaningZh: fromLookup.zh,
      pos: fromLookup.pos || null,
      examples: [],
      enrichStatus: "complete",
      source: "dict-lookup",
    };
  }
  return null;
}

export function lookupOffline(
  lemma: string,
  lookup: ResolveLookup,
  displayHint?: string,
): ResolvedWord | null {
  const local = lookup.local.find((w) => w.lemma === lemma);
  if (local?.enrichStatus === "complete" && local.meaningZh) {
    return fromLocal(local);
  }
  const ref = lookupReference(lemma, lookup, displayHint);
  if (ref) return ref;
  if (local) return fromLocal(local);
  return null;
}

export async function resolveWord(
  lemmaRaw: string,
  lookup: ResolveLookup,
  ai?: AiEnrichFn,
  inlineZh?: string,
): Promise<ResolvedWord> {
  const lemma = lemmaOf(lemmaRaw);
  const display = lemmaRaw.trim() || lemma;
  const offline = lookupOffline(lemma, lookup, display);

  if (inlineZh) {
    return {
      lemma,
      display: offline?.display ?? display,
      ipa: offline?.ipa ?? null,
      meaningZh: inlineZh,
      pos: offline?.pos ?? null,
      examples: offline?.examples ?? [],
      enrichStatus: "complete",
      source: offline ? offline.source : "inline",
    };
  }

  if (offline && offline.enrichStatus === "complete" && offline.meaningZh) {
    return offline;
  }

  if (ai) {
    try {
      const rows = await ai([lemma]);
      const row = rows.find((r) => lemmaOf(r.lemma) === lemma) ?? rows[0];
      if (row?.meaningZh) {
        return {
          lemma,
          display,
          ipa: row.ipa ?? null,
          meaningZh: row.meaningZh,
          pos: row.pos,
          examples: row.examples ?? [],
          enrichStatus: "complete",
          source: "ai",
        };
      }
    } catch {
      return {
        lemma,
        display,
        ipa: null,
        meaningZh: "",
        pos: null,
        examples: [],
        enrichStatus: "failed",
        source: "ai",
      };
    }
  }

  return {
    lemma,
    display,
    ipa: offline?.ipa ?? null,
    meaningZh: offline?.meaningZh ?? "",
    pos: offline?.pos ?? null,
    examples: offline?.examples ?? [],
    enrichStatus: "pending",
    source: offline?.source ?? "local",
  };
}
