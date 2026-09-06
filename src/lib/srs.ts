import type { ReviewState } from "./types";
import { addDays } from "./types";

export function newReview(wordId: string, today: string): ReviewState {
  return {
    wordId,
    ease: 2.5,
    intervalDays: 0,
    repetitions: 0,
    dueAt: today,
    lastResult: null,
    lapses: 0,
  };
}

export function applyAnswer(
  review: ReviewState,
  correct: boolean,
  today: string,
): ReviewState {
  if (!correct) {
    return {
      ...review,
      repetitions: 0,
      intervalDays: 1,
      ease: Math.max(1.3, review.ease - 0.2),
      lapses: review.lapses + 1,
      lastResult: "again",
      dueAt: addDays(today, 1),
    };
  }

  if (review.repetitions === 0) {
    return {
      ...review,
      intervalDays: 1,
      repetitions: 1,
      lastResult: "good",
      dueAt: addDays(today, 1),
    };
  }

  if (review.repetitions === 1) {
    return {
      ...review,
      intervalDays: 3,
      repetitions: 2,
      lastResult: "good",
      dueAt: addDays(today, 3),
    };
  }

  const intervalDays = Math.max(4, Math.round(review.intervalDays * review.ease));
  return {
    ...review,
    intervalDays,
    repetitions: review.repetitions + 1,
    ease: Math.min(2.8, review.ease + 0.1),
    lastResult: "good",
    dueAt: addDays(today, intervalDays),
  };
}
