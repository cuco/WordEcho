import { describe, expect, it } from "vitest";
import { parseImportText } from "./parse-import";

describe("parseImportText", () => {
  it("parses slash chinese", () => {
    const rows = parseImportText("apple / 苹果\nbanana");
    expect(rows[0].word).toBe("apple");
    expect(rows[0].zh).toBe("苹果");
    expect(rows[1].zh).toBeUndefined();
  });

  it("marks invalid lines", () => {
    expect(parseImportText("123")[0].invalid).toBe(true);
  });
});
