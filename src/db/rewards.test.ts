import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rewards } from "../data/rewards";
import type { QuizItem, UserPrefs } from "../lib/types";
import { getRewardState, redeemReward } from "./rewards";
import { db, defaultPrefs, getPrefs, savePrefs } from "./schema";
import { exportBackup, importBackup } from "./repo";
import { gradeItem } from "./session";

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); });
afterEach(() => vi.restoreAllMocks());
const fund = (xpTotal: number) => savePrefs({ ...defaultPrefs(), xpTotal });

describe("reward redemption", () => {
  it("upgrades a v1 installation without losing its XP or lessons", async () => {
    await db.delete();
    const legacy = new Dexie("wordecho");
    legacy.version(1).stores({ words: "id, lemma, enrichStatus", reviews: "wordId, dueAt, repetitions", sessions: "id, date, finishedAt", items: "id, sessionId, wordId", prefs: "id" });
    await legacy.table("prefs").put({ ...defaultPrefs(), xpTotal: 200 });
    await legacy.table("sessions").add({ id: "legacy", date: "2026-09-01", xpEarned: 200 });
    legacy.close();
    await db.open();
    expect(await db.sessions.count()).toBe(1);
    expect(await getRewardState()).toMatchObject({ xpTotal: 200, available: 200, redemptions: [] });
    expect((await redeemReward("cookie-cat")).status).toBe("redeemed");
  });
  it("ships twelve stable rewards with four in each theme and price tier", () => {
    expect(new Set(rewards.map((r) => r.id)).size).toBe(12);
    for (const cost of [200, 300, 500]) expect(rewards.filter((r) => r.cost === cost)).toHaveLength(4);
    for (const theme of ["pets", "fantasy", "space"]) expect(rewards.filter((r) => r.theme === theme)).toHaveLength(4);
  });
  it("uses legacy XP immediately and preserves total XP at exact balance", async () => {
    const { xpTotal: _, ...old } = defaultPrefs();
    await db.prefs.put({ ...old, xpToday: 20 } as UserPrefs);
    await db.sessions.add({ id: "old", date: "2026-09-01", itemIds: [], currentIndex: 0, finishedAt: null, xpEarned: 200 });
    const result = await redeemReward("cookie-cat");
    expect(result.status).toBe("redeemed");
    expect(result.state).toMatchObject({ xpTotal: 200, available: 0 });
    expect((await getPrefs()).xpTotal).toBe(200);
  });
  it("does not spend for insufficient balance or unknown reward", async () => {
    await fund(99);
    expect((await redeemReward("cookie-cat")).status).toBe("insufficient");
    await expect(redeemReward("unknown")).rejects.toThrow("Unknown reward");
    expect(await db.redemptions.count()).toBe(0);
    expect((await getRewardState()).available).toBe(99);
  });
  it("deduplicates concurrent requests for the same sticker", async () => {
    await fund(300);
    const results = await Promise.all([redeemReward("cookie-cat"), redeemReward("cookie-cat")]);
    expect(results.map((r) => r.status).sort()).toEqual(["owned", "redeemed"]);
    expect((await getRewardState()).available).toBe(100);
    expect(await db.redemptions.count()).toBe(1);
  });
  it("serializes different stickers without overdrawing", async () => {
    await fund(250);
    const results = await Promise.all([redeemReward("cookie-cat"), redeemReward("carrot-bunny")]);
    expect(results.map((r) => r.status).sort()).toEqual(["insufficient", "redeemed"]);
    expect((await getRewardState()).available).toBe(50);
  });
  it("makes the latest collection visible to another database connection", async () => {
    await fund(200);
    const peer = new Dexie("wordecho");
    try {
      await peer.open();
      await redeemReward("cookie-cat");
      expect(await peer.table("redemptions").count()).toBe(1);
    } finally { peer.close(); }
  });
  it("rolls back a failed save, including a legacy XP migration", async () => {
    const { xpTotal: _, ...old } = defaultPrefs();
    await db.prefs.put({ ...old, xpToday: 200 } as UserPrefs);
    vi.spyOn(db.redemptions, "add").mockRejectedValueOnce(new Error("disk full"));
    await expect(redeemReward("cookie-cat")).rejects.toThrow("disk full");
    expect((await db.prefs.get("prefs"))?.xpTotal).toBeUndefined();
    expect(await db.redemptions.count()).toBe(0);
    expect((await getRewardState()).available).toBe(200);
  });
  it("retains collection after closing and reopening the database", async () => {
    await fund(500);
    await redeemReward("bamboo-panda");
    db.close(); await db.open();
    expect((await getRewardState()).redemptions[0]).toMatchObject({ rewardId: "bamboo-panda", cost: 500 });
    expect((await getRewardState()).available).toBe(0);
  });
  it("adds newly earned XP to available balance without changing the collection", async () => {
    await fund(200);
    await redeemReward("cookie-cat");
    await db.sessions.add({ id: "lesson", date: "2026-09-13", itemIds: [], currentIndex: 0, finishedAt: null, xpEarned: 0 });
    const item: QuizItem = { id: "q", sessionId: "lesson", wordId: "apple", type: "en_to_zh", prompt: "apple", options: ["苹果", "香蕉", "梨"], answerIndex: 0, audioBeforeAnswer: true, chosenIndex: null, correct: null, isRetry: false };
    await db.items.add(item);
    await gradeItem(item, 0);
    expect(await getRewardState()).toMatchObject({ xpTotal: 210, available: 10 });
    expect(await db.redemptions.count()).toBe(1);
  });
});

describe("reward backups", () => {
  it("round-trips XP and collection together without exporting AI keys", async () => {
    await savePrefs({ ...defaultPrefs(), xpTotal: 500, aiApiKey: "private-key" });
    await redeemReward("cookie-cat");
    const backup = await exportBackup(false);
    expect(backup.prefs).not.toHaveProperty("aiApiKey");
    await fund(0); await db.redemptions.clear();
    await importBackup(backup);
    expect(await getRewardState()).toMatchObject({ xpTotal: 500, available: 300, redemptions: backup.redemptions });
  });
  it("restores legacy learning backups to an empty collection", async () => {
    await fund(300); await redeemReward("cookie-cat");
    const { xpTotal: _, ...old } = defaultPrefs();
    await importBackup({ prefs: { ...old, xpToday: 50 } as UserPrefs, sessions: [] });
    expect(await getRewardState()).toMatchObject({ xpTotal: 50, available: 50, redemptions: [] });
  });
  it("preserves collection and balance for a words-only import", async () => {
    await fund(300); await redeemReward("cookie-cat");
    await importBackup({ words: [] });
    expect((await getRewardState()).available).toBe(100);
    expect(await db.redemptions.count()).toBe(1);
  });
  it("rejects duplicate records, invalid costs and records without XP", async () => {
    const r = { rewardId: "cookie-cat", cost: 100, redeemedAt: new Date().toISOString() };
    await expect(importBackup({ redemptions: [r] })).rejects.toThrow();
    await expect(importBackup({ prefs: { ...defaultPrefs(), xpTotal: 300 }, redemptions: [r, r] })).rejects.toThrow();
    await expect(importBackup({ prefs: defaultPrefs(), redemptions: [{ ...r, cost: -100 }] })).rejects.toThrow();
  });
  it("rolls back the entire import when spending exceeds restored XP", async () => {
    await fund(400); await redeemReward("cookie-cat");
    const before = await exportBackup(false);
    await expect(importBackup({ ...before, prefs: { ...defaultPrefs(), xpTotal: 50 } })).rejects.toThrow();
    expect(await exportBackup(false)).toEqual(before);
  });
});
