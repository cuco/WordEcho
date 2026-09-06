import { describe, expect, it } from "vitest";
import { dictCoreWords } from "../data/dict-core";
import { buildDailyQuiz, pickType, selectWordsForDay } from "./quiz";
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
});
