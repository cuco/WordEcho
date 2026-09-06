import { describe, expect, it } from "vitest";
import { kidGloss } from "./kid-gloss";
import { isPlaceholderExample, makeExample } from "./make-example";

describe("kidGloss", () => {
  it("keeps a short Chinese sense", () => {
    expect(kidGloss("苹果")).toBe("苹果");
  });

  it("drops dictionary POS junk and adult senses", () => {
    expect(kidGloss("猪肉 vt. 与女子性交")).toBe("猪肉");
    expect(kidGloss("n. 早晨；黎明；初期")).toBe("早晨");
  });
});

describe("makeExample", () => {
  it("uses real noun grammar, not This is", () => {
    expect(makeExample("cat", "n", "猫")).toEqual({
      en: "I have a cat.",
      zh: "我有一只猫。",
    });
    expect(makeExample("apple", "n", "苹果").en).toBe("I have an apple.");
    expect(makeExample("water", "n", "水").en).toBe("I drink water.");
  });

  it("uses verbs, adjectives and phrases correctly", () => {
    expect(makeExample("swim", "v", "游泳").en).toBe("I can swim.");
    expect(makeExample("red", "adj", "红色的").en).toBe("The cake is red.");
    expect(makeExample("sunny", "adj", "晴朗的").en).toBe("It is sunny today.");
    expect(makeExample("hungry", "adj", "饥饿的").en).toBe("I am hungry.");
    expect(makeExample("stand up", "phr", "站起来").en).toBe("Please stand up.");
    expect(makeExample("afternoon", "n", "下午").en).toBe("See you this afternoon.");
  });

  it("never emits the placeholder pattern for normal content words", () => {
    const rows = [
      makeExample("evening", "n", "晚上"),
      makeExample("arrive", "v", "到达"),
      makeExample("pork", "n", "猪肉 vt. 与女子性交"),
    ];
    for (const ex of rows) {
      expect(isPlaceholderExample(ex)).toBe(false);
      expect(ex.en.toLowerCase().startsWith("this is")).toBe(false);
    }
    expect(makeExample("pork", "n", "猪肉 vt. 与女子性交").zh).toBe("我吃猪肉。");
  });
});
