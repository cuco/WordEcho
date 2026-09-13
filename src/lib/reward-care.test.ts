import { describe, expect, it } from "vitest";
import { isValidCare, settleCare } from "./reward-care";

describe("partner hunger by local calendar day", () => {
  it.each([2, 3, 5])("loses a fifth every %i days and locks after five ticks", (days) => {
    const care = { fullness: 5, settledOn: "2026-09-01" };
    const date = (day: number) => `2026-09-${String(day).padStart(2, "0")}`;
    expect(settleCare(care, days, date(days))).toEqual(care);
    expect(settleCare(care, days, date(days + 1))).toEqual({ fullness: 4, settledOn: date(days + 1) });
    expect(settleCare(care, days, date(days * 5 + 1)).fullness).toBe(0);
    expect(settleCare(care, days, "2027-01-01").fullness).toBe(0);
  });
  it("preserves partial cycles and does not revive after a backwards clock change", () => {
    const care = settleCare({ fullness: 5, settledOn: "2026-09-01" }, 3, "2026-09-06");
    expect(care).toEqual({ fullness: 4, settledOn: "2026-09-04" });
    expect(settleCare({ ...care, fullness: 5 }, 3, "2026-09-07").fullness).toBe(4);
    expect(settleCare(care, 3, "2026-09-02")).toEqual(care);
    expect(settleCare({ ...care, fullness: 0 }, 3, "2026-09-02").fullness).toBe(0);
  });
  it("handles month changes and DST calendar dates", () => {
    expect(settleCare({ fullness: 5, settledOn: "2026-03-07" }, 2, "2026-03-09").fullness).toBe(4);
    expect(settleCare({ fullness: 5, settledOn: "2026-12-30" }, 3, "2027-01-02")).toEqual({ fullness: 4, settledOn: "2027-01-02" });
  });
  it("rejects malformed backup care states", () => {
    for (const care of [null, {}, { fullness: 6, settledOn: "2026-09-01" }, { fullness: 2.5, settledOn: "2026-09-01" }, { fullness: 2, settledOn: "2026-02-30" }, { fullness: 2, settledOn: "bad" }]) expect(isValidCare(care)).toBe(false);
    expect(isValidCare({ fullness: 0, settledOn: "2026-09-01" })).toBe(true);
  });
});
