import Dexie, { type EntityTable } from "dexie";
import type { QuizItem, QuizSession, ReviewState, UserPrefs, WordRecord, RewardRedemption } from "../lib/types";

export const db = new Dexie("wordecho") as Dexie & {
  words: EntityTable<WordRecord, "id">;
  reviews: EntityTable<ReviewState, "wordId">;
  sessions: EntityTable<QuizSession, "id">;
  items: EntityTable<QuizItem, "id">;
  prefs: EntityTable<UserPrefs, "id">;
  redemptions: EntityTable<RewardRedemption, "rewardId">;
};

db.version(1).stores({
  words: "id, lemma, enrichStatus",
  reviews: "wordId, dueAt, repetitions",
  sessions: "id, date, finishedAt",
  items: "id, sessionId, wordId",
  prefs: "id",
});

db.version(2).stores({ redemptions: "rewardId" });

export const defaultPrefs = (): UserPrefs => ({
  id: "prefs",
  name: "",
  dailyLimit: 15,
  ttsLang: "en-US",
  ttsRate: 0.85,
  soundOn: true,
  autoSpeak: true,
  hideHomeScreenTip: false,
  streakDays: 0,
  lastStudyDate: null,
  studyDates: [],
  xpTotal: 0,
  xpToday: 0,
  xpDate: null,
});

export async function getPrefs(): Promise<UserPrefs> {
  return db.transaction("rw", db.prefs, db.sessions, async () => {
    const p = await db.prefs.get("prefs");
    const next = { ...defaultPrefs(), ...p, studyDates: p?.studyDates ?? [] };
    // Older installations/backups only saved daily XP in prefs. Recover the
    // lifetime total from all lessons, including unfinished lessons and practice.
    if (p?.xpTotal == null) {
      const sessions = await db.sessions.toArray();
      next.xpTotal = Math.max(
        sessions.reduce((total, session) => total + session.xpEarned, 0),
        p?.xpToday ?? 0,
      );
      await db.prefs.put(next);
    }
    return next;
  });
}

export async function savePrefs(p: UserPrefs): Promise<void> {
  await db.prefs.put(p);
}
