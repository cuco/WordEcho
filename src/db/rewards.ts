import { rewards } from "../data/rewards";
import type { RewardRedemption } from "../lib/types";
import { todayLocal } from "../lib/types";
import { FEED_COST, FULLNESS_MAX, isRewardOwned, settleCare } from "../lib/reward-care";
import { db, getPrefs } from "./schema";

export type RewardState = {
  xpTotal: number;
  available: number;
  redemptions: RewardRedemption[];
};

async function readState(): Promise<RewardState> {
  const prefs = await getPrefs();
  const redemptions = await db.redemptions.toArray();
  const today = todayLocal();
  for (const record of redemptions) {
    const definition = rewards.find((r) => r.id === record.rewardId);
    if (!definition) continue;
    const care = settleCare(record.care, definition.hungerDays, today);
    if (care !== record.care) {
      record.care = care;
      await db.redemptions.put(record);
    }
  }
  return {
    xpTotal: prefs.xpTotal,
    available: Math.max(0, prefs.xpTotal - redemptions.reduce((sum, r) => sum + r.cost, 0)),
    redemptions,
  };
}

export function getRewardState(): Promise<RewardState> {
  // getPrefs may migrate legacy XP, so the snapshot includes a write lock.
  return db.transaction("rw", db.prefs, db.sessions, db.redemptions, readState);
}

export type RedeemResult = { status: "redeemed" | "owned" | "insufficient"; state: RewardState };

export function redeemReward(rewardId: string): Promise<RedeemResult> {
  return db.transaction("rw", db.prefs, db.sessions, db.redemptions, async () => {
    const reward = rewards.find((r) => r.id === rewardId);
    if (!reward) throw new Error("Unknown reward");
    const state = await readState();
    const existing = state.redemptions.find((r) => r.rewardId === rewardId);
    if (existing && isRewardOwned(existing)) return { status: "owned", state };
    if (state.available < reward.cost) return { status: "insufficient", state };
    const redemption: RewardRedemption = { rewardId, cost: (existing?.cost ?? 0) + reward.cost, redeemedAt: new Date().toISOString(), care: { fullness: FULLNESS_MAX, settledOn: todayLocal() } };
    if (existing) await db.redemptions.put(redemption);
    else await db.redemptions.add(redemption);
    return {
      status: "redeemed",
      state: { ...state, available: state.available - reward.cost, redemptions: [...state.redemptions.filter((r) => r.rewardId !== rewardId), redemption] },
    };
  });
}

export type FeedResult = { status: "fed" | "full" | "locked" | "insufficient"; state: RewardState };

export function feedReward(rewardId: string): Promise<FeedResult> {
  return db.transaction("rw", db.prefs, db.sessions, db.redemptions, async () => {
    if (!rewards.some((r) => r.id === rewardId)) throw new Error("Unknown reward");
    const state = await readState();
    const record = state.redemptions.find((r) => r.rewardId === rewardId);
    if (!record?.care || !isRewardOwned(record)) return { status: "locked", state };
    if (record.care.fullness === FULLNESS_MAX) return { status: "full", state };
    if (state.available < FEED_COST) return { status: "insufficient", state };
    record.care = { ...record.care, fullness: record.care.fullness + 1 };
    record.cost += FEED_COST;
    await db.redemptions.put(record);
    return { status: "fed", state: { ...state, available: state.available - FEED_COST } };
  });
}
