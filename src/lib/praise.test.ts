import { describe, expect, it } from "vitest";
import { praiseCorrect, praiseFinish, praiseWrong } from "./praise";

const base = {
  combo: 1,
  type: "en_to_zh" as const,
  isRetry: false,
  repetitions: 1,
  lapses: 0,
  elapsedMs: 5000,
  seed: "w1",
};

describe("praiseCorrect", () => {
  it("夸堂末补回来的错题", () => {
    expect(praiseCorrect({ ...base, isRetry: true }).title).toBe("补回来了！");
  });

  it("夸连对，且带上题数", () => {
    expect(praiseCorrect({ ...base, combo: 5 }).title).toBe("连对 5 题！");
    expect(praiseCorrect({ ...base, combo: 10 }).title).toBe("连对 10 题！");
  });

  it("夸以前错过的词终于答对", () => {
    const p = praiseCorrect({ ...base, lapses: 3 });
    expect(p.title).toBe("终于拿下！");
    expect(p.note).toContain("3");
  });

  it("按题型夸到点上", () => {
    expect(praiseCorrect({ ...base, type: "cloze" }).title).toBe("拼写全对！");
    expect(praiseCorrect({ ...base, type: "zh_to_en", repetitions: 0 }).note).toContain("中译英");
  });

  it("答得快就夸反应快", () => {
    expect(praiseCorrect({ ...base, elapsedMs: 1200 }).title).toBe("反应真快！");
  });
});

describe("praiseWrong", () => {
  const w = {
    type: "cloze" as const,
    answer: "apple",
    chosen: "appre",
    display: "apple",
    lapses: 0,
    comboBefore: 0,
    seed: "x",
  };

  it("差一个字母时说清楚差在哪", () => {
    expect(praiseWrong(w).title).toBe("就差一个字母");
  });

  it("形近词提醒容易混", () => {
    const p = praiseWrong({
      ...w,
      type: "zh_to_en",
      answer: "quiet",
      chosen: "quite",
    });
    expect(p.title).toBe("这两个词长得像");
    expect(p.note).toContain("quiet");
  });

  it("先肯定前面的连对", () => {
    expect(praiseWrong({ ...w, type: "en_to_zh", comboBefore: 6 }).title).toContain("连对 6 题");
  });

  it("永远不说负面的话", () => {
    const p = praiseWrong({
      ...w,
      type: "en_to_zh",
      answer: "书",
      chosen: "笔",
    });
    expect(p.title).not.toMatch(/笨|错了吧|又/);
  });
});

describe("praiseFinish", () => {
  const f = {
    total: 10,
    correct: 7,
    retried: 0,
    retriedFixed: 0,
    bestCombo: 3,
    streak: 2,
    seed: "s",
  };

  it("满分单独夸", () => {
    expect(praiseFinish({ ...f, correct: 10 }).title).toBe("全对！一个都没错");
  });

  it("错题全部补回来单独夸", () => {
    expect(praiseFinish({ ...f, retried: 3, retriedFixed: 3 }).title).toBe("错的全补回来了！");
  });

  it("打卡满七天单独夸", () => {
    expect(praiseFinish({ ...f, streak: 14 }).title).toContain("14 天");
  });

  it("低正确率也给鼓励，不给负面评价", () => {
    const p = praiseFinish({ ...f, correct: 2 });
    expect(p.title).toBe("今天也坚持下来了");
    expect(p.note).toBeTruthy();
  });
});

