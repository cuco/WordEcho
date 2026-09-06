# WordEcho

面向小学生的本地记单词 PWA（Web + TypeScript），主要在 iPad 上用 Safari「添加到主屏幕」。

## 三大功能

1. **背单词考题**（主功能）— 按 SM-2 每天出三类选择题，交互参考多邻国
2. **词包一次性导入** — 工程内 `src/data/packs/*.json`，也可选文件导入
3. **单词速记** — 只输入英文；释义优先本机词库 / `dict-core` / 查询词典 `dict-lookup`，未命中再 AI（查询词典不当背单词）

## iPad 安装（GitHub Pages）

线上地址：https://cuco.github.io/WordEcho/

1. iPad 用 **Safari** 打开上面的链接（不要用微信内置浏览器）
2. 等页面加载完（首次会缓存词包和词典）
3. 点分享 → **添加到主屏幕**
4. 之后从主屏幕图标打开即可；电脑关机、断网也能背单词（查不到的生词调 AI 才需要网）

推送到 `main` 后会自动重新部署；iPad 再打开一次即可拿到更新。

## 开发

```bash
npm install
npm test
npm run check
npm run dev
```

重建离线查询词典（可选，需下载 ECDICT CSV）：

```bash
npm run build-dict-lookup
```

生成课文词包（需 `AI_BASE_URL` / `AI_API_KEY`）：

```bash
npm run gen-pack -- --list words.txt --id opw-l1 --title 'Oxford Phonics World 1' --curriculum other --grade 'Level 1' --volume 全册
```

规格：[docs/DESIGN.md](docs/DESIGN.md) · 约束：[AGENTS.md](AGENTS.md) · 教材词包：[src/data/wordlists/BOOKS.md](src/data/wordlists/BOOKS.md)
