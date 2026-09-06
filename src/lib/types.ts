export type WordSourceKind = "textbook" | "reading" | "pack" | "paste";

export type Example = { en: string; zh: string };

export type WordSource = {
  kind: WordSourceKind;
  packId?: string;
  grade?: string;
  volume?: string;
  unit?: string;
  note?: string;
};

export type WordRecord = {
  id: string;
  lemma: string;
  display: string;
  ipa: string | null;
  meaningZh: string;
  pos: string | null;
  examples: Example[];
  sources: WordSource[];
  enrichStatus: "complete" | "pending" | "failed";
  createdAt: string;
  updatedAt: string;
};

export type ReviewState = {
  wordId: string;
  ease: number;
  intervalDays: number;
  repetitions: number;
  dueAt: string;
  lastResult: "again" | "good" | null;
  lapses: number;
};

export type QuizType = "en_to_zh" | "zh_to_en" | "cloze";

export type QuizItem = {
  id: string;
  sessionId: string;
  wordId: string;
  type: QuizType;
  prompt: string;
  options: string[];
  answerIndex: 0 | 1 | 2;
  cloze?: { wordShown: string; blanks: string };
  audioBeforeAnswer: boolean;
  chosenIndex: 0 | 1 | 2 | null;
  correct: boolean | null;
  isRetry: boolean;
};

export type QuizSession = {
  id: string;
  date: string;
  itemIds: string[];
  currentIndex: number;
  finishedAt: string | null;
  xpEarned: number;
  kind?: "daily" | "practice";
};

export type UserPrefs = {
  id: "prefs";
  name?: string;
  dailyLimit: number;
  ttsLang: "en-US" | "en-GB";
  ttsRate: number;
  ttsVoice?: string | null;
  soundOn?: boolean;
  /** 亮答案后自动念一遍单词，默认开 */
  autoSpeak?: boolean;
  streakDays: number;
  lastStudyDate: string | null;
  studyDates: string[];
  xpToday: number;
  xpDate: string | null;
  aiBaseUrl?: string;
  aiApiKey?: string;
  aiModel?: string;
};

export type PackWord = {
  word: string;
  lemma?: string;
  ipa: string;
  pos: string;
  zh: string;
  examples: Example[];
  unit: string;
};

export type WordPack = {
  id: string;
  title: string;
  curriculum: string;
  grade: string;
  volume: string;
  language: "en";
  version: 1;
  words: PackWord[];
};

export type DictCoreWord = {
  lemma: string;
  display: string;
  ipa: string;
  pos: string;
  zh: string;
  examples: Example[];
};

export type DictCore = {
  version: 1;
  words: DictCoreWord[];
};

/** Compact offline lookup dict (not a study bank). */
export type DictLookup = {
  version: 1;
  /** lemma → [ipa, pos, zh] */
  w: Record<string, [string, string, string]>;
  /** inflection → lemma (never overrides an existing lemma key) */
  f: Record<string, string>;
};

export type DictLookupWord = {
  lemma: string;
  display: string;
  ipa: string;
  pos: string;
  zh: string;
};

export type ResolvedWord = {
  lemma: string;
  display: string;
  ipa: string | null;
  meaningZh: string;
  pos: string | null;
  examples: Example[];
  enrichStatus: "complete" | "pending" | "failed";
  source: "local" | "dict-core" | "dict-lookup" | "pack" | "ai" | "inline";
};

export function lemmaOf(word: string): string {
  return word.toLowerCase().trim();
}

export function todayLocal(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return todayLocal(dt);
}

export function uuid(): string {
  return crypto.randomUUID();
}
