import type { DictLookup, DictLookupWord } from "../lib/types";

const lemmaIndex = new Map<string, DictLookupWord>();
const formIndex = new Map<string, string>();

let loadPromise: Promise<void> | null = null;
let loaded = false;

function buildIndexes(data: DictLookup) {
  lemmaIndex.clear();
  formIndex.clear();
  for (const [lemma, [ipa, pos, zh]] of Object.entries(data.w)) {
    lemmaIndex.set(lemma, { lemma, display: lemma, ipa, pos, zh });
  }
  for (const [form, lemma] of Object.entries(data.f)) {
    formIndex.set(form, lemma);
  }
  loaded = true;
}

/** Lazily load and index dict-lookup.json (query-only; not for quiz). */
export function ensureDictLookup(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (!loadPromise) {
    loadPromise = import("./dict-lookup.json").then((mod) => {
      buildIndexes(mod.default as unknown as DictLookup);
    });
  }
  return loadPromise;
}

export function isDictLookupReady(): boolean {
  return loaded;
}

/** Exact lemma or inflection → entry. Returns null if not loaded yet. */
export function lookupDictWord(lemma: string): DictLookupWord | null {
  if (!loaded) return null;
  const direct = lemmaIndex.get(lemma);
  if (direct) return direct;
  const base = formIndex.get(lemma);
  if (!base) return null;
  return lemmaIndex.get(base) ?? null;
}
