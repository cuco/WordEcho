import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dictCoreWords } from "../data/dict-core";
import { newReview } from "../lib/srs";
import { todayLocal, type WordRecord } from "../lib/types";
import { db, defaultPrefs, getPrefs, savePrefs } from "./schema";
import { appendRetries, finishSession, getUnfinishedSession, gradeItem, startOrResumeDaily } from "./session";

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 13, 12));
  await Promise.all(db.tables.map((table) => table.clear()));
  await savePrefs({ ...defaultPrefs(), dailyLimit: 12 });
  const words: WordRecord[] = dictCoreWords.slice(0, 12).map((word) => ({
    id: word.lemma, lemma: word.lemma, display: word.display, ipa: word.ipa,
    meaningZh: word.zh, pos: word.pos, examples: word.examples, sources: [],
    enrichStatus: "complete", createdAt: todayLocal(), updatedAt: todayLocal(),
  }));
  await db.words.bulkAdd(words);
  await db.reviews.bulkAdd(words.map((word) => newReview(word.id, todayLocal())));
});

afterEach(() => vi.useRealTimers());

describe("unfinished lessons", () => {
  it("resumes the first unanswered question, including after reopening IndexedDB", async () => {
    expect(await getUnfinishedSession()).toBeNull();
    const original = await startOrResumeDaily();
    db.close();
    await db.open();
    expect(await getUnfinishedSession()).toEqual(original);
    expect(await startOrResumeDaily()).toEqual(original);
    expect(await db.sessions.count()).toBe(1);
  });

  it("keeps the current question, original order and answer progress after leaving mid-lesson", async () => {
    const original = await startOrResumeDaily();
    for (const item of original.items.slice(0, 3)) await gradeItem(item, item.answerIndex);
    await db.sessions.update(original.session.id, { currentIndex: 3 });
    const before = await db.reviews.toArray();
    const resumed = await startOrResumeDaily();
    expect(resumed.session).toMatchObject({ id: original.session.id, currentIndex: 3, xpEarned: 30 });
    expect(resumed.items.map((item) => item.id)).toEqual(original.session.itemIds);
    expect(resumed.items.filter((item) => item.chosenIndex !== null)).toHaveLength(3);
    expect(resumed.items[3]).toEqual(original.items[3]);
    expect(await db.reviews.toArray()).toEqual(before);
    expect(await getUnfinishedSession()).toEqual(resumed);
    expect((await getPrefs()).xpTotal).toBe(30);
  });

  it("retains submitted feedback without awarding XP or applying SRS twice", async () => {
    const original = await startOrResumeDaily();
    const graded = await gradeItem(original.items[0], original.items[0].answerIndex);
    const review = await db.reviews.get(graded.wordId);
    const resumed = await startOrResumeDaily();
    expect(resumed.session.currentIndex).toBe(0);
    expect(resumed.items[0]).toEqual(graded);
    await gradeItem(resumed.items[0], graded.answerIndex);
    expect((await getPrefs()).xpTotal).toBe(10);
    expect(await db.reviews.get(graded.wordId)).toEqual(review);
  });

  it("resumes practice when no words are due instead of generating another set", async () => {
    await db.reviews.toCollection().modify({ repetitions: 3, dueAt: "2026-09-20" });
    const original = await startOrResumeDaily();
    expect(original.session.kind).toBe("practice");
    await gradeItem(original.items[0], original.items[0].answerIndex);
    await db.sessions.update(original.session.id, { currentIndex: 1 });
    const resumed = await startOrResumeDaily();
    expect(resumed.session).toMatchObject({ id: original.session.id, currentIndex: 1 });
    expect(resumed.items[1]).toEqual(original.items[1]);
    expect(await db.sessions.count()).toBe(1);
  });

  it("prioritizes unfinished practice even after today's check-in", async () => {
    const daily = await startOrResumeDaily();
    for (const item of daily.items) await gradeItem(item, item.answerIndex);
    await finishSession((await db.sessions.get(daily.session.id))!);
    const practice = await startOrResumeDaily();
    expect(practice.session.kind).toBe("practice");
    expect((await getPrefs()).studyDates).toContain(todayLocal());
    expect(await getUnfinishedSession()).toEqual(practice);
    expect(await startOrResumeDaily()).toEqual(practice);
    expect(await db.sessions.count()).toBe(2);
  });

  it("keeps appended retry questions and resumes at the unanswered retry", async () => {
    const original = await startOrResumeDaily();
    const items = [];
    for (const [index, item] of original.items.entries()) {
      items.push(await gradeItem(item, index === 0 ? (item.answerIndex + 1) % 3 : item.answerIndex));
    }
    const appended = await appendRetries((await db.sessions.get(original.session.id))!, items);
    await db.sessions.update(original.session.id, { currentIndex: items.length });
    const resumed = await startOrResumeDaily();
    expect(resumed.items).toEqual(appended.items);
    expect(resumed.items[resumed.session.currentIndex]).toMatchObject({ isRetry: true, chosenIndex: null });
    expect(resumed.items.filter((item) => item.chosenIndex !== null)).toHaveLength(12);
  });

  it("discards yesterday's unfinished lesson when starting today", async () => {
    const yesterday = await startOrResumeDaily();
    vi.setSystemTime(new Date(2026, 8, 14, 12));
    expect(await getUnfinishedSession()).toBeNull();
    const today = await startOrResumeDaily();
    expect(today.session.id).not.toBe(yesterday.session.id);
    expect(today.session.date).toBe("2026-09-14");
    expect(today.session.currentIndex).toBe(0);
  });
});
