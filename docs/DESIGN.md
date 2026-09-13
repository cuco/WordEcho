# WordEcho 设计文档

本文档是产品与实现的单一事实来源。后续用 AI 实现时，应先读本文，再改代码；不要另起一套数据模型或复习算法。

技术栈：**Web + TypeScript**（Vite + React + Dexie），目标设备：**iPad**（Safari「添加到主屏幕」的 PWA）。交互参考多邻国：学习路径、单题全屏、大选项、底部「检查 / 继续」、结算页。

同时兼容 Android 平板上的 Chromium PWA。iPad 与 Android 平板在浏览器模式首次打开时必须先完成安装，再从桌面图标进入学习；桌面浏览器仍可直接用于预览和调试。

---

## 1. 产品一句话

WordEcho 是给小学生用的**本地优先**记单词 PWA：把课文词包一次导入、把读物生词速记入库（释义优先离线词典，未命中再 AI），再按遗忘曲线每天生成三类选择题，并支持发音与跟读。**背单词考题是主功能。**查询用大字典（`dict-lookup`）不当背单词词库。

## 2. 三大功能

| 优先级 | 功能 | 说明 |
| --- | --- | --- |
| P0 | **背单词考题** | 每日按 SRS 组卷；三种题型；听发音 / 跟读；多邻国式课时节奏 |
| P1 | **一次性录入（词包）** | AI 预先生成词表 JSON 放进工程；App 从内置词包或文件导入 |
| P1 | **单词速记** | 只输入英文；释义走 `resolveWord()`（离线词典 → AI） |

不做：账号、云同步、班级排行、生命值扣心、家长端独立 App、真人录音库（用系统 TTS）。

## 3. 信息架构（iPad）

底部四个主入口，**学习**绝对主位：

1. **学习** — 顶部连胜 / XP / 今日目标；一张主卡片一个「开始学习」按钮；下面打卡日历
2. **词库** — 搜索 + 状态标签；单词详情（听 / 跟读）
3. **录入** — 打开就是速记输入框；批量词包折叠在下方
4. **奖励** — 用学习积分兑换贴纸；剪影揭晓、喂养伙伴（`/rewards`）

设置（每日题量、TTS、AI Key、导出）放在学习页右上角齿轮，不单独占 Tab。

```mermaid
flowchart TB
  Learn[学习页] --> Lesson[课时单题]
  Lesson --> Feedback[结果条]
  Feedback --> Lesson
  Feedback --> Celebrate[结算页]
  Bank[词库] --> Detail[单词详情]
  Import[录入] --> Pack[词包导入]
  Import --> Quick[单词速记]
  Import --> Paste[粘贴补充]
  Pack --> Bank
  Quick --> Bank
```

---

## 4. 功能一：一次性录入（词包）

### 4.1 工作流

词表不在 iPad 上手敲中文。流程是：

```
电脑上整理纯单词列表
  → scripts/gen-pack.ts 调 AI 生成 pack JSON
  → 人工核对
  → 提交到 src/data/packs/<pack-id>.json
  → iPad App「录入 → 词包」选择内置词包一键导入
     （也支持从 Files 选一个同 schema 的 JSON 文件）
```

粘贴文本框保留为补充手段（临时加几行词），走同一套 `resolveWord()`。

### 4.2 词包 JSON Schema

文件路径：`src/data/packs/<pack-id>.json`

```ts
type WordPack = {
  id: string;                 // 如 "pep-g3-vol1"
  title: string;              // "人教 PEP 三年级上"
  curriculum: string;         // "pep" | "fltrp" | "other"
  grade: string;              // "三年级"
  volume: string;             // "上册"
  language: "en";
  version: 1;
  words: PackWord[];
};

type PackWord = {
  word: string;               // 展示形态，如 "elephant"
  lemma?: string;             // 缺省则 word.toLowerCase().trim()
  ipa: string;                // "/ˈelɪfənt/"
  pos: string;                // "n" | "v" | "adj" | "adv" | "prep" | "phr" | ...
  zh: string;                 // ≤ 16 个汉字，小学生白话
  examples: { en: string; zh: string }[];  // 1～2 条
  unit: string;               // "Unit 2" / 课文名
};
```

约束：

- 同一 pack 内 `lemma` 唯一。
- `zh` 禁止超纲义、俚语、成人语境。
- `zh` 必须包含中文，不能用英文原词占位；词包生成和数据校验均拒绝纯英文释义。
- 例句以简单现在时为主。
- New Magic 3A / 3B 的 270 条原创双语例句按词条当前义项逐条编写、复核，预存在词包及词表第 5、6 列；重新生成词包必须保留这两列，不再用词性模板覆盖。例句复核记录见 `docs/NEW-MAGIC-3-EXAMPLES.md`。
- 已导入这两册的本机词条在读取词库或课时时自动更新例句：必须同时匹配来源、lemma、词义、词性以及已知旧例句全文（空例句也可补齐）；自定义例句及其它义项保留。更新只写词条的 `examples` / `updatedAt`，不新增词条、不修改 SRS、课时、XP 或收藏。重新导入同册也遵守此规则。
- 展示时过滤缺少英文正文或正文仅为空白的例句；没有有效例句时，词条详情、答题反馈和录入结果均隐藏例句区域及例句播放按钮，不显示占位内容。中文翻译为空时不显示空行或分隔符。

### 4.3 精品兜底词典 `dict-core`

文件路径：`src/data/dict-core.json`

