import { hashString, seededShuffle } from "./hash";
import type {
  DictCoreWord,
  QuizItem,
  QuizType,
  ReviewState,
  WordRecord,
} from "./types";
import { addDays, lemmaOf } from "./types";

const VOWELS = new Set("aeiou");
const CLUSTERS = ["th", "ch", "sh", "ph", "wh", "ck", "ee", "ea", "oo", "ai", "oa"];

export function pickType(wordId: string, date: string, display: string): QuizType {
  const t = hashString(`${wordId}${date}`) % 3;
  if (t === 0) return "en_to_zh";
  if (t === 1) return "zh_to_en";
  if (display.replace(/[^a-zA-Z]/g, "").length < 3) return "en_to_zh";
  return "cloze";
}

export function selectWordsForDay(
  reviews: ReviewState[],
  words: WordRecord[],
  date: string,
  limit: number,
): WordRecord[] {
  const byId = new Map(words.map((w) => [w.id, w]));
  const due = reviews
    .filter((r) => r.dueAt <= date && byId.has(r.wordId))
    .sort((a, b) => b.lapses - a.lapses || a.intervalDays - b.intervalDays);

  const dueIds = new Set(due.map((r) => r.wordId));
  const news = reviews.filter(
    (r) => r.repetitions === 0 && byId.has(r.wordId) && !dueIds.has(r.wordId),
  );

  const picked: ReviewState[] = [];
  if (due.length <= limit) {
    picked.push(...due);
    for (const n of news) {
      if (picked.length >= limit) break;
      picked.push(n);
    }
  } else {
    picked.push(...due.slice(0, limit));
  }

  if (picked.length < limit) {
    const tomorrow = addDays(date, 1);
    const early = reviews
      .filter((r) => r.dueAt === tomorrow && !picked.some((p) => p.wordId === r.wordId))
      .sort((a, b) => a.ease - b.ease)
      .slice(0, 2);
    for (const e of early) {
      if (picked.length >= limit) break;
      picked.push(e);
    }
  }

  return picked
    .map((r) => byId.get(r.wordId))
    .filter((w): w is WordRecord => Boolean(w));
}

type DistractorPool = {
  display: string;
  meaningZh: string;
  pos: string | null;
  lemma: string;
};

function asPool(words: WordRecord[], dict: DictCoreWord[]): DistractorPool[] {
  const seen = new Set<string>();
  const pool: DistractorPool[] = [];
  for (const w of words) {
    if (seen.has(w.lemma)) continue;
    seen.add(w.lemma);
    pool.push({
      display: w.display,
      meaningZh: w.meaningZh,
      pos: w.pos,
      lemma: w.lemma,
    });
  }
  for (const w of dict) {
    if (seen.has(w.lemma)) continue;
    seen.add(w.lemma);
    pool.push({
      display: w.display,
      meaningZh: w.zh,
      pos: w.pos,
      lemma: w.lemma,
    });
  }
  return pool;
}

function pickDistractors(
  pool: DistractorPool[],
  target: DistractorPool,
  field: "display" | "meaningZh",
  seed: string,
): string[] {
  const others = pool.filter(
    (p) => p.lemma !== target.lemma && p[field] && p[field] !== target[field],
  );
  const samePos = others.filter((p) => p.pos && p.pos === target.pos);
  const rest = others.filter((p) => !samePos.includes(p));
  const ordered = [...seededShuffle(samePos, seed), ...seededShuffle(rest, seed + "x")];
  const values: string[] = [];
  for (const o of ordered) {
    if (!values.includes(o[field])) values.push(o[field]);
    if (values.length === 2) break;
  }
  while (values.length < 2) values.push(field === "display" ? "cat" : "小猫");
  return values;
}

