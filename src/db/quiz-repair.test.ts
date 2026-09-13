import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { QuizItem, QuizSession, WordRecord } from "../lib/types";
import { newReview } from "../lib/srs";
import { isQuizItemValid } from "../lib/quiz";
import { db, defaultPrefs } from "./schema";
import { importPack, repairWordMeanings } from "./repo";
import { appendRetries, loadSession, startPractice } from "./session";

function word(id: string, meaningZh = id): WordRecord {
  return { id, lemma: id, display: id, meaningZh, pos: "n", ipa: null,
    examples: [], sources: [], enrichStatus: "complete", createdAt: "", updatedAt: "" };
}
function item(id: string, type: QuizItem["type"] = "en_to_zh"): QuizItem {
  return { id, sessionId: "old", wordId: "ant", type, prompt: "ant",
    options: ["ink", "ant", "up"], answerIndex: 1, audioBeforeAnswer: type !== "zh_to_en",
    chosenIndex: null, correct: null, isRetry: false };
}
const session: QuizSession = { id: "old", date: "2026-09-13", itemIds: ["answered", "t1", "t2"],
  currentIndex: 1, finishedAt: null, xpEarned: 10 };

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe("old quiz and word repairs", () => {
  it("repairs only existing invalid meanings and preserves SRS, XP and custom Chinese", async () => {
    await db.words.bulkAdd([word("ant"), word("cat", "小猫咪"), word("zzzxunknown")]);
    const review = { ...newReview("ant", "2026-09-13"), repetitions: 4, intervalDays: 16 };
    await db.reviews.add(review);
    await db.prefs.put({ ...defaultPrefs(), xpTotal: 100 });
    const words = await repairWordMeanings();
    expect(words.find((w) => w.id === "ant")).toMatchObject({ meaningZh: "蚂蚁", enrichStatus: "complete" });
    expect(words.find((w) => w.id === "cat")?.meaningZh).toBe("小猫咪");
    expect(words.find((w) => w.id === "zzzxunknown")).toMatchObject({ meaningZh: "", enrichStatus: "pending" });
    expect(await db.words.count()).toBe(3);
    expect(await db.reviews.get("ant")).toEqual(review);
    expect((await db.prefs.get("prefs"))?.xpTotal).toBe(100);
  });

  it("rebuilds persisted unasked translation questions and keeps already graded answers", async () => {
    await db.words.add(word("ant"));
    const answered = { ...item("answered"), chosenIndex: 1 as const, correct: true };
    await db.items.bulkAdd([answered, item("t1"), item("t2", "zh_to_en")]);
    await db.sessions.add(session);
    const loaded = await loadSession("old");
    expect(loaded.session).toEqual(session);
    expect(loaded.items[0]).toEqual(answered);
    for (const quizItem of loaded.items.slice(1)) {
      expect(isQuizItemValid(quizItem, loaded.words[0])).toBe(true);
      expect(await db.items.get(quizItem.id)).toEqual(quizItem);
    }
    expect(loaded.items[2].audioBeforeAnswer).toBe(false);
    expect((await loadSession("old")).items).toEqual(loaded.items);
  });

  it("omits an unresolvable word from an old quiz without deleting the word", async () => {
    await db.words.bulkAdd([word("ant"), word("zzzxunknown")]);
    await db.items.bulkAdd([item("t1"), { ...item("bad"), wordId: "zzzxunknown" }]);
    await db.sessions.add({ ...session, itemIds: ["t1", "bad"], currentIndex: 0 });
    const loaded = await loadSession("old");
    expect(loaded.session?.itemIds).toEqual(["t1"]);
    expect((await db.words.get("zzzxunknown"))?.enrichStatus).toBe("pending");
    expect(await db.words.count()).toBe(2);
  });

  it("free practice also excludes incomplete words", async () => {
    await db.words.bulkAdd([word("ant"), word("zzzxunknown")]);
    const practice = await startPractice();
    expect(practice.items).toHaveLength(1);
    expect(practice.items[0].wordId).toBe("ant");
    expect(isQuizItemValid(practice.items[0], (await db.words.get("ant"))!)).toBe(true);
  });

  it("rebuilds an old wrong question when appending retries", async () => {
    await db.words.add(word("ant"));
    await db.sessions.add({ ...session, itemIds: ["t1"] });
    const wrong = { ...item("t1"), chosenIndex: 0 as const, correct: false };
    const next = await appendRetries({ ...session, itemIds: ["t1"] }, [wrong]);
    expect(next.items).toHaveLength(2);
    expect(next.items[1].isRetry).toBe(true);
    expect(isQuizItemValid(next.items[1], (await db.words.get("ant"))!)).toBe(true);
  });

  it("never marks an externally imported English placeholder complete", async () => {
    await importPack({ id: "bad", title: "bad", curriculum: "other", grade: "", volume: "",
      language: "en", version: 1,
      words: [{ word: "zzzxunknown", ipa: "", pos: "n", zh: "zzzxunknown", examples: [], unit: "" }] });
    expect((await db.words.toArray())[0].enrichStatus).toBe("pending");
  });
});
