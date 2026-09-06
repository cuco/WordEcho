# dict-lookup 数据来源

查询词典 `src/data/dict-lookup.json` 由 `scripts/build-dict-lookup.ts` 从
[ECDICT](https://github.com/skywind3000/ECDICT)（skywind3000）的 `ecdict.csv`
筛常用子集生成。

- 上游许可：见 ECDICT 仓库说明（开源英汉数据，便于本地嵌入）。
- 本仓库只提交筛后的 JSON；CSV 源文件不进版本库（默认下载到 `scripts/.cache/`）。
- 用途仅限释义查询，不作为背单词词库全量导入。
