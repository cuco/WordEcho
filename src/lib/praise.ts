import { hashString } from "./hash";
import type { QuizItem } from "./types";

export type Praise = { title: string; note?: string };

function rotate(list: string[], seed: string): string {
  return list[hashString(seed) % list.length];
}

/**
 * 把名字接在标题前面：「小明，全对！一个都没错」。
 * 名字为空（多数孩子不会去填）时必须原样返回，文案和没有名字时逐字一致。
 * 只在值得叫名字的场合调用（见 DESIGN.md 8.4），一课 15 题不能句句点名。
 */
function withName(name: string | undefined, title: string): string {
  const who = (name ?? "")
    .replace(/\s+/g, " ")
    .trim()
    // 孩子可能自己敲了标点，去掉尾巴上的，免得出现「小明！，全对」
    .replace(/[，,。.！!？?、~～…]+$/u, "")
    .trim();
  if (!who) return title;
  return `${who}，${title}`;
}

export type CorrectContext = {
  /** 本课连对题数，含这一题 */
  combo: number;
  type: QuizItem["type"];
  /** 堂末错题再练 */
  isRetry: boolean;
  /** 这个词之前的复习次数，0 = 新词 */
  repetitions: number;
  /** 这个词历史答错次数 */
  lapses: number;
  elapsedMs: number;
  seed: string;
  /** 孩子自己填的名字，可空；只有里程碑那几句会点名 */
  name?: string;
};

export function praiseCorrect(c: CorrectContext): Praise {
  if (c.isRetry) {
    return { title: withName(c.name, "补回来了！"), note: "刚才错的词，这次记住了" };
  }
  if (c.combo >= 10 && c.combo % 10 === 0) {
    return { title: withName(c.name, `连对 ${c.combo} 题！`), note: "这一串真的漂亮" };
  }
  if (c.lapses >= 2) {
    return {
      title: withName(c.name, "终于拿下！"),
      note: `这个词以前错过 ${c.lapses} 次，今天记住了`,
    };
  }
  if (c.combo === 5) {
    return { title: withName(c.name, "连对 5 题！"), note: "手感来了，别停" };
  }
  if (c.combo >= 3) {
    return { title: `连对 ${c.combo} 题`, note: "稳得很" };
  }
  if (c.lapses === 1) {
    return { title: "扳回一城！", note: "上次栽在这个词上，这次答对了" };
  }
  if (c.type === "cloze") {
    return { title: "拼写全对！", note: "缺的字母一个没填错" };
  }
  if (c.type === "zh_to_en" && c.repetitions === 0) {
    return { title: "厉害！", note: "中译英最难，新词第一次就选对了" };
  }
  if (c.type === "zh_to_en") {
    return { title: "答对了！", note: "中译英能选对，说明真记住了" };
  }
  if (c.elapsedMs > 0 && c.elapsedMs < 2500) {
    return { title: "反应真快！", note: "想都没想就选对了" };
  }
  if (c.repetitions === 0) {
    return { title: "答对了！", note: "新词第一次见就记住了" };
  }
  if (c.repetitions >= 3) {
    return {
      title: "记得很牢！",
      note: `这个词你已经答对 ${c.repetitions} 次了`,
    };
  }
  return {
    title: rotate(["答对了！", "漂亮！", "好样的！", "就是这个！"], c.seed),
  };
}

export type WrongContext = {
  type: QuizItem["type"];
  /** 正确的那个选项文字 */
  answer: string;
  /** 孩子选的那个选项文字 */
  chosen: string;
  /** 这个词的英文 */
  display: string;
  lapses: number;
  /** 答错前的连对数 */
  comboBefore: number;
  seed: string;
  /** 孩子自己填的名字，可空；答错时每一句都点名，安慰要说给人听 */
  name?: string;
};

export function praiseWrong(w: WrongContext): Praise {
  if (w.type === "cloze" && lettersOff(w.answer, w.chosen) === 1) {
    return { title: withName(w.name, "就差一个字母"), note: "再看一眼，下一次肯定对" };
  }
  if (w.type !== "en_to_zh" && looksAlike(w.answer, w.chosen)) {
    return {
      title: withName(w.name, "这两个词长得像"),
      note: `${w.chosen} 和 ${w.answer} 只差一点，容易混`,
    };
  }
  if (w.comboBefore >= 5) {
    return {
      title: withName(w.name, "刚才连对 " + w.comboBefore + " 题"),
      note: "这一个不算什么，继续",
    };
  }
  if (w.lapses >= 2) {
    return { title: withName(w.name, "这个词有点难缠"), note: "多见几次就熟了，我们明天再来找它" };
  }
  if (w.comboBefore >= 2) {
    return { title: withName(w.name, "没关系"), note: "前面答得很好，这个记住就行" };
  }
  return {
    title: withName(w.name, rotate(["没关系", "差一点", "再记一次"], w.seed)),
    note: rotate(
      ["错过的词才记得牢", "现在看清楚了，就是赚到", "记住它，明天还会见面"],
      w.seed + "n",
    ),
  };
}

export type FinishContext = {
  /** 本课正式题数 */
  total: number;
  correct: number;
  /** 堂末再练的题数 */
  retried: number;
  /** 堂末再练里答对的题数 */
  retriedFixed: number;
  /** 本课最长连对 */
  bestCombo: number;
  streak: number;
  seed: string;
  /** 孩子自己填的名字，可空；结算是最值得点名的地方，每一句都带 */
  name?: string;
};

export function praiseFinish(f: FinishContext): Praise {
  const acc = f.total ? Math.round((f.correct / f.total) * 100) : 0;
  if (f.total > 0 && f.correct === f.total) {
    return {
      title: withName(f.name, "全对！一个都没错"),
      note: `${f.total} 道题满分，今天这一课无敌了`,
    };
  }
  if (f.retried > 0 && f.retriedFixed === f.retried) {
    return {
      title: withName(f.name, "错的全补回来了！"),
      note: `${f.retried} 个错词当场就改对，这才是真本事`,
    };
  }
  if (f.streak >= 7 && f.streak % 7 === 0) {
    return { title: withName(f.name, `连续打卡 ${f.streak} 天！`), note: "坚持这么久，太不容易了" };
  }
  if (acc >= 90) {
    return { title: withName(f.name, "太厉害了！"), note: `正确率 ${acc}%，只差一点点就满分` };
  }
  if (f.bestCombo >= 6) {
    return { title: withName(f.name, "手感超好！"), note: `中间一口气连对了 ${f.bestCombo} 题` };
  }
  if (acc >= 70) {
    return { title: withName(f.name, "干得漂亮！"), note: `正确率 ${acc}%，稳步在进步` };
  }
  if (acc >= 40) {
    return { title: withName(f.name, "完成啦！"), note: "错的词都记下了，明天它们还会来找你" };
  }
  return {
    title: withName(f.name, "今天也坚持下来了"),
    note: "难的词多见几次就熟了，来一次算一次",
  };
}

/** 完形填空里差几个字母 */
function lettersOff(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x.length !== y.length) return Math.abs(x.length - y.length) + 1;
  let n = 0;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) n++;
  return n;
}

function looksAlike(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x === y) return false;
  if (x[0] !== y[0]) return false;
  return Math.abs(x.length - y.length) <= 2;
}
