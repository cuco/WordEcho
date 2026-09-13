import { describe, expect, it } from "vitest";
import { dictCoreWords } from "../data/dict-core";
import { builtinPacks } from "../data/packs";
import { buildDailyQuiz, buildStem, isQuizItemValid, pickType, selectWordsForDay } from "./quiz";
import { newReview } from "./srs";
import type { WordRecord } from "./types";

function word(id: string, display: string, zh: string): WordRecord {
  return {
    id,
    lemma: display.toLowerCase(),
    display,
    ipa: "/x/",
    meaningZh: zh,
    pos: "n",
    examples: [{ en: `${display} is good.`, zh: `${zh}很好。` }],
    sources: [],
    enrichStatus: "complete",
    createdAt: "",
    updatedAt: "",
  };
}

describe("quiz", () => {
  it("picks type deterministically", () => {
    expect(pickType("a", "2026-09-06", "elephant")).toBe(pickType("a", "2026-09-06", "elephant"));
  });

  it("one item per word per day", () => {
    const words = [
      word("1", "elephant", "大象"),
      word("2", "cat", "猫"),
      word("3", "dog", "狗"),
      word("4", "bird", "鸟"),
    ];
    const reviews = words.map((w) => newReview(w.id, "2026-09-06"));
    const items = buildDailyQuiz(words, reviews, "2026-09-06", 15, dictCoreWords, "s1");
    const ids = items.map((i) => i.wordId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(items.every((i) => i.options.length === 3)).toBe(true);
  });

  it("caps due words by lapses", () => {
    const words = Array.from({ length: 20 }, (_, i) => word(String(i), `word${i}xx`, `义${i}`));
    const reviews = words.map((w, i) => ({
      ...newReview(w.id, "2026-09-06"),
      lapses: i,
    }));
    const selected = selectWordsForDay(reviews, words, "2026-09-06", 5);
    expect(selected).toHaveLength(5);
  });

  it("never uses English placeholders as Chinese answer options", () => {
    const target = word("ant", "ant", "蚂蚁");
    const pool = [target, word("ink", "ink", "ink"), word("up", "up", "up")];
    for (let day = 1; day <= 30; day++) {
      const stem = buildStem("en_to_zh", target, pool, dictCoreWords, `2026-09-${day}`);
      expect(stem.prompt).toBe("ant");
      expect(stem.options.every((option) => /\p{Script=Han}/u.test(option))).toBe(true);
      expect(new Set(stem.options).size).toBe(3);
      expect(stem.options[stem.answerIndex]).toBe("蚂蚁");
    }
    expect(() => buildStem("en_to_zh", pool[1], pool, dictCoreWords, "2026-09-13")).toThrow("中文释义");
  });

  it("skips incomplete and English-only words in due, new and early-review slots", () => {
    const good = word("good", "cat", "猫");
    const pending = { ...word("pending", "dog", "狗"), enrichStatus: "pending" as const };
    const invalid = word("invalid", "up", "up");
    const words = [good, pending, invalid];
    for (const dueAt of ["2026-09-12", "2026-09-13", "2026-09-14"]) {
      const reviews = words.map((w) => ({ ...newReview(w.id, dueAt), repetitions: 2 }));
      expect(selectWordsForDay(reviews, words, "2026-09-13", 15).map((w) => w.id)).toEqual(["good"]);
    }
  });

  it("uses the expected languages and audio rules for every built-in translation question", () => {
    for (const pack of builtinPacks) {
      const words = pack.words.map((w, index) => word(`${pack.id}-${index}`, w.word, w.zh));
      for (const w of words) {
        for (const type of ["en_to_zh", "zh_to_en"] as const) {
          const stem = buildStem(type, w, words, dictCoreWords, "2026-09-13");
          const item = { ...stem, id: w.id, sessionId: "test", wordId: w.id,
            chosenIndex: null, correct: null, isRetry: false };
          expect(isQuizItemValid(item, w), `${pack.id}: ${w.display} ${type}`).toBe(true);
        }
      }
    }
  });
});
