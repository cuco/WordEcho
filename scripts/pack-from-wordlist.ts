import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { kidGloss } from "../src/lib/kid-gloss.ts";
import { makeExample } from "../src/lib/make-example.ts";
import type { DictCore, PackWord, WordPack } from "../src/lib/types.ts";
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
const volume = arg("volume", "全册");

if (!listPath || !id) {
  console.error(
    "用法: npx tsx scripts/pack-from-wordlist.ts --list src/data/wordlists/go-phonics-l2.txt --id go-phonics-l2 --title 'Go! Phonics 2' --grade 'Level 2' --curriculum go-phonics",
  );
  process.exit(1);
}

const dict = JSON.parse(await readFile(join(root, "src/data/dict-core.json"), "utf8")) as DictCore;
const byLemma = new Map(dict.words.map((w) => [w.lemma, w]));

const lines = (await readFile(listPath, "utf8"))
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));

const seen = new Set<string>();
const words: PackWord[] = [];
for (const line of lines) {
  const [
    word,
    unit = "Unit 1",
    suppliedZh = "",
    suppliedPos = "",
    suppliedExampleEn = "",
    suppliedExampleZh = "",
  ] = line.split(/\t/).map((s) => s.trim());
  const lemma = lemmaOf(word);
  if (!lemma || seen.has(lemma)) continue;
  seen.add(lemma);
  const hit = byLemma.get(lemma);
  // Hand-entered booklet text is canonical. Only shorten dictionary fallback
  // glosses; otherwise phrases such as “在……里面” lose important context.
  const zh = suppliedZh || kidGloss(hit?.zh || word, word);
  const pos = suppliedPos || hit?.pos || "n";
  if (Boolean(suppliedExampleEn) !== Boolean(suppliedExampleZh)) {
    throw new Error(`例句中英文必须同时填写：${word}`);
  }
  const examples = suppliedExampleEn
    ? [{ en: suppliedExampleEn, zh: suppliedExampleZh }]
    : hit?.examples?.length
      ? hit.examples
      : [makeExample(word, pos, zh)];
  words.push({
    word: hit?.display ?? word,
    lemma,
    ipa: hit?.ipa || "/–/",
    pos,
    zh,
    examples,
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
