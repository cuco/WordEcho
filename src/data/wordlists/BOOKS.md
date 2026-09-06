# WordEcho 教材词包（当前确认的四套 + 高频词陪伴）

| 系列 | 出版 | 状态 | 词表 / 词包 |
| --- | --- | --- | --- |
| **Oxford Phonics World** | OUP | **已复核并入库** L1–L5（104 / 93 / 96 / 96 / 96 词） | `opw-l*.txt` → `packs/opw-l*.json` |
| **Go! Phonics**（启思《玩转自然拼读》） | 启思 / RASS | L1 已校正单元号，现有 **81 词**；L2–L5 仍无公开表 | `go-phonics-l1` pack；L2–L5 模板 |
| **New Magic / 启思英语** | 上海教育出版社 + OUP | 1B **98 词**、2B **142 词**已按学生书整理；1A/2A 残缺；3A–6B 待提取 | `new-magic-*` |
| **新魔法英语分级读物** | 上海教育出版社（PM） | **无公开逐册词表**（不编造） | `graded-readers-*.txt` 模板 |
| **Go! Sight Words 220** | 与分级读物配套的 Dolch | **已入库**（公开 Dolch 220，不是读物逐本词） | `go-sight-words-220` |

> 已移除此前误标的「Oxford Shanghai English」词包：那是 **沪教牛津**，不是 New Magic。

残缺词包标题带 **partial**。学生书提取包会标成“学生书核验”；只有逐项对照 Self-Learning Booklet 后才标记为手册完整版。

## 这次搜过、仍然没有完整表的地方

- RASS：只有 [GPP1 Answer Key](https://www.rasslanguage.com/f/rasslanguage/files/rasslanguage/download/gpp1answer.pdf) 能在搜索引擎缓存里看到词；`gpp2answer.pdf` 等 403/404。
- 新启翔：介绍页写「156 音组、2000+ 词」，公开页只展示 L1 目录和少量内页，不提供 L2–L5 词表下载。
- ICSpeak / GitHub / gist：有 OPW、沪教牛津，**没有** New Magic / Go! Phonics。
- 51jiaoxi、绘本宝：主要是 **单元目录** 和付费 PPT；公开预览里只有少量「新词汇」名单。
- 单词鸭等落地页：广告「已收录词库」，页面上 **零个单词**。
- Scribd 上可读/可下载的 New Magic 学生书可用于核验每单元目标词；不把学生书整本复制进仓库。

词表支持两种格式：原有的 `word<TAB>Unit N`，以及手册精确录入格式
`word<TAB>Unit N<TAB>中文<TAB>词性<TAB>英文例句<TAB>中文例句`。后四列可省略；例句两列必须同时提供。

## 从课本补全后生成词包

```bash
npx tsx scripts/pack-from-wordlist.ts \
  --list src/data/wordlists/new-magic-1a.txt \
  --id new-magic-1a --title 'New Magic 1A (partial)' \
  --grade '1A' --volume 'Book A' --curriculum new-magic
```

生成后在 `src/data/packs.ts` 注册，再 `npm run check`。

## New Magic 单元标题（绘本宝 / 51jiaoxi TOC）

| 册 | 单元 |
| --- | --- |
| 1A | Nice to meet you · My new friends · Happy birthday · Colours around us · In the classroom · An animal story |
| 1B | I can sing · Fruit day · My schoolbag · Where is the hamster · The countryside · The Alien family |
| 2A | A day out · Let's go! · Our school · Our new flat · School picnic · The Honest Woodcutter |
| 2B | The four seasons · Our week · Yummy food! · An interview with Mr Gordon · Nice people around us · Pets can be good friends |
| 3A | I like English · Let's go shopping · Let's go to the park · My calendar · Cooking at home · Dress Casual Day |
| 3B | At the fun park · Beach fun · Nice people at school · How can you help? · The Emperor and the Nightingale · A bad day |
| 4A | Our new neighbours · One you admire · Visit Hong Kong · A day at a children's palace · Let's have fun! · Christmas party |
| 4B | New Year fun · School play · Chinese food · Food fair · Health tips · Welcome to Rainbow City |
| 5A | What do you do? · E-age · What's in our food? · We can cook · A fun place to go · That's our Earth |
| 5B | Games-past and present · Time flies · Different weather conditions · Wonderful nature · Summer fun! · Different festivals |
| 6A / 6B | Scribd 已找到可读学生书，待按页提取 |

## Go! Phonics

官方为 5×16 单元。L1 的 81 个词来自答案键公开缓存；旧文件误把答案页码当单元号，现已按官方 L1 contents 的字母/发音顺序校正为 Unit 1–15。Unit 16 是总复习；L1 仍是残缺词表。

## 分级读物

经典版约预备级 + L1–L12、每级多本 PM 绘本。词汇在阅读中复现，没有整级下载。先导入 **Go! Sight Words 220**；有手册后再填 `graded-readers-l*.txt`。