describe("叫名字", () => {
  const w = {
    type: "en_to_zh" as const,
    answer: "书",
    chosen: "笔",
    display: "book",
    lapses: 0,
    comboBefore: 0,
    seed: "x",
  };
  const f = {
    total: 10,
    correct: 7,
    retried: 0,
    retriedFixed: 0,
    bestCombo: 3,
    streak: 2,
    seed: "s",
  };

  it("结算永远点名，用全角逗号", () => {
    expect(praiseFinish({ ...f, correct: 10, name: "小明" }).title).toBe("小明，全对！一个都没错");
    expect(praiseFinish({ ...f, retried: 3, retriedFixed: 3, name: "小明" }).title).toBe(
      "小明，错的全补回来了！",
    );
    expect(praiseFinish({ ...f, streak: 14, name: "小明" }).title).toBe("小明，连续打卡 14 天！");
    expect(praiseFinish({ ...f, correct: 2, name: "小明" }).title).toBe("小明，今天也坚持下来了");
  });

  it("答错的安慰都点名", () => {
    expect(praiseWrong({ ...w, name: "小明" }).title).toMatch(/^小明，/);
    const cloze = { ...w, type: "cloze" as const, answer: "apple", chosen: "appre", name: "小明" };
    expect(praiseWrong(cloze).title).toBe("小明，就差一个字母");
    const alike = {
      ...w,
      type: "zh_to_en" as const,
      answer: "quiet",
      chosen: "quite",
      name: "小明",
    };
    expect(praiseWrong(alike).title).toBe("小明，这两个词长得像");
    expect(praiseWrong({ ...w, comboBefore: 6, name: "小明" }).title).toBe("小明，刚才连对 6 题");
  });

  it("答对只在里程碑点名，平常那句保持干净", () => {
    expect(praiseCorrect({ ...base, isRetry: true, name: "小明" }).title).toBe("小明，补回来了！");
    expect(praiseCorrect({ ...base, combo: 5, name: "小明" }).title).toBe("小明，连对 5 题！");
    expect(praiseCorrect({ ...base, combo: 20, name: "小明" }).title).toBe("小明，连对 20 题！");
    expect(praiseCorrect({ ...base, lapses: 3, name: "小明" }).title).toBe("小明，终于拿下！");

    // 普通答对、连对 3/4 题、题型夸、反应快，都不点名
    expect(praiseCorrect({ ...base, combo: 3, name: "小明" }).title).toBe("连对 3 题");
    expect(praiseCorrect({ ...base, type: "cloze", name: "小明" }).title).toBe("拼写全对！");
    expect(praiseCorrect({ ...base, elapsedMs: 1200, name: "小明" }).title).toBe("反应真快！");
    expect(praiseCorrect({ ...base, name: "小明" }).title).not.toContain("小明");
  });

  it("名字为空时，每一句都和没有名字时逐字一致", () => {
    const correctCases = [
      base,
      { ...base, isRetry: true },
      { ...base, combo: 3 },
      { ...base, combo: 5 },
      { ...base, combo: 10 },
      { ...base, lapses: 1 },
      { ...base, lapses: 2 },
      { ...base, type: "cloze" as const },
      { ...base, type: "zh_to_en" as const, repetitions: 0 },
      { ...base, elapsedMs: 1200 },
      { ...base, repetitions: 0 },
      { ...base, repetitions: 4 },
    ];
    const wrongCases = [
      w,
      { ...w, type: "cloze" as const, answer: "apple", chosen: "appre" },
      { ...w, type: "zh_to_en" as const, answer: "quiet", chosen: "quite" },
      { ...w, comboBefore: 6 },
      { ...w, comboBefore: 2 },
      { ...w, lapses: 2 },
    ];
    const finishCases = [
      f,
      { ...f, correct: 10 },
      { ...f, retried: 3, retriedFixed: 3 },
      { ...f, streak: 7 },
      { ...f, correct: 9 },
      { ...f, bestCombo: 8 },
      { ...f, correct: 5 },
      { ...f, correct: 2 },
      { ...f, total: 0, correct: 0 },
    ];
    // 空串、纯空格、没给这个字段，三种写法都必须回到原样
    for (const empty of ["", "   ", undefined]) {
      for (const c of correctCases)
        expect(praiseCorrect({ ...c, name: empty })).toEqual(praiseCorrect(c));
      for (const c of wrongCases)
        expect(praiseWrong({ ...c, name: empty })).toEqual(praiseWrong(c));
      for (const c of finishCases)
        expect(praiseFinish({ ...c, name: empty })).toEqual(praiseFinish(c));
    }
  });

  it("名字自带标点或空格也拼得干净", () => {
    expect(praiseFinish({ ...f, correct: 10, name: "小明！" }).title).toBe(
      "小明，全对！一个都没错",
    );
    expect(praiseFinish({ ...f, correct: 10, name: "小明，" }).title).toBe(
      "小明，全对！一个都没错",
    );
    expect(praiseFinish({ ...f, correct: 10, name: " 小 明 " }).title).toBe(
      "小 明，全对！一个都没错",
    );
    // 12 个字的长名字（NAME_MAX）也只加一个逗号，不做别的处理
    const long = "王小明的英语小助手";
    expect(praiseFinish({ ...f, correct: 10, name: long }).title).toBe(`${long}，全对！一个都没错`);
  });
});
