import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DictCore, Example, PackWord, WordPack } from "../src/lib/types.ts";
import { lemmaOf } from "../src/lib/types.ts";

type Fallback = {
  display: string;
  ipa: string;
  pos: string;
  zh: string;
  examples: Example[];
};

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
    "用法: npx tsx scripts/pack-from-dict.ts --list src/data/wordlists/new-magic-1a.txt --id new-magic-1a --title 'New Magic 1A' --curriculum new-magic --grade 1A --volume 'Book A'",
  );
  process.exit(1);
}

const dict = JSON.parse(
  await readFile(join(root, "src/data/dict-core.json"), "utf8"),
) as DictCore;
const byLemma = new Map(dict.words.map((w) => [w.lemma, w]));
const fallbackPath = arg("fallbacks", join(root, "src/data/wordlists/fallbacks.json"));
const fallbacks = JSON.parse(await readFile(fallbackPath, "utf8")) as Record<string, Fallback>;

const lines = (await readFile(listPath, "utf8"))
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));

const seen = new Set<string>();
const words: PackWord[] = [];
const missing: string[] = [];

for (const line of lines) {
  const [word, unit = "Unit 1"] = line.split(/\t/).map((s) => s.trim());
  const lemma = lemmaOf(word);
  if (seen.has(lemma)) continue;
  seen.add(lemma);
  const src = byLemma.get(lemma) ?? fallbacks[lemma];
  if (!src) {
    missing.push(`${word}\t${unit}`);
    continue;
  }
  words.push({
    word: src.display,
    lemma,
    ipa: src.ipa,
    pos: src.pos,
    zh: src.zh,
    examples: src.examples,
    unit,
  });
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
if (missing.length) {
  console.warn("dict-core 未命中（需 gen-pack 或对照课本后补）:");
  for (const m of missing) console.warn(" ", m);
}