export function makeCloze(display: string, seed: string): { wordShown: string; blanks: string } | null {
  const word = display;
  const letters = word.replace(/[^a-zA-Z]/g, "");
  if (letters.length < 3) return null;
  const lower = word;
  const start = 1;
  let span = letters.length >= 5 ? 2 : 1;
  let idx = -1;
  for (const c of CLUSTERS) {
    const i = lower.toLowerCase().indexOf(c, start);
    if (i >= 1) {
      idx = i;
      span = c.length;
      break;
    }
  }
  if (idx < 0) {
    for (let i = start; i < lower.length; i++) {
      if (VOWELS.has(lower[i].toLowerCase())) {
        idx = i;
        if (span === 2 && i + 1 < lower.length) span = 2;
        else span = 1;
        break;
      }
    }
  }
  if (idx < 0) idx = Math.max(1, Math.floor(lower.length / 2));
  if (idx + span > lower.length) span = 1;
  const blanks = word.slice(idx, idx + span);
  const wordShown = word.slice(0, idx) + "_".repeat(span) + word.slice(idx + span);
  if (!blanks) return null;
  void seed;
  return { wordShown, blanks };
}

function clozeOptions(blanks: string, seed: string): string[] {
  const confusions: Record<string, string[]> = {
    ph: ["f", "p"],
    f: ["ph", "v"],
    i: ["e", "y"],
    e: ["i", "a"],
    ea: ["ee", "ie"],
    ee: ["ea", "ie"],
    a: ["e", "o"],
    o: ["u", "a"],
    th: ["t", "d"],
  };
  const extras = confusions[blanks.toLowerCase()] ?? [
    blanks === blanks.toLowerCase() ? "e" : "E",
    "a",
  ];
  const wrong = extras
    .map((x) => (blanks.length === 1 ? x.slice(0, 1) : x.padEnd(blanks.length, "e").slice(0, blanks.length)))
    .filter((x) => x !== blanks);
  while (wrong.length < 2) wrong.push(blanks === "x" ? "y" : "x".repeat(blanks.length));
  return seededShuffle([blanks, wrong[0], wrong[1]], seed) as string[];
}

export function buildStem(
  type: QuizType,
  word: WordRecord,
  words: WordRecord[],
  dict: DictCoreWord[],
  date: string,
): Pick<QuizItem, "prompt" | "options" | "answerIndex" | "cloze" | "audioBeforeAnswer" | "type"> {
  const pool = asPool(words, dict);
  const target: DistractorPool = {
    display: word.display,
    meaningZh: word.meaningZh,
    pos: word.pos,
    lemma: word.lemma,
  };
  const seed = `${word.id}${date}${type}`;

  if (type === "cloze") {
    const cloze = makeCloze(word.display, seed);
    if (!cloze) {
      return buildStem("en_to_zh", word, words, dict, date);
    }
    const options = clozeOptions(cloze.blanks, seed);
    const answerIndex = options.indexOf(cloze.blanks) as 0 | 1 | 2;
    return {
      type: "cloze",
      prompt: cloze.wordShown,
      options,
      answerIndex,
      cloze,
      audioBeforeAnswer: true,
    };
  }

  if (type === "zh_to_en") {
    const distractors = pickDistractors(pool, target, "display", seed);
    const options = seededShuffle([word.display, ...distractors], seed);
    return {
      type: "zh_to_en",
      prompt: word.meaningZh,
      options,
      answerIndex: options.indexOf(word.display) as 0 | 1 | 2,
      audioBeforeAnswer: false,
    };
  }

  const distractors = pickDistractors(pool, target, "meaningZh", seed);
  const options = seededShuffle([word.meaningZh, ...distractors], seed);
  return {
    type: "en_to_zh",
    prompt: word.display,
    options,
    answerIndex: options.indexOf(word.meaningZh) as 0 | 1 | 2,
    audioBeforeAnswer: true,
  };
}

export function buildDailyQuiz(
  words: WordRecord[],
  reviews: ReviewState[],
  date: string,
  limit: number,
  dictCore: DictCoreWord[],
  sessionId: string,
): QuizItem[] {
  const selected = selectWordsForDay(reviews, words, date, limit);
  return selected.map((w, i) => {
    const type = pickType(w.id, date, w.display);
    const stem = buildStem(type, w, words, dictCore, date);
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
      isRetry: false,
    };
  });
}

export function makeRetryItem(item: QuizItem, index: number): QuizItem {
  return {
    ...item,
    id: `${item.sessionId}-retry-${index}`,
    chosenIndex: null,
    correct: null,
    isRetry: true,
  };
}

export { lemmaOf };
