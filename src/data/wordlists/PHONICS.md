# Phonics 词包说明

## Oxford Phonics World（已入库）

- `opw-l1` … `opw-l5`：按单元整理，可在 App「录入 → 课文词包」导入。
- 来源为社区按册整理（ICSpeak），请对照自家课本核对。

## Go! Phonics / 启思《玩转自然拼读》（缺公开完整表）

官方不提供可下载完整词库。请用 `go-phonics-l1.txt` … `l5.txt` 按课本填写后：

```bash
npx tsx scripts/pack-from-wordlist.ts --list src/data/wordlists/go-phonics-l2.txt \
  --id go-phonics-l2 --title 'Go! Phonics 2' --grade 'Level 2' --curriculum go-phonics
```

再在 `src/data/packs.ts` 注册即可。
