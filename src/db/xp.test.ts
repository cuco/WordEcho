import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuizItem, QuizSession, UserPrefs } from "../lib/types";
import { newReview } from "../lib/srs";
import { exportBackup, importBackup } from "./repo";
import { db, defaultPrefs, getPrefs, savePrefs } from "./schema";
import { finishSession, gradeItem } from "./session";

function lesson(id: string, date: string, xpEarned = 0): QuizSession {
  return { id, date, xpEarned, itemIds: [], currentIndex: 0, finishedAt: null };
}

async function question(sessionId: string, isRetry = false): Promise<QuizItem> {
  const item: QuizItem = {
    id: `${sessionId}-${isRetry ? "retry" : "main"}`,
    sessionId, wordId: "apple", type: "en_to_zh", prompt: "apple",
    options: ["苹果", "香蕉", "梨"], answerIndex: 0,
    audioBeforeAnswer: true, chosenIndex: null, correct: null, isRetry,
  };
  await db.items.add(item);
  return item;
}

function oldPrefs(xpToday = 0): UserPrefs {
  const { xpTotal: _, ...prefs } = defaultPrefs();
  return { ...prefs, xpToday, xpDate: "2026-09-10" } as UserPrefs;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 13, 12));
  await Promise.all(db.tables.map((table) => table.clear()));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("lifetime XP", () => {
  it("recovers all historical lessons once, including unfinished lessons and practice", async () => {
    await db.prefs.put(oldPrefs(30));
    await db.sessions.bulkAdd([
      { ...lesson("old", "2026-09-01", 100), finishedAt: "2026-09-01T12:00:00Z" },
      lesson("unfinished", "2026-09-09", 20),
      { ...lesson("practice", "2026-09-10", 30), kind: "practice" },
    ]);
    const [first, second] = await Promise.all([getPrefs(), getPrefs()]);
    expect(first.xpTotal).toBe(150);
    expect(second.xpTotal).toBe(150);
    expect((await db.prefs.get("prefs"))?.xpTotal).toBe(150);
    vi.setSystemTime(new Date(2026, 9, 1, 12));
    expect((await getPrefs()).xpTotal).toBe(150);
  });

  it("keeps legacy daily XP when the backup has no lesson history", async () => {
    await db.prefs.put(oldPrefs(80));
    expect((await getPrefs()).xpTotal).toBe(80);
  });

  it("adds a first answer after migration exactly once", async () => {
    await db.prefs.put(oldPrefs(20));
    await db.sessions.add(lesson("today", "2026-09-13", 40));
    const item = await question("today");
    await db.reviews.add(newReview("apple", "2026-09-13"));
    await Promise.all([gradeItem(item, 0), gradeItem(item, 0)]);
    expect((await getPrefs()).xpTotal).toBe(50);
    expect((await db.sessions.get("today"))?.xpEarned).toBe(50);
    expect((await db.reviews.get("apple"))?.repetitions).toBe(1);
  });

  it("accumulates across days and a broken streak, including retry XP", async () => {
    await savePrefs({ ...defaultPrefs(), xpTotal: 100, xpToday: 20, xpDate: "2026-09-12",
      streakDays: 2, lastStudyDate: "2026-09-12", studyDates: ["2026-09-11", "2026-09-12"] });
    await db.sessions.add(lesson("today", "2026-09-13"));
    await gradeItem(await question("today"), 0);
    expect(await getPrefs()).toMatchObject({ xpTotal: 110, xpToday: 10 });
    await finishSession((await db.sessions.get("today"))!);
    expect((await getPrefs()).xpTotal).toBe(110);

    vi.setSystemTime(new Date(2026, 8, 17, 12));
    await db.sessions.add(lesson("later", "2026-09-17"));
    await gradeItem(await question("later", true), 0);
    await finishSession((await db.sessions.get("later"))!);
    expect(await getPrefs()).toMatchObject({ xpTotal: 115, xpToday: 5, streakDays: 1 });
    db.close();
    await db.open();
    expect((await getPrefs()).xpTotal).toBe(115);
  });

  it("never deducts XP for a wrong answer", async () => {
    await savePrefs({ ...defaultPrefs(), xpTotal: 100 });
    await db.sessions.add(lesson("today", "2026-09-13"));
    await gradeItem(await question("today"), 1);
    expect((await getPrefs()).xpTotal).toBe(100);
    expect((await db.sessions.get("today"))?.xpEarned).toBe(0);
  });

  it("rolls back the answer and lesson if saving cumulative XP fails", async () => {
    await getPrefs();
    await db.sessions.add(lesson("today", "2026-09-13"));
    const item = await question("today");
    vi.spyOn(db.prefs, "put").mockRejectedValueOnce(new Error("save failed"));
    await expect(gradeItem(item, 0)).rejects.toThrow("save failed");
    expect((await db.items.get(item.id))?.chosenIndex).toBeNull();
    expect((await db.sessions.get("today"))?.xpEarned).toBe(0);
    expect((await getPrefs()).xpTotal).toBe(0);
  });

  it("restores cumulative XP from new and legacy backups", async () => {
    await savePrefs({ ...defaultPrefs(), xpTotal: 250 });
    const backup = await exportBackup(false);
    await savePrefs(defaultPrefs());
    await importBackup(backup);
    expect((await getPrefs()).xpTotal).toBe(250);

    await importBackup({ prefs: oldPrefs(25), sessions: [lesson("legacy", "2026-09-10", 125)] });
    expect((await getPrefs()).xpTotal).toBe(125);
  });
});
