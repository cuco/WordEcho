import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, defaultPrefs, savePrefs } from "./schema";
import { feedReward, getRewardState, redeemReward } from "./rewards";
import { exportBackup, importBackup } from "./repo";

const day = (date: string) => vi.setSystemTime(new Date(`${date}T12:00:00`));
beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  vi.useFakeTimers({ toFake: ["Date"] });
  day("2026-09-01");
  await savePrefs({ ...defaultPrefs(), xpTotal: 2000 });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("feeding and repeat unlock transactions", () => {
  it("starts existing rewards full without retroactive price or hunger charges", async () => {
    await db.redemptions.add({ rewardId: "cookie-cat", cost: 100, redeemedAt: "2025-01-01T00:00:00Z" });
    const state = await getRewardState();
    expect(state.available).toBe(1900);
    expect(state.redemptions[0].care).toEqual({ fullness: 5, settledOn: "2026-09-01" });
    day("2026-09-03");
    expect((await getRewardState()).redemptions[0].care?.fullness).toBe(4);
  });
  it("charges exactly 30 per restored fifth, keeps total XP, and cannot overfeed", async () => {
    await redeemReward("cookie-cat");
    expect((await feedReward("cookie-cat")).status).toBe("full");
    day("2026-09-05");
    const fed = await feedReward("cookie-cat");
    expect(fed.status).toBe("fed");
    expect(fed.state).toMatchObject({ xpTotal: 2000, available: 1770 });
    expect(fed.state.redemptions[0].care?.fullness).toBe(4);
    const results = await Promise.all([feedReward("cookie-cat"), feedReward("cookie-cat")]);
    expect(results.map((r) => r.status).sort()).toEqual(["fed", "full"]);
    expect((await getRewardState()).available).toBe(1740);
    day("2026-09-07");
    expect((await getRewardState()).redemptions[0].care?.fullness).toBe(4);
  });
  it("keeps the remaining hunger cycle after feeding between ticks", async () => {
    await redeemReward("scarf-shiba");
    day("2026-09-06");
    expect((await feedReward("scarf-shiba")).state.redemptions[0].care).toEqual({ fullness: 5, settledOn: "2026-09-04" });
    day("2026-09-07");
    expect((await getRewardState()).redemptions[0].care?.fullness).toBe(4);
  });
  it("retains past expenses when expired, and charges full price to unlock again", async () => {
    await redeemReward("cookie-cat");
    day("2026-09-03"); await feedReward("cookie-cat");
    day("2026-09-13");
    expect((await feedReward("cookie-cat")).status).toBe("locked");
    expect((await getRewardState()).available).toBe(1770);
    const results = await Promise.all([redeemReward("cookie-cat"), redeemReward("cookie-cat")]);
    expect(results.map((r) => r.status).sort()).toEqual(["owned", "redeemed"]);
    const state = await getRewardState();
    expect(state.available).toBe(1570);
    expect(state.redemptions).toHaveLength(1);
    expect(state.redemptions[0]).toMatchObject({ cost: 430, care: { fullness: 5, settledOn: "2026-09-13" } });
  });
  it("cannot revive an expired partner by winding the clock back", async () => {
    await redeemReward("cookie-cat");
    day("2026-09-11"); await getRewardState();
    day("2026-09-01");
    expect((await feedReward("cookie-cat")).status).toBe("locked");
  });
  it("does not overdraw when two hungry partners compete for 30 points", async () => {
    await savePrefs({ ...defaultPrefs(), xpTotal: 430 });
    await redeemReward("cookie-cat"); await redeemReward("carrot-bunny");
    day("2026-09-03");
    const results = await Promise.all([feedReward("cookie-cat"), feedReward("carrot-bunny")]);
    expect(results.map((r) => r.status).sort()).toEqual(["fed", "insufficient"]);
    expect((await getRewardState()).available).toBe(0);
    expect((await feedReward("bamboo-panda")).status).toBe("locked");
  });
  it("rolls back feeding when storage fails", async () => {
    await redeemReward("cookie-cat"); day("2026-09-03");
    const before = await getRewardState();
    vi.spyOn(db.redemptions, "put").mockRejectedValueOnce(new Error("disk full"));
    await expect(feedReward("cookie-cat")).rejects.toThrow("disk full");
    expect(await getRewardState()).toEqual(before);
  });
  it("round-trips spending and hunger, preserving elapsed offline time", async () => {
    await redeemReward("cookie-cat"); day("2026-09-03"); await feedReward("cookie-cat");
    const backup = await exportBackup(false);
    await db.redemptions.clear();
    await importBackup(backup);
    expect(await exportBackup(false)).toEqual(backup);
    db.close(); await db.open(); day("2026-09-05");
    const state = await getRewardState();
    expect(state.available).toBe(1770);
    expect(state.redemptions[0].care?.fullness).toBe(4);
    await expect(importBackup({ ...backup, redemptions: [{ ...backup.redemptions[0], care: { fullness: -1, settledOn: "2026-09-01" } }] })).rejects.toThrow();
    expect(await getRewardState()).toEqual(state);
  });
});
