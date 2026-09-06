# WordEcho — 给实现用的说明

实现前先读 [docs/DESIGN.md](docs/DESIGN.md)。那是产品、数据模型、词包格式、SRS、题型和验收的唯一标准。

## 硬约束

- 词库与复习状态只存本机（IndexedDB）；v1 不要做账号或云同步。
- 目标形态是 iPad 上的 PWA（Vite + React + TypeScript）；测验必须可离线。
- 课文一次性录入以工程内 `src/data/packs/*.json` 为主；用 `scripts/gen-pack.ts` 预生成，不要默认要求孩子在 iPad 上手填中文。
- 释义解析统一走 `resolveWord()`：本地词库 / `dict-core` / pack / `dict-lookup` 优先，未命中才调 AI。
- `dict-lookup` 只用于查询补释义，绝不批量导入词库或 SRS；组卷选词与干扰项只用本机词库 + 小的 `dict-core`。
- 单词速记禁止把中文意思做成必填；未补全则 `pending`，单词不丢。
- 背单词是主功能；每日一词一题（堂末错题再练除外）；题型由 `hash(wordId + date) % 3` 决定。
- SRS 用文档里的 SM-2 简化规则，不要换成其它算法除非用户明确要求。
- T2（中译英）答题前禁止播放正确英文发音。
- 跟读不影响对错和间隔；无 SpeechRecognition 时降级为录音对照。
- 不做生命值扣心；激励只用连胜 + XP + 每日目标环。
- 夸奖文案一律走 `src/lib/praise.ts` 的纯函数（见 DESIGN.md 8.4），不要在组件里写死；答错只鼓励，不许出现负面评价。
- 孩子的名字只能作为 `name?` 入参传进夸奖函数（`praise.ts` 里不许读库）；名字为空时每一句文案必须和没有名字时逐字一致，且只在 DESIGN.md 8.4 列出的高光时刻点名，不要句句叫名字。
- 音效用 `src/lib/sfx.ts` 现场合成，不要往工程里塞音频文件；只用调性音（钟琴式音符 / 琶音），不要合成掌声或其它噪声类音效——试过两版都像静电，用户已明确否掉。
- 学习页只放一个「开始学习」按钮 + 打卡日历，不要 unit 关卡列表；录入页打开就能直接敲一个单词，批量导入收进折叠区。
- 「听一听」「我来读」一律用图标按钮；TTS 必须显式挑嗓音（见 DESIGN.md 6.5），不要直接用系统默认。

## 建议开工顺序

见 DESIGN.md 第 12 节。先把 `src/lib/srs.ts`、`src/lib/quiz.ts`、`src/lib/resolve-word.ts` 写成可单测纯函数。
