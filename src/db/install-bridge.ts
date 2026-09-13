import type { RewardRedemption, UserPrefs } from "../lib/types";
import { db, defaultPrefs } from "./schema";

const COOKIE_NAME = "wordecho_install_v1";
const MAX_COOKIE_VALUE_LENGTH = 3400;
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

type CompactInstallState = {
  v: 1;
  /** xpTotal, xpToday, xpDate */
  x: [number, number, string | null];
  /** streakDays, lastStudyDate, recent studyDates */
  s: [number, string | null, string[]];
  /** rewardId, cost, redeemedAt, optional care */
  r: [string, number, string, [number, string] | null][];
};

function isSafeCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isDay(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00`));
}

function isOptionalDay(value: unknown): value is string | null {
  return value === null || isDay(value);
}

function compactRedemption(record: RewardRedemption): CompactInstallState["r"][number] {
  return [
    record.rewardId,
    record.cost,
    record.redeemedAt,
    record.care ? [record.care.fullness, record.care.settledOn] : null,
  ];
}

function expandRedemption(record: CompactInstallState["r"][number]): RewardRedemption {
  const [rewardId, cost, redeemedAt, care] = record;
  return {
    rewardId,
    cost,
    redeemedAt,
    ...(care ? { care: { fullness: care[0], settledOn: care[1] } } : {}),
  };
}

function validCompactState(value: unknown): value is CompactInstallState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<CompactInstallState>;
  if (state.v !== 1 || !Array.isArray(state.x) || state.x.length !== 3 ||
      !isSafeCount(state.x[0]) || !isSafeCount(state.x[1]) || !isOptionalDay(state.x[2])) return false;
  if (!Array.isArray(state.s) || state.s.length !== 3 || !isSafeCount(state.s[0]) ||
      !isOptionalDay(state.s[1]) || !Array.isArray(state.s[2]) || !state.s[2].every(isDay)) return false;
  if (!Array.isArray(state.r)) return false;
  const ids = new Set<string>();
  for (const record of state.r) {
    if (!Array.isArray(record) || record.length !== 4 || typeof record[0] !== "string" || !record[0] ||
        ids.has(record[0]) || !Number.isSafeInteger(record[1]) || record[1] <= 0 ||
        typeof record[2] !== "string" || !Number.isFinite(Date.parse(record[2]))) return false;
    ids.add(record[0]);
    const care = record[3];
    if (care !== null && (!Array.isArray(care) || care.length !== 2 ||
        !Number.isInteger(care[0]) || care[0] < 0 || care[0] > 5 || !isDay(care[1]))) return false;
  }
  return state.x[0] >= state.r.reduce((sum, record) => sum + record[1], 0);
}

export function makeInstallBridgeValue(prefs: UserPrefs, redemptions: RewardRedemption[]): string | null {
  const studyDates = [...new Set(prefs.studyDates.filter(isDay))].sort();
  const state: CompactInstallState = {
    v: 1,
    x: [prefs.xpTotal, prefs.xpToday, prefs.xpDate],
    s: [prefs.streakDays, prefs.lastStudyDate, studyDates],
    r: redemptions.map(compactRedemption),
  };
  let encoded = encodeURIComponent(JSON.stringify(state));
  // Cookie limits vary. Keep the most recent calendar days while always
  // preserving streak, XP, and reward spending/ownership.
  while (encoded.length > MAX_COOKIE_VALUE_LENGTH && state.s[2].length) {
    state.s[2].shift();
    encoded = encodeURIComponent(JSON.stringify(state));
  }
  return encoded.length <= MAX_COOKIE_VALUE_LENGTH ? encoded : null;
}

export function readInstallBridgeValue(encoded: string): { prefs: Partial<UserPrefs>; redemptions: RewardRedemption[] } | null {
  try {
    const state: unknown = JSON.parse(decodeURIComponent(encoded));
    if (!validCompactState(state)) return null;
    return {
      prefs: {
        xpTotal: state.x[0],
        xpToday: state.x[1],
        xpDate: state.x[2],
        streakDays: state.s[0],
        lastStudyDate: state.s[1],
        studyDates: state.s[2],
      },
      redemptions: state.r.map(expandRedemption),
    };
  } catch {
    return null;
  }
}

function cookiePath(): string {
  const base = import.meta.env.BASE_URL || "/";
  return base.startsWith("/") ? base : `/${base}`;
}

function cookieSuffix(maxAge: number): string {
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  return `; Max-Age=${maxAge}; Path=${cookiePath()}; SameSite=Strict${secure}`;
}

function cookieValue(): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${COOKIE_NAME}=`;
  const cookie = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return cookie ? cookie.slice(prefix.length) : null;
}

function clearInstallBridgeCookie() {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_NAME}=${cookieSuffix(0)}`;
}

export async function syncInstallBridgeFromDb(): Promise<boolean> {
  if (typeof document === "undefined") return false;
  const [savedPrefs, redemptions] = await db.transaction("r", db.prefs, db.redemptions, () =>
    Promise.all([db.prefs.get("prefs"), db.redemptions.toArray()]));
  if (!savedPrefs) return false;
  const value = makeInstallBridgeValue({ ...defaultPrefs(), ...savedPrefs }, redemptions);
  if (!value) return false;
  document.cookie = `${COOKIE_NAME}=${value}${cookieSuffix(MAX_AGE_SECONDS)}`;
  return true;
}

export async function restoreInstallBridgeValue(encoded: string): Promise<boolean> {
  const bridge = readInstallBridgeValue(encoded);
  if (!bridge) return false;
  return db.transaction("rw", db.prefs, db.sessions, db.redemptions, async () => {
    const [localPrefs, sessionCount, localRedemptions] = await Promise.all([
      db.prefs.get("prefs"),
      db.sessions.count(),
      db.redemptions.count(),
    ]);
    const hasLocalProgress = sessionCount > 0 || localRedemptions > 0 || Boolean(
      localPrefs && (localPrefs.xpTotal > 0 || localPrefs.streakDays > 0 || (localPrefs.studyDates?.length ?? 0) > 0),
    );
    if (hasLocalProgress) return false;
    await db.prefs.put({ ...defaultPrefs(), ...localPrefs, ...bridge.prefs, id: "prefs" });
    if (bridge.redemptions.length) await db.redemptions.bulkAdd(bridge.redemptions);
    return true;
  });
}

export async function restoreInstallBridgeFromCookie(): Promise<boolean> {
  const value = cookieValue();
  if (!value) return false;
  const restored = await restoreInstallBridgeValue(value);
  if (restored || !readInstallBridgeValue(value)) clearInstallBridgeCookie();
  return restored;
}
