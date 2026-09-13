import { addDays, type RewardCare, type RewardRedemption } from "./types";

export const FEED_COST = 30;
export const FULLNESS_MAX = 5;

/** Calendar days, independent of DST. Keep the remainder of each hunger cycle. */
export function settleCare(care: RewardCare | undefined, hungerDays: number, today: string): RewardCare {
  if (!care) return { fullness: FULLNESS_MAX, settledOn: today };
  if (care.fullness === 0 || today <= care.settledOn) return care;
  const elapsed = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${care.settledOn}T00:00:00Z`)) / 86400000);
  const ticks = Math.floor(elapsed / hungerDays);
  if (!ticks) return care;
  return { fullness: Math.max(0, care.fullness - ticks), settledOn: addDays(care.settledOn, ticks * hungerDays) };
}

export function isRewardOwned(record: RewardRedemption): boolean {
  return (record.care?.fullness ?? FULLNESS_MAX) > 0;
}

export function careLabel(fullness: number): string {
  return `${fullness === 5 ? "饱饱的" : fullness === 0 ? "等待重新解锁" : fullness <= 2 ? "肚子饿了" : "可以喂一喂"}，饱食度 ${fullness * 20}%`;
}

export function isValidCare(value: unknown): value is RewardCare {
  if (!value || typeof value !== "object") return false;
  const care = value as RewardCare;
  return Number.isInteger(care.fullness) && care.fullness >= 0 && care.fullness <= FULLNESS_MAX &&
    typeof care.settledOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(care.settledOn) &&
    Number.isFinite(Date.parse(care.settledOn)) && new Date(care.settledOn).toISOString().slice(0, 10) === care.settledOn;
}
