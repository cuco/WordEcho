import { describe, expect, it } from "vitest";
import { applyAnswer, newReview } from "./srs";
import { addDays } from "./types";

describe("srs", () => {
  it("schedules new correct word for tomorrow", () => {
    const r = applyAnswer(newReview("w1", "2026-09-06"), true, "2026-09-06");
    expect(r.intervalDays).toBe(1);
    expect(r.repetitions).toBe(1);
    expect(r.dueAt).toBe("2026-09-07");
  });

  it("second success is three days", () => {
    const r1 = applyAnswer(newReview("w1", "2026-09-06"), true, "2026-09-06");
    const r2 = applyAnswer(r1, true, "2026-09-07");
    expect(r2.intervalDays).toBe(3);
    expect(r2.dueAt).toBe("2026-09-10");
  });

  it("wrong answer resets to tomorrow", () => {
    const r1 = applyAnswer(newReview("w1", "2026-09-06"), true, "2026-09-06");
    const r2 = applyAnswer(r1, true, "2026-09-07");
    const r3 = applyAnswer(r2, false, "2026-09-10");
    expect(r3.repetitions).toBe(0);
    expect(r3.intervalDays).toBe(1);
    expect(r3.dueAt).toBe("2026-09-11");
    expect(r3.lapses).toBe(1);
  });

  it("third success multiplies ease", () => {
    let r = newReview("w1", "2026-09-01");
    r = applyAnswer(r, true, "2026-09-01");
    r = applyAnswer(r, true, "2026-09-02");
    r = applyAnswer(r, true, "2026-09-05");
    expect(r.intervalDays).toBeGreaterThanOrEqual(4);
    expect(r.dueAt).toBe(addDays("2026-09-05", r.intervalDays));
  });
});
