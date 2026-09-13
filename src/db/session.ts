import { dictCoreWords } from "../data/dict-core";
import { buildDailyQuiz, buildStem, isQuizItemValid, makeRetryItem, pickType } from "../lib/quiz";
import { seededShuffle } from "../lib/hash";
import { applyAnswer } from "../lib/srs";
import type { QuizItem, QuizSession } from "../lib/types";
import { todayLocal, uuid } from "../lib/types";
import { db, getPrefs, savePrefs } from "./schema";
import { isStudyWord } from "../lib/word-quality";
import { repairWordMeanings } from "./repo";

/** Resume old quizzes safely without changing answered questions, XP or SRS. */
export async function loadSession(sessionId: string) {
  const words = await repairWordMeanings();
  const byId = new Map(words.map((word) => [word.id, word]));
  return db.transaction("rw", db.sessions, db.items, async () => {
    const session = await db.sessions.get(sessionId);
    if (!session) return { session: null, items: [], words };
    const raw = await db.items.where("sessionId").equals(sessionId).toArray();
    const byItemId = new Map(raw.map((item) => [item.id, item]));
    const items: QuizItem[] = [];
    let currentIndex = 0;
    for (const [index, id] of session.itemIds.entries()) {
      let item = byItemId.get(id);
      if (!item) continue;
      if (!session.finishedAt && item.chosenIndex === null) {
        const word = byId.get(item.wordId);
        if (!word || !isStudyWord(word)) continue;
        if (!isQuizItemValid(item, word)) {
          const seed = session.kind === "practice" ? `${session.date}-${session.id}` : session.date;
          item = { ...item, ...buildStem(item.type, word, words, dictCoreWords, seed) };
          await db.items.put(item);
        }
      }
      if (index < session.currentIndex) currentIndex += 1;
      items.push(item);
    }
    const next = { ...session, itemIds: items.map((item) => item.id), currentIndex };
    if (next.itemIds.length !== session.itemIds.length || currentIndex !== session.currentIndex) {
      await db.sessions.put(next);
    }
    return { session: next, items, words };
  });
}

/** 首页与开始按钮共用同一份续答记录；题序以 itemIds 为准。 */
export async function getUnfinishedSession(date = todayLocal()) {
  const unfinished = await db.transaction("r", db.sessions, db.items, async () => {
    const sessions = await db.sessions.where("date").equals(date).toArray();
    for (const session of sessions) {
      if (session.finishedAt || !session.itemIds.length) continue;
      const saved = await db.items.bulkGet(session.itemIds);
      const items = saved.filter((item): item is QuizItem => item !== undefined);
      if (items.length !== session.itemIds.length || !items[session.currentIndex]) continue;
      return { session, items };
    }
    return null;
  });
  if (!unfinished) return null;
  const loaded = await loadSession(unfinished.session.id);
  return loaded.session && loaded.items[loaded.session.currentIndex]
    ? { session: loaded.session, items: loaded.items }
    : null;
}

export async function startOrResumeDaily(): Promise<{ session: QuizSession; items: QuizItem[] }> {
  const today = todayLocal();
  const unfinished = await getUnfinishedSession(today);
  if (unfinished) return unfinished;

  const prefs = await getPrefs();
  const existing = (await db.sessions.where("date").equals(today).toArray()).find(
    (s) => s.kind !== "practice" && s.finishedAt,
  );

  if (existing?.finishedAt) return startPractice();

  const sessionId = uuid();
  const words = await repairWordMeanings();
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
  await db.transaction("rw", db.sessions, db.items, async () => {
    await db.sessions.add(session);
    await db.items.bulkAdd(items);
  });
  return { session, items };
}

/** Free practice: today's queue is already cleared, so nothing here touches SRS. */
export async function startPractice(): Promise<{ session: QuizSession; items: QuizItem[] }> {
  const today = todayLocal();
  const prefs = await getPrefs();
  const sessionId = uuid();
  const all = (await repairWordMeanings()).filter(isStudyWord);
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
  await db.transaction("rw", db.sessions, db.items, async () => {
    await db.sessions.add(session);
    if (items.length) await db.items.bulkAdd(items);
  });
  return { session, items };
}

export async function gradeItem(item: QuizItem, chosenIndex: number) {
  return db.transaction("rw", db.items, db.reviews, db.sessions, db.prefs, async () => {
    const saved = await db.items.get(item.id);
    if (saved?.chosenIndex != null) return saved;
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
      // Migrate historical XP before adding this answer to the lesson total.
      const prefs = await getPrefs();
      const xp = item.isRetry ? 5 : 10;
      session.xpEarned += xp;
      await db.sessions.put(session);
      const xpToday = prefs.xpDate === today ? prefs.xpToday + xp : xp;
      await savePrefs({ ...prefs, xpTotal: prefs.xpTotal + xp, xpToday, xpDate: today });
    }
    return next;
  });
}

/** 堂末把答错的词再插一遍。返回更新后的 session，调用方必须用它继续写，否则 itemIds 会丢。 */
export async function appendRetries(session: QuizSession, items: QuizItem[]) {
  const words = await repairWordMeanings();
  const byId = new Map(words.filter(isStudyWord).map((word) => [word.id, word]));
  const wrong = items.filter((i) => !i.isRetry && i.correct === false && byId.has(i.wordId));
  if (!wrong.length) return { session, items };
  const extras = wrong.map((item, i) => ({
    ...makeRetryItem(item, i),
    ...buildStem(item.type, byId.get(item.wordId)!, words, dictCoreWords, session.date),
  }));
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
