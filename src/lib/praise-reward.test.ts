import { describe, expect, it } from "vitest";
import { praiseReward } from "./praise";

describe("reward praise", () => {
  it.each([
    [1, 1, "第一位小伙伴，来啦！"],
    [2, 2, "你的努力，变成了小惊喜！"],
    [4, 4, "一个主题，集齐啦！"],
    [12, 4, "整本贴纸册，都被你点亮了！"],
  ])("celebrates %i collected with %i in the theme", (collected, themeCollected, title) => {
    expect(praiseReward({ collected, total: 12, themeCollected, themeTotal: 4 }).title).toBe(title);
  });
});
