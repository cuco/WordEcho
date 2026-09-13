import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { RewardRedemption } from "../lib/types";
import { makeInstallBridgeValue, readInstallBridgeValue, restoreInstallBridgeValue } from "./install-bridge";
import { db, defaultPrefs } from "./schema";

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe("install progress bridge", () => {
  it("round-trips streak, XP, recent check-ins and reward ownership", () => {
    const prefs = {
      ...defaultPrefs(),
      streakDays: 8,
      lastStudyDate: "2026-09-13",
      studyDates: ["2026-09-12", "2026-09-13"],
      xpTotal: 650,
      xpToday: 30,
      xpDate: "2026-09-13",
      name: "不应进入 Cookie",
      aiApiKey: "private",
    };
    const redemptions: RewardRedemption[] = [{
      rewardId: "cookie-cat",
      cost: 230,
      redeemedAt: "2026-09-10T10:00:00.000Z",
      care: { fullness: 4, settledOn: "2026-09-13" },
    }];
    const value = makeInstallBridgeValue(prefs, redemptions)!;
    const decoded = readInstallBridgeValue(value)!;
    expect(decoded.prefs).toEqual({
      streakDays: 8,
      lastStudyDate: "2026-09-13",
      studyDates: ["2026-09-12", "2026-09-13"],
      xpTotal: 650,
      xpToday: 30,
      xpDate: "2026-09-13",
    });
    expect(decoded.prefs).not.toHaveProperty("name");
    expect(decoded.prefs).not.toHaveProperty("aiApiKey");
    expect(decoded.redemptions).toEqual(redemptions);
  });

  it("trims oldest calendar days to stay within a safe cookie size", () => {
    const studyDates = Array.from({ length: 900 }, (_, i) => {
      const date = new Date(2024, 0, 1 + i);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    });
    const value = makeInstallBridgeValue({ ...defaultPrefs(), studyDates, xpTotal: 10 }, [])!;
    expect(value.length).toBeLessThanOrEqual(3400);
    const restoredDates = readInstallBridgeValue(value)!.prefs.studyDates!;
    expect(restoredDates.length).toBeLessThan(studyDates.length);
    expect(restoredDates.at(-1)).toBe(studyDates.at(-1));
  });

  it("restores into an empty installed database without overwriting unrelated preferences", async () => {
    await db.prefs.put({ ...defaultPrefs(), dailyLimit: 22, ttsLang: "en-GB" });
    const value = makeInstallBridgeValue({
      ...defaultPrefs(), streakDays: 3, lastStudyDate: "2026-09-13",
      studyDates: ["2026-09-13"], xpTotal: 300, xpToday: 20, xpDate: "2026-09-13",
    }, [{ rewardId: "cookie-cat", cost: 200, redeemedAt: "2026-09-13T10:00:00Z" }])!;
    await expect(restoreInstallBridgeValue(value)).resolves.toBe(true);
    expect(await db.prefs.get("prefs")).toMatchObject({ dailyLimit: 22, ttsLang: "en-GB", streakDays: 3, xpTotal: 300 });
    expect(await db.redemptions.get("cookie-cat")).toMatchObject({ cost: 200 });
  });

  it("does not overwrite progress already created in the installed app", async () => {
    await db.prefs.put({ ...defaultPrefs(), streakDays: 2, xpTotal: 90, studyDates: ["2026-09-12"] });
    const value = makeInstallBridgeValue({ ...defaultPrefs(), streakDays: 9, xpTotal: 900 }, [])!;
    await expect(restoreInstallBridgeValue(value)).resolves.toBe(false);
    expect(await db.prefs.get("prefs")).toMatchObject({ streakDays: 2, xpTotal: 90 });
  });

  it("rejects malformed state and spending greater than cumulative XP", async () => {
    const overspent = encodeURIComponent(JSON.stringify({
      v: 1,
      x: [100, 0, null],
      s: [1, "2026-09-13", ["2026-09-13"]],
      r: [["cookie-cat", 200, "2026-09-13T10:00:00Z", null]],
    }));
    expect(readInstallBridgeValue(overspent)).toBeNull();
    await expect(restoreInstallBridgeValue(overspent)).resolves.toBe(false);
    expect(await db.prefs.count()).toBe(0);
  });
});
