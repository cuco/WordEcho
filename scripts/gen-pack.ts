import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { enrichWordsWithAi } from "../src/lib/ai-enrich.ts";
import type { WordPack } from "../src/lib/types.ts";
import { lemmaOf } from "../src/lib/types.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function arg(name: string, fallback?: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const listPath = arg("list");
const id = arg("id");
const title = arg("title", "未命名词包");
const curriculum = arg("curriculum", "other");
const grade = arg("grade", "");
const volume = arg("volume", "");

if (!listPath || !id) {
  console.error(
    "用法: npm run gen-pack -- --list words.txt --id opw-l1 --title 'Oxford Phonics World 1' --curriculum other --grade 'Level 1' --volume 全册",
  );
  process.exit(1);
}

const baseUrl = process.env.AI_BASE_URL;
const apiKey = process.env.AI_API_KEY;
const model = process.env.AI_MODEL ?? "gpt-4o-mini";
if (!baseUrl || !apiKey) {
  console.error("需要环境变量 AI_BASE_URL 和 AI_API_KEY");
  process.exit(1);
}

const lines = (await readFile(listPath, "utf8"))
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean);

const units = new Map<string, string[]>();
for (const line of lines) {
  const [word, unit = "Unit 1"] = line.split(/\t|,/).map((s) => s.trim());
  const arr = units.get(unit) ?? [];
  arr.push(word);
  units.set(unit, arr);
}

const words: WordPack["words"] = [];
for (const [unit, ws] of units) {
  const enriched = await enrichWordsWithAi(ws, { baseUrl, apiKey, model });
  for (const w of ws) {
    const row = enriched.find((e) => lemmaOf(e.lemma) === lemmaOf(w));
    if (!row) {
      console.warn("未返回", w);
      continue;
    }
    words.push({
      word: w,
      lemma: lemmaOf(w),
      ipa: row.ipa,
      pos: row.pos,
      zh: row.meaningZh,
      examples: row.examples,
      unit,
    });
  }
}


const pack: WordPack = {
  id,
  title,
  curriculum,
  grade,
  volume,
  language: "en",
  version: 1,
  words,
};

const out = join(root, "src/data/packs", `${id}.json`);
await writeFile(out, JSON.stringify(pack, null, 2) + "\n");
console.log("wrote", out, words.length, "words");
