import Dexie, { type EntityTable } from "dexie";
import type { QuizItem, QuizSession, ReviewState, UserPrefs, WordRecord } from "../lib/types";

export const db = new Dexie("wordecho") as Dexie & {
  words: EntityTable<WordRecord, "id">;
  reviews: EntityTable<ReviewState, "wordId">;
  sessions: EntityTable<QuizSession, "id">;
  items: EntityTable<QuizItem, "id">;
  prefs: EntityTable<UserPrefs, "id">;
};

db.version(1).stores({
  words: "id, lemma, enrichStatus",
  reviews: "wordId, dueAt, repetitions",
  sessions: "id, date, finishedAt",
  items: "id, sessionId, wordId",
  prefs: "id",
});

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
  xpToday: 0,
  xpDate: null,
});

export async function getPrefs(): Promise<UserPrefs> {
  const p = await db.prefs.get("prefs");
  if (p) return { ...defaultPrefs(), ...p, studyDates: p.studyDates ?? [] };
  const d = defaultPrefs();
  await db.prefs.put(d);
  return d;
}

export async function savePrefs(p: UserPrefs): Promise<void> {
  await db.prefs.put(p);
}
