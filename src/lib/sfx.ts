/**
 * 全部用 Web Audio 合成，不打包音频文件，离线也能响。
 * iPad Safari 只允许在用户手势里起 AudioContext，所有播放都挂在点击后。
 *
 * 只用「音」不用「噪声」：合成的掌声在 iPad 外放上怎么调都像静电，已经整条移除。
 * 现在答对 / 里程碑 / 结算都是钟琴式的音符——正弦分音 + 微失谐 + 柔起音 + 自然衰减，
 * 这类声音合成出来是可信的，也不会盖住紧接着的单词朗读。
 */
let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(v: boolean): void {
  enabled = v;
}

function audio(): AudioContext | null {
  if (!enabled) return null;
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/* ---------- 每个 AudioContext 一套共享节点 ---------- */

/**
 * 总输出增益。iPad 外放不响，所以单个音符合成时留足余量，最后统一抬起来。
 * 每个音的振幅都归一化过（见 `voice()`），叠两三个音也够不到 1.0。
 */
const MASTER = 2.2;

type Graph = {
  /** 总线 → destination，所有声音都进这里 */
  master: GainNode;
};

const graphs = new WeakMap<BaseAudioContext, Graph>();

function graph(ac: BaseAudioContext): Graph {
  const cached = graphs.get(ac);
  if (cached) return cached;

  const master = ac.createGain();
  master.gain.value = MASTER;
  master.connect(ac.destination);

  const g: Graph = { master };
  graphs.set(ac, g);
  return g;
}

/* ---------- 钟琴音色 ---------- */

type Partial = {
  /** 相对基频的倍数；略微不整数才有真实乐器的「不谐」感 */
  ratio: number;
  /** 失谐（音分），同一个 ratio 上放两个略微失谐的振荡器会慢慢拍频，听着暖 */
  detune: number;
  /** 相对音量，最终会归一化 */
  level: number;
  /** 衰减时间相对 dur 的比例；高次分音衰减更快，才像敲击而不是风琴 */
  decay: number;
  /** 亮度参数只作用在 upper === true 的分音上 */
  upper?: boolean;
};

/**
 * 基频一对微失谐的正弦打底，上面叠 2x / 3x / 5x 的快速衰减分音。
 * 单纯的三角波太「电子琴」，这套分音更接近马林巴 / 音铃。
 */
const BELL: Partial[] = [
  { ratio: 1, detune: -4, level: 1, decay: 1 },
  { ratio: 1, detune: 5, level: 0.5, decay: 0.92 },
  { ratio: 2.01, detune: 0, level: 0.28, decay: 0.5, upper: true },
  { ratio: 3.02, detune: 0, level: 0.11, decay: 0.28, upper: true },
  { ratio: 4.97, detune: 0, level: 0.045, decay: 0.16, upper: true },
];

type VoiceOpts = {
  /** 基频衰减到听不见所需的时间（秒） */
  dur: number;
  /** 目标峰值振幅（进总线之前） */
  gain: number;
  /** 起音时间；再快就会有「咔」的点击声 */
  attack?: number;
  /** 高次分音的音量倍数，>1 更亮更「玻璃」 */
  bright?: number;
  /** 出口低通，收掉过亮的边角 */
  cutoff?: number;
};

function voice(ac: BaseAudioContext, freq: number, at: number, o: VoiceOpts): void {
  const { dur, gain, attack = 0.007, bright = 1, cutoff = 5200 } = o;

  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = cutoff;
  lp.Q.value = 0.3;
  lp.connect(graph(ac).master);

  // 归一化：把 gain 当成整个音的峰值，而不是每个分音各自的峰值
  const sum = BELL.reduce((a, p) => a + p.level * (p.upper ? bright : 1), 0);

  for (const p of BELL) {
    const level = (p.level * (p.upper ? bright : 1)) / sum;
    if (level < 0.002) continue;
    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq * p.ratio;
    osc.detune.value = p.detune;

    const g = ac.createGain();
    const end = at + Math.max(0.04, dur * p.decay);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain * level, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(g).connect(lp);
    osc.start(at);
    osc.stop(end + 0.02);
  }
}

/* ---------- 朴素音符（答错专用，保持原样） ---------- */

function tone(
  ac: BaseAudioContext,
  freq: number,
  at: number,
  dur: number,
  gain = 0.16,
  type: OscillatorType = "triangle",
): void {
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g).connect(graph(ac).master);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

/* ---------- 对外的四个提示音 ---------- */

export type Cue = "correct" | "combo" | "wrong" | "finish";

/**
 * 把一个提示音排到 `at`。play* 用它，离线渲染（tmp-audio 里的 wav）也用它，
 * 保证「导出来听的」和「iPad 上响的」是同一段代码。
 */
export function scheduleCue(ac: BaseAudioContext, cue: Cue, at: number, combo = 1): void {
  switch (cue) {
    case "correct": {
      // 连对越多，音高和亮度往上走一点，但保持同一个音色
      const lift = Math.min(combo - 1, 4) / 4;
      const bright = 0.85 + lift * 0.75;
      const cutoff = 3600 + lift * 2600;
      voice(ac, 659.25 * (1 + 0.03 * lift), at, {
        dur: 0.3,
        gain: 0.2,
        bright,
        cutoff,
      });
      voice(ac, 987.77 * (1 + 0.03 * lift), at + 0.08, {
        dur: 0.42,
        gain: 0.2,
        bright,
        cutoff,
      });
      return;
    }
    case "combo": {
      // 里程碑：高一个八度的三连音，更亮、更「闪」，叠在答对音后面
      const notes = [1046.5, 1318.51, 1567.98];
      notes.forEach((f, i) => {
        voice(ac, f, at + 0.06 + i * 0.075, {
          dur: i === notes.length - 1 ? 0.5 : 0.24,
          gain: 0.13,
          attack: 0.004,
          bright: 1.7,
          cutoff: 7000,
        });
      });
      return;
    }
    case "wrong": {
      tone(ac, 320, at, 0.16, 0.13, "sine");
      tone(ac, 250, at + 0.13, 0.26, 0.13, "sine");
      return;
    }
    case "finish": {
      // 上行琶音 C-E-G-C，落在 C 大三和弦上收住：不用掌声也听得出「这一课结束了」
      const run = [523.25, 659.25, 783.99, 1046.5];
      run.forEach((f, i) => {
        voice(ac, f, at + i * 0.1, {
          dur: i === run.length - 1 ? 0.5 : 0.3,
          gain: 0.13,
          bright: 1.2,
          cutoff: 5600,
        });
      });
      // 收尾和弦，衰减长一点，像余韵
      const chord = [261.63, 392, 523.25, 783.99];
      chord.forEach((f, i) => {
        voice(ac, f, at + 0.46 + i * 0.012, {
          dur: 1.5,
          gain: 0.075,
          attack: 0.012,
          bright: 0.8,
          cutoff: 4200,
        });
      });
      voice(ac, 1567.98, at + 0.5, { dur: 1.1, gain: 0.05, bright: 1.5, cutoff: 7000 });
      return;
    }
  }
}

/** 答对：一组上行的暖钟音，连对越多越亮 */
export function playCorrect(combo = 1): void {
  const ac = audio();
  if (ac) scheduleCue(ac, "correct", ac.currentTime, combo);
}

/** 答错：柔和的下行两声，绝不刺耳 */
export function playWrong(): void {
  const ac = audio();
  if (ac) scheduleCue(ac, "wrong", ac.currentTime);
}

/** 结算：上行琶音 + 收在大三和弦上的余韵 */
export function playFinish(): void {
  const ac = audio();
  if (ac) scheduleCue(ac, "finish", ac.currentTime);
}

/** 连对里程碑：高八度的三连闪音 */
export function playCombo(): void {
  const ac = audio();
  if (ac) scheduleCue(ac, "combo", ac.currentTime);
}