```ts
type DictCore = {
  version: 1;
  words: {
    lemma: string;
    display: string;
    ipa: string;
    pos: string;
    zh: string;
    examples: { en: string; zh: string }[];
  }[];
};
```

用途：

1. 单词速记 / 粘贴时优先本地命中释义（质量高于大字典）。
2. 选择题干扰项不足时兜底（**仅用本文件，不用查询词典**）。
3. 目标规模约 2000～3000 小学高频词（可分期扩充）。

### 4.3b 查询词典 `dict-lookup`（不当背单词）

文件路径：`src/data/dict-lookup.json`（由 `scripts/build-dict-lookup.ts` 从 [ECDICT](https://github.com/skywind3000/ECDICT) 筛常用子集生成，约 2～3 万词）。

```ts
type DictLookup = {
  version: 1;
  /** lemma → [ipa, pos, zh]；无例句 */
  w: Record<string, [string, string, string]>;
  /** 屈折形 → lemma；已有 lemma 键不被覆盖 */
  f: Record<string, string>;
};
```

硬边界：

- **只用于查询**：`resolveWord()` 在本机词库 / dict-core / pack 未命中时查本文件。
- **绝不批量导入** IndexedDB 词库或 SRS；只有孩子点「添加」保存的那一条才进复习队列。
- **组卷选词 / 词库列表 / 干扰项** 都不读 `dict-lookup`。
- 无例句；`zh` **保留 ECDICT 全部常用义项**（POS 组之间用 `；` 连接，去掉 `[计]`/`[医]` 等专业尾巴），软上限约 120 字（超长在义项边界截断）。与 dict-core / pack 的 ≤16 字白话不同——后者仍用于学习卡片与干扰项。CSV 源文件不进仓库。

### 4.4 生成与校验脚本

| 脚本 | 职责 |
| --- | --- |
| `scripts/gen-pack.ts` | 输入：纯单词列表（txt，一行一词）+ 元数据（curriculum/grade/volume）。调 OpenAI 兼容 API，批量产出 `PackWord` 字段，写出 `src/data/packs/<id>.json`。每批最多 40 词。 |
| `scripts/build-dict-lookup.ts` | 从 ECDICT CSV 筛常用词，写出 `dict-lookup.json` + 屈折索引；`zh` 保留全部常用义项（软上限 ~120 字）。 |
| `scripts/validate-data.ts` | 校验 pack 与 dict-core（含 examples，zh ≤16）；校验 dict-lookup（lemma 去重、zh 非空、zh ≤120，不要求 examples）。失败则 `npm run check` 非零退出。 |

提示词固化在 `scripts/prompts/enrich-words.ts`：面向中国小学生、短白话、禁止超纲。

### 4.5 App 内导入 UX

- 列表展示工程内已打包的词包（title、词数、是否已导入）。
- 「导入」：合并进本地词库；已存在的 lemma 合并 `sources`，不复制卡片；新词初始化 `ReviewState`。
- 「从文件导入」：用户选 JSON，校验 schema 后同上。
- 导入全程离线（词包已含释义）。

---

## 5. 功能二：单词速记

场景：读课外书时看到生词，只打英文。

```
输入 1 个或多个英文词（空格 / 换行）
  → 对每个词调用 resolveWord()
  → 展示结果卡（可改 zh / 例句）
  → 保存；新词进入复习队列
```

**禁止**把中文意思做成必填输入框。

### 5.1 `resolveWord(lemma)` 统一解析

```
1. 查本地词库（已录入）→ 返回已有记录（可只加 reading 来源）
2. 查 dict-core → 命中则直接 complete
3. 查内置 pack 索引（课文释义更好；与 1 合并后通常已覆盖已导入词）
4. 查 dict-lookup（含屈折形）→ 命中则 complete；字典本身不进复习队列
5. 有 AI Key 且联网 → 调 AI 补全 → complete
6. 否则 → enrichStatus = "pending" | "failed"；单词仍保存，可重试
```

粘贴补充路径同一逻辑；若行内已带中文（`apple / 苹果`），则 `zh` 采用行内值，音标 / 例句仍尽量从 dict-core / dict-lookup 或 AI 补。

---

## 6. 功能三：背单词考题（主功能）

### 6.1 多邻国式课时节奏

1. **学习页**：只有一张绿色主卡片 + 一个「开始学习」按钮（今日已完成时变「再练一组」），下面是打卡日历（`prefs.studyDates` 标橙点，今天描蓝虚线圈）。**不出现 Unit 列表**。加练走 `startPractice()`，优先抽今日到期但没排进配额的词，且不写 SRS。
2. **进入课时**：全屏单题；顶部进度条；大选项（≥ 56px 触摸高）；底部固定「检查」。
3. **提交后**：底部升起绿 / 红结果条（文字说明对错，不只靠颜色）；「听一听」「我来读」用圆角图标按钮（喇叭 / 麦克风），不用文字按钮。结果出现后，「继续」禁用 5 秒，按钮显示「继续（5秒）」并逐秒倒计时，结束后恢复「继续」并允许点击，给孩子留出阅读释义和例句的时间。答对、答错、加练和堂末再练均适用；重新打开已答题的结果页重新等待 5 秒。等待期间可听发音和跟读；结算页返回学习页的「继续」不受此限制。
4. **本课答错的词**：堂末再插一题（不另开 SRS 结算，只即时巩固）；跟读永不计分。
5. **结算页**：正确率、获得 XP、连胜是否延续、错词列表、「再练错词」（不改 SRS）。

不做生命值扣心。中途退出：同自然日可续（每日测验、巩固加练和堂末错题均适用）；主页优先显示「继续学习」、已完成题数 / 本课总题数及进度条，点击恢复原课时、原题序和退出时的题目。首题尚未提交也保留课时；已提交但未点「继续」则恢复该题结果，不重复计分。刷新或重新打开仍从本机 IndexedDB 恢复；跨日旧卷作废，按新 due 重组。

### 6.2 三种题型

| ID | 名称 | 题干 | 选项 | 答题前音频 |
| --- | --- | --- | --- | --- |
| T1 | 英译中 | 英文单词 | 3 个中文 | 可读该英文 |
| T2 | 中译英 | 中文意思 | 3 个英文 | **禁止**读正确英文；反馈页才可读 |
| T3 | 缺字母 | 带 `_` 的英文 | 3 组字母 | 默认可听完整词 |

选项始终 3 个。对错用颜色 + 文字。

### 6.3 每日组卷（惰性，不预存题库）

打开学习页或点「今日关卡」时计算：

**选词**

先排除 `enrichStatus !== "complete"` 或释义不含中文的词，干扰项也遵守同一规则。单词继续保存在本机，未补全不进入考题。学习页 / 课时读取时，历史英文占位释义统一经 `resolveWord()` 从 `dict-core` / 内置 pack 修复；不改变词条 ID、SRS 和 XP，不引入查询词典作为组卷来源。继续旧卷时，只重建题干 / 选项不符合题型的未答题目；已答记录保留，不能重复计分。没有可用释义的未答题移出旧卷，词条保留为 `pending`。

1. 取全部 `dueAt <= today` 的词。
2. 若不足 `dailyLimit`（默认 15，范围 8～30），用新词（`repetitions === 0`）补齐。
3. 若仍不足，最多提前 2 个「明天到期且 ease 较低」的词。
4. 若到期超过 `dailyLimit`：优先 `lapses` 高、`intervalDays` 短的；其余 `dueAt` 不变，明天再优先。

**题型**（确定性）

```
hash(wordId + date) % 3
  0 → T1
  1 → T2
  2 → T3（词长 < 3 或挖空失败 → 降级 T1）
```

同一天同一词只出 **1** 题（堂末错题再练除外，再练不改 SRS）。

**干扰项**

- 优先本机词库：同 `pos`、相近长度、同年级来源。
- 不足用 `dict-core`。
- 不能等于正确答案；选项用 `wordId + date + type` 稳定洗牌。

**T3 挖空**

- 词长 3～4：挖 1 字母；≥ 5：优先挖 2 个连续字母。
- 优先元音或常见辅音组合；一般不挖首字母（词长 = 3 且别无选择除外）。
- 干扰项模拟常见拼写错误（`f/ph`、`i/e`、`ea/ee`）。

伪码（实现落在 `src/lib/quiz.ts`）：

```ts
function buildDailyQuiz(words, reviews, date, limit, dictCore): QuizItem[] {
  const selected = selectWordsForDay(reviews, words, date, limit);
  return selected.map((w) => {
    const type = pickType(w.id, date, w.display);
    const { options, answerIndex, cloze } = buildStem(type, w, words, dictCore, date);
    return { wordId: w.id, type, options, answerIndex, cloze, ... };
  });
}
```

### 6.4 SRS（简化 SM-2）

按**本地日历日**。实现：`src/lib/srs.ts`，纯函数。

| 结果 | 更新 |
| --- | --- |
| 错 | `repetitions = 0`；`intervalDays = 1`；`ease = max(1.3, ease - 0.2)`；`lapses += 1` |
| 对且 repetitions === 0 | `intervalDays = 1`；`repetitions = 1` |
| 对且 repetitions === 1 | `intervalDays = 3`；`repetitions = 2` |
| 对且 repetitions ≥ 2 | `intervalDays = max(4, round(intervalDays * ease))`；`ease = min(2.8, ease + 0.1)` |

`dueAt = today + intervalDays`。全对直觉：**1 → 3 → ~7 → ~16 天**。

新词录入当天即可进入新词配额。跟读、堂末再练、结算页「再练错词」均 **不** 调用 SRS 更新。

### 6.5 发音与跟读

**听一听**：`speechSynthesis`，`en-US` / `en-GB`，语速默认 0.9。iPad Safari：首次播放必须挂在用户手势上。

嗓音不能用系统默认：默认往往是 compact 版，读起来发闷。`src/lib/speech.ts` 的挑选顺序是 `prefs.ttsVoice`（用户在设置里选的）→ 优选名单（Samantha / Ava / Daniel / Google US English…）→ 本地嗓音 → 第一个英文嗓音，并过滤掉 Bells、Zarvox 这类玩笑嗓音。设置页列出可选英文嗓音并提示：iPad「设置 → 辅助功能 → 朗读内容 → 嗓音 → 英语」下载 Enhanced/Premium 后即可选用。

**答完题自动念一遍**：亮答案（`revealed`）之后，`LessonPage` 自动先读 `word.display`，若结果区有例句则接着读该条英文例句，不读中文翻译；没有英文例句时只读单词。用句号分隔并在同一条 utterance 中朗读，保持顺序与自然停顿。答题后的题干喇叭和结果区喇叭也按相同顺序重播。规则：

- **只在亮答案之后**。T2（中译英）答题前既不显示喇叭按钮也不朗读，硬约束不变；`item.audioBeforeAnswer` 仍然只管答题前那一次。
- **排在音效后面**。离线渲染量出来 `playCorrect` 的钟音 0.36s 收完（-30dB 在 0.29s）、`playWrong` 0.33s 收完，所以延迟 `AUTO_SPEAK_DELAY_MS = 400`（在 `LessonPage.tsx`），留 ~40ms 空隙：既不和音效抢，也没有多余的空白。
- **每题只自动念一次**。用 `autoSpokenFor` 记住已经念过的 `item.id`，重渲染和 StrictMode 的重复副作用都不会念第二次；手动点喇叭会取消尚未触发的自动朗读和正在播放的内容，从单词开始重播，不影响这个计数。
- **点「继续」和退出课时都要掐掉**。`cancelAutoSpeak()` 同时 `clearTimeout` 排队的朗读和 `stopSpeaking()`（`speechSynthesis.cancel()`），上一题的词绝不会念到下一题上。
- **手势链**：iPad Safari 只放行用户手势里起的 `speechSynthesis`。朗读隔着一个 `setTimeout`，手势上下文已经断了，所以在「检查」的点击处理里先调 `warmUpSpeech()` 空跑一条静音 utterance 把引擎解锁，之后定时器里再 `speak()` 就能出声。代价是每题会多一次 `speak("")` 调用（音量 0，听不见）。
- 开关：`UserPrefs.autoSpeak`，默认 `true`，设置页在「答题音效」下面一行。

**跟读**（两层降级）：

1. 点「我来读」时**立刻** `getUserMedia`（必须挂在用户手势上）。**这条流要一直活到录完**：不要在范读前 `track.stop()`，也不要等 TTS 后再开第二条流——iOS 没有新的用户手势时第二条流经常是静音。范读 `onend` / 超时后 `speechSynthesis.cancel()`，再空约 180ms，然后用**同一条流**开 `MediaRecorder`。
2. **iPad / Safari 跳过 `SpeechRecognition`。** 系统往往挂了 `webkitSpeechRecognition` 但转写是空的：识别先空转约 3 秒，孩子已经说完，后面的录音只接到尾巴。目标机以录音对照为准。
3. 按钮状态：`idle`（白底麦克风）→ 点击后 `speaking`（同底喇叭，等 TTS，忽略再点）→ TTS 一结束就进 `recording`（红底圆角方块＝点一下停止）→ 最长 **8 秒**录音（不含 TTS；可提前停）→ `playing`（恢复白底，喇叭带脉冲/声波动画回放）→ 播完或出错回 `idle`。孩子在红钮亮起时开口。Chrome 预览里也**不要**先跑 `SpeechRecognition`：识别会把按钮卡在喇叭态，红钮永远不出现。`MediaRecorder` **不要强行指定** `audio/mp4`（Safari 上会出现有 blob 但回放全静音）；用默认构造，`start()` 不要 timeslice。`requestData` 后再 `stop`，等到 `onstop` 才停轨道、拼 blob、回放。录音/回放文案：`已录下你的声音，和范读对比听听看`。**不要**显示「没听清」。
4. 跟读以录音对照为准，不再用识别结果当过关反馈。`没听清` 只留给 `gradeFollow` 本身。
5. 麦克风权限被拒：`没有麦克风权限`。录音失败（空 blob / 编码器不可用）：`这次没录上，再点一次试试`。
6. 无麦克风：隐藏跟读，保留听发音。

跟读不计对错、不改间隔。

### 6.6 音效怎么合成的

音效一律 `src/lib/sfx.ts` 现场合成，不打包音频文件（硬约束）。**不做掌声**：合成掌声（噪声 + 滤波 + 卷积混响那一整套）在 iPad 外放上怎么调都像静电或塑料袋，试过两版都被否掉，相关代码已整条删除。奖励感改由纯调性的音来承担——正弦分音合成出来是可信的。

- **音色**：`voice()` 是唯一的音色，钟琴 / 马林巴那一类。基频放一对分别 -4 / +5 音分的正弦（慢速拍频 = 暖），上面叠 2.01x / 3.02x / 4.97x 三个快速衰减的分音（略微不整数才有真实乐器的不谐感），起音 7ms 左右（再快会有「咔」），衰减用指数。出口一个 lowpass 收掉边角。分音音量在函数里归一化，所以 `gain` 就是这个音的峰值。
- **答对**：E5 → B5 两个钟音（间隔 80ms），0.36s 收完。`combo` 越大音高抬一点（最多 +3%）、`bright` 从 0.85 涨到 1.6、lowpass 从 3.6kHz 开到 6.2kHz，所以连对越多越亮，但音色不变。
- **里程碑**：高八度的 C6-E6-G6 三连闪音，`bright = 1.7`、lowpass 7kHz，叠在答对音后面。
- **答错**：保持原样，320Hz → 250Hz 两声正弦，柔和不刺耳，不做任何「错了」的音响暗示。
- **结算**：C5-E5-G5-C6 上行琶音（每音间隔 100ms），落在 C 大三和弦（C4-G4-C5-G5，1.5s 余韵）上收住，再加一个很轻的 G6 闪音。不用掌声也听得出「这一课结束了」。
- **电平**：没有掌声就不需要限幅器，`DynamicsCompressor` 一并删了；总线只剩 `MASTER = 2.2`。离线渲染实测峰值 correct 0.42 / combo 0.41 / wrong 0.28 / finish 0.49，零削顶样本，iPad 外放够响。
- **验证是「音」不是「噪声」**：`tmp-audio/spectrum.mjs` 量谱平坦度和谱峰占比。四段的平坦度都在 1e-6 量级（宽带噪声会接近 1），90% 以上能量落在少数几个谱峰 ±30Hz 内，6kHz 以上几乎为 0。

`scheduleCue(ac, cue, at, combo)` 是唯一的合成入口，`playCorrect / playCombo / playWrong / playFinish` 都走它。它接 `BaseAudioContext`，所以可以拿 `OfflineAudioContext` 把同一段代码离线渲染成 wav 来试听、量峰值。

---

## 7. 数据模型（本机 IndexedDB）

```ts
type WordSourceKind = "textbook" | "reading" | "pack" | "paste";

type WordRecord = {
  id: string;
  lemma: string;
  display: string;
  ipa: string | null;
  meaningZh: string;
  pos: string | null;
  examples: { en: string; zh: string }[];
  sources: {
    kind: WordSourceKind;
    packId?: string;
    grade?: string;
    volume?: string;
    unit?: string;
    note?: string;
  }[];
  enrichStatus: "complete" | "pending" | "failed";
  createdAt: string;
  updatedAt: string;
};

type ReviewState = {
  wordId: string;
  ease: number;              // 默认 2.5
  intervalDays: number;
  repetitions: number;
  dueAt: string;             // YYYY-MM-DD 本地日或 ISO 日期部分
  lastResult: "again" | "good" | null;
  lapses: number;
};

type QuizSession = {
  id: string;
  date: string;              // YYYY-MM-DD
  itemIds: string[];
  currentIndex: number;
  finishedAt: string | null;
  xpEarned: number;
};

type QuizItem = {
  id: string;
  sessionId: string;
  wordId: string;
  type: "en_to_zh" | "zh_to_en" | "cloze";
  prompt: string;
  options: string[];         // length 3
  answerIndex: 0 | 1 | 2;
  cloze?: { wordShown: string; blanks: string };
  audioBeforeAnswer: boolean;
  chosenIndex: 0 | 1 | 2 | null;
  correct: boolean | null;
  isRetry: boolean;          // 堂末再练
};

type UserPrefs = {
  dailyLimit: number;        // 默认 15
  ttsLang: "en-US" | "en-GB";
  ttsRate: number;           // 默认 0.9
  ttsVoice?: string | null;  // SpeechSynthesisVoice.name，空 = 自动挑
  soundOn?: boolean;         // 默认 true，答题音效
  autoSpeak?: boolean;       // 默认 true，亮答案后自动念一遍单词
  streakDays: number;
  lastStudyDate: string | null;
  studyDates: string[];      // 打卡日历用，YYYY-MM-DD
  xpTotal: number;           // 历史累计 XP，跨日或打卡中断都不清零
  xpToday: number;
  xpDate: string | null;
  aiBaseUrl?: string;
  aiApiKey?: string;
  aiModel?: string;
};
```

存储：Dexie (IndexedDB)。导出 / 导入 JSON；默认导出不含 AI Key。

### 7.1 PWA 安装与本机数据保护

- iPad / Android 平板的浏览器模式先显示独立安装页，不进入学习、录入或奖励页面，避免先在浏览器存数据、安装后落入另一个存储容器。iPad 提示「分享 → 添加到主屏幕」；Android 优先使用 `beforeinstallprompt` 原生安装框，不可用时提示浏览器菜单中的「安装应用 / 添加到主屏幕」。
- manifest 必须有稳定 `id`，并提供 Android Chromium 安装所需的 192 × 192 / 512 × 512 PNG 图标及 iPad `apple-touch-icon`；生产环境始终使用同一 HTTPS origin。版本更新、刷新和离线启动都不得重建或清空 IndexedDB。
- standalone 首次启动先读取安装迁移 Cookie，再初始化 React / 默认 prefs；仅当目标 IndexedDB 没有学习进度时恢复，绝不覆盖已有 XP、课时或奖励记录。Cookie 只过桥连胜、累计 / 当日 XP、最近打卡日和奖励记录，不放词库、复习状态、名字或 AI Key；完整词库与复习状态仍只在 IndexedDB。
- 安装迁移 Cookie 必须控制在常见单 Cookie 上限以内，超限时先丢弃最旧的打卡日期，始终保留 XP、连胜与奖励消费；无效或消费超过累计 XP 的数据拒绝恢复。Android 通常复用同源 IndexedDB，因此已有本机进度时迁移自然跳过。
- standalone 启动调用 `navigator.storage.persisted()` / `persist()` 请求持久存储；API 缺失、拒绝或报错时静默降级，不能阻断 IndexedDB 或离线学习。持久存储只防浏览器自动回收，用户主动删除应用 / 网站数据仍可清除本机记录。

---

## 8. 界面规格（多邻国风 × iPad）

### 8.1 全局

- 主色高对比；大圆角卡片；拇指区底部主按钮。
- 文案短：`开始` `检查` `继续` `听一听` `我来读` `导入`。
- 触摸目标 ≥ 56px；横竖屏均可（竖屏优先路径，横屏双栏可选）。
- 对错：颜色 + 文字（色觉友好）。
- 测验中不出现长表单。
- 手机窄屏随视口收缩，顶部姓名可收缩、统计可换行，不产生横向滚动；打卡日历使用紧凑日期行，整体高度比原方格布局缩短约 30%。

### 8.2 屏幕清单

| ID | 名称 | 关键元素 |
| --- | --- | --- |
| S1 | 学习 | HUD（连胜 / XP / 目标）、主卡片 +「开始学习」、打卡日历 |
| S2 | 课时题 | 进度条、题干、3 大选项、喇叭图标、底部「检查」 |
| S3 | 结果条 | 对/错文案、正解、喇叭 / 麦克风图标、「继续」 |
| S4 | 结算 | 奖杯、XP / 正确率 / 待复习三块成绩、错词列表（最多 6 条） |
| S5 | 词库 | 搜索、状态标签（新词 / 待补全 / N 天后） |
| S6 | 单词详情 | 音标、中文、例句、听/跟读、下次复习日 |
| S7 | 录入 | 顶部一行速记输入框 + 结果卡；批量词包收在折叠区里 |
| S8 | 设置 | 每日题量、口音、朗读嗓音（可选 Enhanced）、语速、AI、导出 |
| S9 | 奖励 | 紧凑标题与可用积分、按价格排列的贴纸网格、兑换详情、全屏揭晓 |

### 8.3 激励（轻量）

- **连胜**：连续有「完成至少一课」的自然日；断则归零（可先不做冻结道具）。
- **XP**：每题答对 +10，堂末再练 / 加练答对 +5；历史累计 `xpTotal` 每天学习继续累加，跨日或打卡中断都不清零。学习页顶部和奖励页统一展示可用积分，均读取 `getRewardState().available` 并订阅本机 XP 与花费记录变化；学习加分、兑换和喂养扣分实时同步。以 1 XP = 1 积分兑换贴纸，可用积分 = `xpTotal - sum(redemptions.cost)`；兑换和喂养只记录花费，不减少历史累计 XP。旧数据首次读取时从本机全部课时的 `xpEarned` 恢复累计值（至少保留旧 `xpToday`），随备份导出 / 导入。答题结果、课时 XP 与累计 XP 在同一事务内保存，同一道题重复提交不重复加分。
- **每日目标环**：`今日完成题数 / dailyLimit`。

### 8.4 情绪反馈（夸要夸到点上）

文案全部由 `src/lib/praise.ts` 的纯函数产出，可单测，**不要在组件里写死夸奖字符串**。

- `praiseCorrect()`：按优先级挑一句——堂末补回来的错题 > 连对里程碑（3/5/10）> 以前错过 N 次的词终于答对 > 题型（完形 = 夸拼写、中译英 = 夸最难的答对了）> 2.5 秒内作答 = 夸反应快 > 新词第一次就对 > 熟词答对 N 次。
- `praiseWrong()`：只鼓励，禁止任何负面评价。差一个字母就直说差一个字母；形近词就点出「这两个词长得像」；刚才连对过就先肯定连对。
- `praiseFinish()`：满分 / 错题全补回来 / 连续打卡满 7 天 / 高正确率 / 最长连对，各有专属夸法；正确率低时说「今天也坚持下来了」。
- **叫名字**：`prefs.name`（孩子在学习页 HUD 里自己填，可不填）以 `name?` 传进三个 context，由 `praise.ts` 内部的 `withName()` 拼成「小明，全对！一个都没错」——全角逗号，只加在 `title` 前面，`note` 不动。名字必须是入参，`praise.ts` 里不许读库。
  - 点名的场合（挑「一课里最多几次」的高光时刻，一句一句念下来不别扭）：`praiseFinish()` 全部（结算只出现一次，最值得点名）、`praiseWrong()` 全部（安慰要说给人听，而且答错本来就不多）、`praiseCorrect()` 只有里程碑那几句——堂末补回来、连对 5、连对 10 的倍数、以前错过 ≥2 次的词终于拿下。
  - 不点名的场合：`praiseCorrect()` 里普通的「答对了！」「连对 3 题」「拼写全对！」「反应真快！」等。一课 15 题句句点名会很快变得烦人。
  - 规则是确定性的（不掺随机），所以可单测；名字里自带的首尾空格和结尾标点会被去掉，免得出现「小明！，全对」。
  - **名字为空或没填时，每一句必须和没有名字时逐字一致**（`src/lib/praise.test.ts` 里对全部分支做了逐句比对）。
- 音效在 `src/lib/sfx.ts` 用 Web Audio 现场合成，**不打包音频文件**，离线照样响，而且只用调性音、不做掌声：答对 = 两个上行的暖钟音（连对越多越亮），连对 5 的倍数追加高八度的三连闪音，答错 = 柔和下行两声（绝不刺耳），结算 = 上行琶音落在大三和弦上。合成细节见 6.6。`prefs.soundOn` 可关。
- 动效：结果条从底部弹起、正确项 pop、错误项抖动、连对火苗徽章、`+10 XP` 弹出、结算撒花（`Confetti`，`prefers-reduced-motion` 下自动关掉）。

---

### 8.5 奖励兑换与贴纸收藏册

- 底部「奖励」页签进入 `/rewards`。顶部只放「贴纸兑换」和宝石图标＋当前可用总积分，取消累计 XP 副统计、收藏进度、分类编号与所有装饰说明。所有贴纸在一个网格内按 200／300／500 分升序排列，同档保持目录顺序；三档用蓝／紫／金浅色图片区分，不额外标注品质文字。使用与其它页面一致的多邻国式白底、粗圆角边框、立体按钮、蓝色积分和绿色操作按钮。现有累计 XP 全部可用，兑换不会影响 SRS、连胜或每日目标。
- 未兑换使用原图透明轮廓的纯色剪影（`brightness(0)`），不泄露内部颜色；卡片只有图片、「???」与宝石图标＋价格，不显示还差多少分或额外提示。兑换前的详情标题、图片替代文字、读屏名称均不暴露真实名字。点卡片打开精简详情，图片加载和解码成功后点击价格＋「兑换」才提交；余额不足只禁用兑换并显示「积分不足」。已兑换显示彩色贴纸、真实名字和唯一的操作入口：满格显示「点击查看」，有饥饿显示「喂它」，点击打开详情查看和喂养；仍有饱食度时不能重复兑换。
- 详情弹窗的贴纸图片为 400 × 400 CSS 像素，窄屏时按可用宽度等比例缩小；460px 宽白色弹窗容纳图片，不裁切，不给图片添加蓝色或其它色块底。图片下方为名称、简短说明和绿色操作按钮；已兑换显示「我的珍藏」及由 `praiseRewardCollection()` 产生的鼓励说明，未兑换保留「???」与揭晓提示。列表仍保持简洁，不增加说明文字。
- 首批 12 张原创透明底、白色模切边插画由 imagegen 生成，保存在 `public/rewards/*.png`：200 分＝饼干小猫、抱萝卜兔、云朵精灵、小火箭；300 分＝围巾柴犬、彩虹独角兽、蘑菇小龙、星球伙伴；500 分＝竹叶熊猫、月亮飞龙、宇航小熊、星际鲸鱼。定义在 `src/data/rewards.ts`，稳定 ID 不随名称变更。
- `RewardDefinition = { id, name, theme: "pets" | "fantasy" | "space", cost, image, hungerDays }`；Dexie v2 新增 `redemptions` 表，主键 `rewardId`，记录 `{ rewardId: string, cost: number, redeemedAt: string, care?: { fullness: number, settledOn: string } }`。`cost` 保存这个伙伴历次兑换、重新解锁及喂养的累计实际花费，始终计入可用积分扣减；旧花费不因目录调价改变，变回剪影也不返还积分。`redeemedAt` 是最近一次解锁时间。新增字段无需更改 v2 索引，旧记录首次读取时从当天满格开始，不追溯饥饿、不补扣差价。
- `getRewardState()` 返回累计 XP、可用积分和记录；`redeemReward(rewardId)` 在覆盖 prefs、sessions、redemptions 的同一写事务中迁移旧 XP、核对余额与归属、写入记录。返回 redeemed／owned／insufficient，存储失败整笔回滚；同卡连点、不同卡并发或跨页面请求不能重复扣分、不能透支。
- 饱食度共五格（100%），200／300／500 分伙伴分别每 2／3／5 个本地日历日消耗一格。按最后结算日计算整周期，保留未满周期的余数；喂养不重置周期。每次喂养扣 30 积分、恢复一格，满格禁喂。五格耗尽后回到原始剪影与「???」，只能按目录当前全价重新解锁，重新解锁恢复满格并开始新的周期。退出应用、离线和跨日均继续计时，页面每分钟和回到前台时刷新；耗尽状态持久化，回拨时钟不自动复活。
- 列表的食碗图标＋五格刻度缩小并移到操作按钮文字前，不遮挡图片；详情弹框在图片右下角显示较大的状态图标，食碗为 32px，五格刻度每格 7px，方便看清。绿色满格、金色轻饿、橙色较饿、灰色空格，配合格数和读屏名称，不只靠颜色。图片每掉一格减少 20% 色彩并逐步变暗，空格恢复原始剪影。首次未兑换不显示饥饿图标，耗尽后保留空格图标（列表在价格前，详情在图片角落）。详情保留 400 × 400 透明底图片，显示饱食度、消耗周期和「喂一喂＋30 分」，满格显示禁用的「吃饱啦」；耗尽显示「重新解锁＋价格」。
- `feedReward()` 在 prefs、sessions、redemptions 的同一写事务中先结算饥饿再核对归属、满格及余额，原子写入恢复的一格和实际花费；余额不足或存储失败不扣分。同伴并发喂养不能超过五格，不同伙伴并发不能透支。
- 成功提交后播放全屏揭晓：0–0.6 秒星光聚拢，0.6–1.4 秒剪影亮色、贴纸弹出，1.4–3 秒金色光环与彩带。只保留一条庆祝标题、贴纸名字与「收下」按钮，不显示装饰副标题和说明。约 3 秒后保持大图；可跳过或关闭，刷新也不会撤销收藏。减少动态效果模式直接显示静态获奖画面；原生 dialog 约束焦点、支持 Escape、关闭后返回原卡片。
- 兑换点击时解锁 Web Audio，提交成功才播放 `sfx.ts` 的 reward 调性提示音（上行钟琴琶音与和弦），遵循 `soundOn`，关闭或跳过停止提示音。`praiseReward()` 为纯函数，按集齐全部 > 集齐主题 > 首次收藏 > 普通收藏产生鼓励文案；本期奖励文案不点名。
- 备份以一致事务快照导出 XP 与兑换记录；导入学习备份时一起恢复累计花费与饱食度（保留结算日期，不重置离线时间），旧备份缺少兑换字段按空收藏恢复，纯词库导入不改变 XP 与收藏。奖励记录必须随 prefs 一起导入；重复 ID、非法花费、非法饱食格数或日期、总花费超过恢复 XP 时拒绝并回滚。未来未知奖励 ID 保留其历史花费。
- PWA 预缓存包含 PNG／WebP，单文件小于 4 MiB；安装缓存完成后，打开、兑换、欣赏和刷新收藏均不依赖网络。

## 9. 技术选型

| 层 | 选择 |
| --- | --- |
| 应用 | Vite + React + TypeScript |
| 路由 | 学习 / 词库 / 录入 / 奖励 / 课时全屏 |
| 本地库 | Dexie |
| TTS | `speechSynthesis` |
| 跟读 | Safari 直接录音回放；其它浏览器可先识别 |
| AI | OpenAI 兼容 Chat Completions（设置里配；脚本与 App 共用协议） |
| 纯函数 | `src/lib/srs.ts`、`src/lib/quiz.ts`、`src/lib/resolve-word.ts`、`src/lib/praise.ts` + Vitest |
| 音效 | `src/lib/sfx.ts`，Web Audio 合成，无音频资源 |
| PWA | Vite PWA 插件；缓存 shell + packs + dict-core + dict-lookup；离线可考 |

### 9.1 目录建议

```
src/
  app/                 # 路由与页面
  components/          # 路径节点、选项、结果条、音频按钮
  db/                  # Dexie schema + repos
  lib/
    srs.ts
    quiz.ts
    resolve-word.ts
    parse-import.ts
    speech.ts
    ai-enrich.ts
  data/
    packs/*.json
    dict-core.json
    dict-lookup.json   # 查询词典，不当背单词
    fallback-words.ts  # 极小兜底，可与 dict-core 合并
scripts/
  gen-pack.ts
  build-dict-lookup.ts
  validate-data.ts
  prompts/enrich-words.ts
docs/DESIGN.md
```

### 9.2 iPad / Safari 注意

- 音频与麦克风权限需用户手势触发。
- `standalone` 显示模式；安全区 padding。
- 大屏：路径与课时可用较宽 max-width 居中，避免题干过宽。

---

## 10. AI 补全（运行时）

仅当 `resolveWord` 未命中离线数据时调用。

请求：`{ words: string[]; audience: "elementary_zh"; gradeHint?: string }`

返回每词：`lemma, ipa, pos, meaningZh, examples[]`（与 pack 字段同语义）。

失败：该词 `pending`/`failed`，其它成功词照常保存。无 Key：速记不可标为 complete，除非 dict-core / pack / dict-lookup 已命中。

---

## 11. 验收标准

1. 选择内置词包导入后，词库按 Unit 可见，刷新不丢失；再次导入同 pack 不产生重复 lemma。
2. `validate-data` 能抓出重复 lemma、空 zh、空 examples。
3. 速记只输入生僻词（dict-core 与 dict-lookup 皆无）：有 Key 时 AI 补全可保存；无网/失败时 pending 可重试。
4. 速记命中 dict-core 或 dict-lookup 时完全离线完成；查询词典不批量进词库。
5. 昨天新词答对 → 今天仍 due；再答对 → 约 3 天后才 due。
6. 同一天同一词主卷只一题；三种题型在多词试卷中可出现。
7. T2 答题前不能听到正确英文；T1/T3 可以。
8. 跟读无权限不崩溃；有权限时反馈不影响 SRS。
9. 断网仍能打开已缓存的 PWA 并完成测验（不依赖 AI）。
10. 导出 JSON 再导入，词与复习状态、连胜恢复（不含 Key 除非勾选）。
11. 奖励页有 12 张三个主题的贴纸，未兑换为纯剪影，已兑换为彩色；已有 XP 可立即兑换，余额刚好可用，不足时不能兑换；并发或连点只扣一次，累计 XP 不下降。
12. 兑换成功后全屏揭晓并开始满格饱食度；存储失败无扣分、无成功庆祝。静音、减少动态效果、跳过、关闭、刷新、iPad 横竖屏与手机窄屏均可正常操作。
13. 喂养一次花 30 积分恢复一格，满格不可喂，五格耗尽恢复剪影并可全价重新解锁；列表按钮与详情图片均显示饥饿图标，离线和跨日饥饿结算正确。
14. 新备份恢复积分及收藏，旧学习备份恢复空收藏，纯词库导入保留收藏。断网兑换后重启仍保留贴纸与余额。
15. iPad / Android 平板浏览器模式不能直接开始学习；iPad 显示添加到主屏幕步骤，Android 可调起原生安装框并有菜单降级。主屏幕版首次启动自动恢复合法的连胜、XP 与奖励过桥数据，不覆盖已有本机进度；持久存储 API 缺失或拒绝时仍可离线学习。

## 12. 实现顺序

1. Dexie 模型 + 词库列表 + 单词详情（TTS）
2. 读入 packs / dict-core + 词包导入页
3. `resolve-word` + 速记 + 粘贴补充
4. `srs.ts` / `quiz.ts` 纯函数 + Vitest
5. 学习路径 + 课时 UI（三题型，无跟读）
6. 结果条、堂末错题、结算、XP / 连胜
7. 跟读双降级
8. `gen-pack` / `validate-data` 脚本
9. PWA 与 iPad 触控打磨

## 13. 开放默认（实现时不必再问）

| 问题 | 默认 |
| --- | --- |
| 教材版本 | pack 元数据字段预留；首包等用户提供后再生成 |
| 一词多义 | 只保留一条主义 |
| 大小写 | lemma 小写；题面用 display |
| 中文 | 简体 |
| 新词首次出现 | 录入当天可进新词配额 |
| 离线 | 测验与已导入词完全离线；仅未命中 dict-core/pack/dict-lookup 的速记才需要网（或 AI） |

## 14. 给实现 AI 的硬约束摘要

见仓库根目录 [AGENTS.md](../AGENTS.md)。
