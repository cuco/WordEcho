import { builtinPacks } from "../data/packs";
import legacyExamples from "../data/legacy-new-magic-3-examples.json";
import type { Example, WordRecord } from "../lib/types";
import { lemmaOf } from "../lib/types";
import { db } from "./schema";

const legacy = legacyExamples as Record<string, Record<string, Example[]>>;
const reviewedPacks = builtinPacks.filter((pack) => Object.hasOwn(legacy, pack.id));
const entries = reviewedPacks.flatMap((pack) => pack.words.map((word) => ({
  packId: pack.id,
  lemma: lemmaOf(word.lemma ?? word.word),
  word,
})));

function sameExamples(a: Example[], b: Example[]) {
  return a.length === b.length && a.every((example, i) => example.en === b[i].en && example.zh === b[i].zh);
}

function candidates(word: WordRecord) {
  return entries.filter((entry) => entry.lemma === word.lemma &&
    entry.word.zh === word.meaningZh && entry.word.pos === word.pos &&
    word.sources.some((source) => source.packId === entry.packId));
}

export function isReviewedPack(packId: string) {
  return Object.hasOwn(legacy, packId);
}

export function hasReviewedExamples(word: WordRecord) {
  return candidates(word).some((entry) => sameExamples(word.examples, entry.word.examples));
}

/** Exact old content + source + sense match: never overwrite a custom example. */
export function reviewedExampleUpdate(word: WordRecord): Example[] | undefined {
  if (hasReviewedExamples(word)) return undefined;
  const candidate = candidates(word).find((entry) => !word.examples.length ||
    sameExamples(word.examples, legacy[entry.packId][entry.lemma] ?? []));
  return candidate?.word.examples;
}

/** Reading an existing library repairs examples only, in a words-only transaction. */
export async function repairReviewedExamples(): Promise<WordRecord[]> {
  return db.transaction("rw", db.words, async () => {
    const words = await db.words.toArray();
    for (const word of words) {
      const examples = reviewedExampleUpdate(word);
      if (!examples) continue;
      const patch = { examples, updatedAt: new Date().toISOString() };
      await db.words.update(word.id, patch);
      Object.assign(word, patch);
    }
    return words;
  });
}
