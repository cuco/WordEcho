import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { builtinPacks } from "../data/packs";
import legacyExamples from "../data/legacy-new-magic-3-examples.json";
import type { Example, WordPack, WordRecord } from "../lib/types";
import { lemmaOf } from "../lib/types";
import { newReview } from "../lib/srs";
import { db, defaultPrefs } from "./schema";
import { allWords, importPack } from "./repo";
import { loadSession } from "./session";

const legacy = legacyExamples as Record<string, Record<string, Example[]>>;
const packs = builtinPacks.filter(p => Object.hasOwn(legacy, p.id));
function oldWord(pack: WordPack, lemma: string): WordRecord {
  const w = pack.words.find(w => lemmaOf(w.lemma ?? w.word) === lemma)!;
  return { id: `${pack.id}:${lemma}`, lemma, display: w.word, meaningZh: w.zh, pos: w.pos,
    ipa: w.ipa, examples: legacy[pack.id][lemma], sources: [{ kind: "pack", packId: pack.id, unit: w.unit }],
    enrichStatus: "complete", createdAt: "2026-09-01", updatedAt: "2026-09-01" };
}
beforeEach(async () => {
  await Promise.all(db.tables.map(table => table.clear()));
});

describe("reviewed New Magic 3 examples", () => {
  it("keeps all 270 reviewed bilingual sentences in both packs and generator inputs", () => {
    expect(packs.map(p => p.words.length)).toEqual([142, 128]);
    for (const pack of packs) {
      const rows = readFileSync(`src/data/wordlists/${pack.id}.txt`, "utf8").split(/\r?\n/)
        .filter(l => l.trim() && !l.startsWith("#")).map(l => l.split("\t"));
      // The generator keeps the first lemma: may (permission) precedes May (month).
      expect(new Set(rows.map(row => lemmaOf(row[0]))).size).toBe(pack.words.length);
      for (const word of pack.words) {
        const row = rows.find(row => lemmaOf(row[0]) === word.lemma && row[2] === word.zh && row[3] === word.pos)!;
        expect(word.examples).toEqual([{ en: row[4], zh: row[5] }]);
        const example = word.examples[0];
        expect(example.en.split(/\s+/).length).toBeLessThanOrEqual(10);
        expect(example.en).toMatch(/[.!?]$/);
        expect(example.zh).toMatch(/\p{Script=Han}/u);
        expect(example.zh).toMatch(/[。！？]$/);
        expect(example.zh).not.toMatch(/「|」/);
        // A possessive is required in the natural collocation "give our seats".
        const target = word.lemma === "give seats" ? "give our seats" : word.word.toLowerCase();
        expect(example.en.toLowerCase()).toContain(target);
      }
    }
  });

  it("repairs every legacy entry once while preserving learning and reward data", async () => {
    const original = packs.flatMap(p => p.words.map(w => oldWord(p, lemmaOf(w.lemma ?? w.word))));
    await db.words.bulkAdd(original);
    await db.reviews.bulkAdd(original.map(w => ({ ...newReview(w.id, "2026-09-14"), repetitions: 4, intervalDays: 16 })));
    await db.prefs.put({ ...defaultPrefs(), xpTotal: 350, xpToday: 30 });
    await db.redemptions.add({ rewardId: "saved-sticker", cost: 100, redeemedAt: "2026-09-12" });
    await db.sessions.add({ id: "saved", date: "2026-09-13", itemIds: [], currentIndex: 0, finishedAt: null, xpEarned: 30 });
    const before = await Promise.all([db.reviews.toArray(), db.prefs.toArray(), db.redemptions.toArray(), db.sessions.toArray(), db.items.toArray()]);
    const repaired = await allWords();
    expect(repaired).toHaveLength(270);
    for (const word of repaired) {
      const prior = original.find(w => w.id === word.id)!;
      const pack = packs.find(p => p.id === word.sources[0].packId)!;
      expect(word.examples).toEqual(pack.words.find(w => w.lemma === word.lemma)!.examples);
      expect({ ...word, examples: prior.examples, updatedAt: prior.updatedAt }).toEqual(prior);
    }
    expect(await allWords()).toEqual(repaired);
    expect(await Promise.all([db.reviews.toArray(), db.prefs.toArray(), db.redemptions.toArray(), db.sessions.toArray(), db.items.toArray()])).toEqual(before);
  });

  it("preserves custom examples, other senses, other parts of speech and unrelated sources", async () => {
    const pack = packs[1];
    const rich = oldWord(pack, "rich");
    const words = [
      { ...rich, id: "custom", examples: [{ en: "This is a rich king.", zh: "这是一位富有的国王。" }] },
      { ...rich, id: "meaning", meaningZh: "浓郁的" },
      { ...rich, id: "pos", pos: "n" },
      { ...rich, id: "source", sources: [{ kind: "reading" as const }] },
      { ...rich, id: "extended", examples: [...rich.examples, { en: "My own sentence.", zh: "我的例句。" }] },
    ];
    await db.words.bulkAdd(words);
    expect(await allWords()).toEqual([...words].sort((a, b) => a.id.localeCompare(b.id)));
    await importPack({ ...pack, words: [pack.words.find(w => w.lemma === "rich")!] });
    expect((await db.words.get("custom"))!.examples).toEqual(words[0].examples);
  });

  it("updates reimports and fills empty examples without adding duplicate words", async () => {
    const pack = packs[1];
    await db.words.bulkAdd([oldWord(pack, "rich"), { ...oldWord(pack, "honey"), examples: [] }]);
    const subset = { ...pack, words: pack.words.filter(w => ["rich", "honey"].includes(w.lemma!)) };
    expect(await importPack(subset)).toEqual({ added: 0, merged: 2 });
    for (const word of await db.words.toArray()) {
      expect(word.examples).toEqual(subset.words.find(w => w.lemma === word.lemma)!.examples);
    }
    expect(await db.words.count()).toBe(2);
    expect(await db.reviews.count()).toBe(0);
  });

  it("loads reviewed examples when opening an existing lesson", async () => {
    await db.words.add(oldWord(packs[1], "free"));
    await db.sessions.add({ id: "lesson", date: "2026-09-13", itemIds: [], currentIndex: 0, finishedAt: null, xpEarned: 0 });
    const loaded = await loadSession("lesson");
    expect(loaded.words[0].examples[0].en).toBe("The bird is free to leave its cage.");
  });
});
