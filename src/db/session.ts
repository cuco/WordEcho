import { dictCoreWords } from "../data/dict-core";
import { buildDailyQuiz, buildStem, makeRetryItem, pickType } from "../lib/quiz";
import { seededShuffle } from "../lib/hash";
import { applyAnswer } from "../lib/srs";
import type { QuizItem, QuizSession } from "../lib/types";
import { todayLocal, uuid } from "../lib/types";
import { db, getPrefs, savePrefs } from "./schema";

export async function startOrResumeDaily(): Promise<{ session: QuizSession; items: QuizItem[] }> {
  const today = todayLocal();
  const prefs = await getPrefs();
  const existing = (await db.sessions.where("date").equals(today).toArray()).find(
    (s) => s.kind !== "practice",
  );
  if (existing && !existing.finishedAt) {
    const items = await db.items.where("sessionId").equals(existing.id).toArray();
    if (items.length) return { session: existing, items };
  }

  if (existing?.finishedAt) return startPractice();

  const sessionId = uuid();
  const words = await db.words.toArray();
  const reviews = await db.reviews.toArray();
  const items = buildDailyQuiz(words, reviews, today, prefs.dailyLimit, dictCoreWords, sessionId);
  if (!items.length) return startPractice();

  const session: QuizSession = {
    id: sessionId,
    date: today,
    itemIds: items.map((i) => i.id),
    currentIndex: 0,
    finishedAt: null,
    xpEarned: 0,
    kind: "daily",
  };
  await db.sessions.add(session);
  await db.items.bulkAdd(items);
  return { session, items };
}

/** Free practice: today's queue is already cleared, so nothing here touches SRS. */
export async function startPractice(): Promise<{ session: QuizSession; items: QuizItem[] }> {
  const today = todayLocal();
  const prefs = await getPrefs();
  const sessionId = uuid();
  const all = await db.words.toArray();
  const reviews = await db.reviews.toArray();
  const dueIds = new Set(reviews.filter((r) => r.dueAt <= today).map((r) => r.wordId));
  const shuffled = seededShuffle(all, sessionId);
  const words = [
    ...shuffled.filter((w) => dueIds.has(w.id)),
    ...shuffled.filter((w) => !dueIds.has(w.id)),
  ].slice(0, prefs.dailyLimit);
  const items = words.map((w, i) => {
    const seed = `${today}-${sessionId}`;
    const type = pickType(w.id, seed, w.display);
    const stem = buildStem(type, w, all, dictCoreWords, seed);
    return {
      id: `${sessionId}-${i}`,
      sessionId,
      wordId: w.id,
      type: stem.type,
      prompt: stem.prompt,
      options: stem.options,
      answerIndex: stem.answerIndex,
      cloze: stem.cloze,
      audioBeforeAnswer: stem.audioBeforeAnswer,
      chosenIndex: null,
      correct: null,
      isRetry: true,
    } satisfies QuizItem;
  });
  const session: QuizSession = {
    id: sessionId,
    date: today,
    itemIds: items.map((i) => i.id),
    currentIndex: 0,
    finishedAt: null,
    xpEarned: 0,
    kind: "practice",
  };
  await db.sessions.add(session);
  if (items.length) await db.items.bulkAdd(items);
  return { session, items };
}

export async function gradeItem(item: QuizItem, chosenIndex: number) {
  const today = todayLocal();
  const correct = chosenIndex === item.answerIndex;
  const next: QuizItem = { ...item, chosenIndex: chosenIndex as 0 | 1 | 2, correct };
  await db.items.put(next);
  if (!item.isRetry) {
    const review = await db.reviews.get(item.wordId);
    if (review) await db.reviews.put(applyAnswer(review, correct, today));
  }
  const session = await db.sessions.get(item.sessionId);
  if (session && correct) {
    const xp = item.isRetry ? 5 : 10;
    session.xpEarned += xp;
    await db.sessions.put(session);
    const prefs = await getPrefs();
    const xpToday = prefs.xpDate === today ? prefs.xpToday + xp : xp;
    await savePrefs({ ...prefs, xpToday, xpDate: today });
  }
  return next;
}

/** 堂末把答错的词再插一遍。返回更新后的 session，调用方必须用它继续写，否则 itemIds 会丢。 */
export async function appendRetries(session: QuizSession, items: QuizItem[]) {
  const wrong = items.filter((i) => !i.isRetry && i.correct === false);
  if (!wrong.length) return { session, items };
  const extras = wrong.map((w, i) => makeRetryItem(w, i));
  await db.items.bulkAdd(extras);
  const next = { ...session, itemIds: [...session.itemIds, ...extras.map((e) => e.id)] };
  await db.sessions.put(next);
  return { session: next, items: [...items, ...extras] };
}

export async function finishSession(session: QuizSession) {
  const today = todayLocal();
  const prefs = await getPrefs();
  let streak = prefs.streakDays;
  if (prefs.lastStudyDate === today) {
    /* already counted today */
  } else if (prefs.lastStudyDate === yesterday(today)) {
    streak += 1;
  } else {
    streak = 1;
  }
  const studyDates = prefs.studyDates.includes(today)
    ? prefs.studyDates
    : [...prefs.studyDates, today];
  await savePrefs({ ...prefs, streakDays: streak, lastStudyDate: today, studyDates });
  const next = { ...session, finishedAt: new Date().toISOString() };
  await db.sessions.put(next);
  return { session: next, streak };
}

function yesterday(today: string): string {
  const [y, m, d] = today.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
