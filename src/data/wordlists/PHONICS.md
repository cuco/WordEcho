# Phonics 词包说明

拼读两套见本目录；教材总览见 [BOOKS.md](./BOOKS.md)。

## Oxford Phonics World（已入库）

- `opw-l1` … `opw-l5`：按单元整理，可在 App「录入 → 课文词包」导入。
- 来源为社区按册整理（ICSpeak），请对照自家课本核对。

## Go! Phonics / 启思《玩转自然拼读》

- `go-phonics-l1`：**残缺**答案键词，已入库，标题带 partial。
- L2–L5：搜过 RASS / 新启翔 / GitHub / ICSpeak，仍无公开完整表。对照课本补全后：

```bash
npx tsx scripts/pack-from-wordlist.ts --list src/data/wordlists/go-phonics-l2.txt \
  --id go-phonics-l2 --title 'Go! Phonics 2' --grade 'Level 2' --curriculum go-phonics
```
