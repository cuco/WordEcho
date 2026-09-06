import { dictCoreWords } from "../data/dict-core";
import { ensureDictLookup, lookupDictWord } from "../data/dict-lookup";
import { builtinPacks } from "../data/packs";
import { enrichWordsWithAi } from "../lib/ai-enrich";
import { resolveWord } from "../lib/resolve-word";
import { newReview } from "../lib/srs";
import type { UserPrefs, WordPack, WordRecord, WordSource } from "../lib/types";
import { lemmaOf, todayLocal, uuid } from "../lib/types";
import { db, getPrefs } from "./schema";

export async function allWords(): Promise<WordRecord[]> {
  return db.words.toArray();
}

function packSource(pack: WordPack, unit: string): WordSource {
  return {
    kind: "pack",
    packId: pack.id,
    grade: pack.grade,
    volume: pack.volume,
    unit,
  };
}

export async function importPack(pack: WordPack): Promise<{ added: number; merged: number }> {
  const today = todayLocal();
  let added = 0;
  let merged = 0;
  const now = new Date().toISOString();
  await db.transaction("rw", db.words, db.reviews, async () => {
    for (const pw of pack.words) {
      const lemma = lemmaOf(pw.lemma ?? pw.word);
      const existing = await db.words.where("lemma").equals(lemma).first();
      const src = packSource(pack, pw.unit);
      if (existing) {
        const sources = existing.sources.some(
          (s) => s.packId === pack.id && s.unit === pw.unit,
        )
          ? existing.sources
          : [...existing.sources, src];
        const staleExample =
          !existing.examples.length ||
          /^this is\b/i.test(existing.examples[0]?.en ?? "") ||
          (existing.examples[0]?.zh ?? "").includes("「");
        const staleZh = /性交|[A-Za-z]\./.test(existing.meaningZh);
        await db.words.put({
          ...existing,
          sources,
          updatedAt: now,
          enrichStatus: existing.meaningZh ? existing.enrichStatus : "complete",
          meaningZh: staleZh || !existing.meaningZh ? pw.zh : existing.meaningZh,
          ipa: existing.ipa || pw.ipa,
          examples: staleExample ? pw.examples : existing.examples,
        });
        merged += 1;
        continue;
      }
      const id = uuid();
      await db.words.add({
        id,
        lemma,
        display: pw.word,
        ipa: pw.ipa,
        meaningZh: pw.zh,
        pos: pw.pos,
        examples: pw.examples,
        sources: [src],
        enrichStatus: "complete",
        createdAt: now,
        updatedAt: now,
      });
      await db.reviews.put(newReview(id, today));
      added += 1;
    }
  });
  return { added, merged };
}

export async function importedPackIds(): Promise<string[]> {
  const words = await db.words.toArray();
  return [...new Set(words.flatMap((w) => w.sources.map((s) => s.packId).filter(Boolean)))] as string[];
}

export async function saveResolved(
  resolved: Awaited<ReturnType<typeof resolveWord>>,
  source: WordSource,
): Promise<WordRecord> {
  const today = todayLocal();
  const now = new Date().toISOString();
  const existing = await db.words.where("lemma").equals(resolved.lemma).first();
  if (existing) {
    const sources = existing.sources.some(
      (s) => s.kind === source.kind && s.note === source.note,
    )
      ? existing.sources
      : [...existing.sources, source];
    const next: WordRecord = {
      ...existing,
      sources,
      meaningZh: resolved.meaningZh || existing.meaningZh,
      ipa: resolved.ipa ?? existing.ipa,
      pos: resolved.pos ?? existing.pos,
      examples: resolved.examples.length ? resolved.examples : existing.examples,
      enrichStatus: resolved.enrichStatus,
      updatedAt: now,
    };
    await db.words.put(next);
    return next;
  }
  const rec: WordRecord = {
    id: uuid(),
    lemma: resolved.lemma,
    display: resolved.display,
    ipa: resolved.ipa,
    meaningZh: resolved.meaningZh,
    pos: resolved.pos,
    examples: resolved.examples,
    sources: [source],
    enrichStatus: resolved.enrichStatus,
    createdAt: now,
    updatedAt: now,
  };
  await db.words.add(rec);
  await db.reviews.put(newReview(rec.id, today));
  return rec;
}

export async function resolveMany(lemmas: { word: string; zh?: string }[], source: WordSource) {
  const prefs = await getPrefs();
  const local = await allWords();
  const ai =
    prefs.aiApiKey && prefs.aiBaseUrl && prefs.aiModel
      ? (ws: string[]) =>
          enrichWordsWithAi(ws, {
            baseUrl: prefs.aiBaseUrl!,
            apiKey: prefs.aiApiKey!,
            model: prefs.aiModel!,
          })
      : undefined;
  await ensureDictLookup();
  const out: WordRecord[] = [];
  for (const row of lemmas) {
    const resolved = await resolveWord(
      row.word,
      { local, dictCore: dictCoreWords, packs: builtinPacks, dictLookup: lookupDictWord },
      ai,
      row.zh,
    );
    out.push(await saveResolved(resolved, source));
  }
  return out;
}

export async function exportBackup(includeKey: boolean) {
  const prefs = await getPrefs();
  const { aiApiKey, ...rest } = prefs;
  return {
    words: await db.words.toArray(),
    reviews: await db.reviews.toArray(),
    sessions: await db.sessions.toArray(),
    items: await db.items.toArray(),
    prefs: includeKey ? prefs : { ...rest, aiApiKey: includeKey ? aiApiKey : undefined },
  };
}

export async function importBackup(data: {
  words?: WordRecord[];
  reviews?: import("../lib/types").ReviewState[];
  sessions?: import("../lib/types").QuizSession[];
  items?: import("../lib/types").QuizItem[];
  prefs?: UserPrefs;
}) {
  await db.transaction("rw", db.words, db.reviews, db.sessions, db.items, db.prefs, async () => {
    if (data.words) {
      await db.words.clear();
      await db.words.bulkAdd(data.words);
    }
    if (data.reviews) {
      await db.reviews.clear();
      await db.reviews.bulkAdd(data.reviews);
    }
    if (data.sessions) {
      await db.sessions.clear();
      await db.sessions.bulkAdd(data.sessions);
    }
    if (data.items) {
      await db.items.clear();
      await db.items.bulkAdd(data.items);
    }
    if (data.prefs) await db.prefs.put({ ...data.prefs, id: "prefs" });
  });
}
