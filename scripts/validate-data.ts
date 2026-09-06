import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lemmaOf, type DictCore, type DictLookup, type WordPack } from "../src/lib/types.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;

function fail(msg: string) {
  console.error(msg);
  failed += 1;
}

function checkWord(
  label: string,
  w: { lemma?: string; word?: string; display?: string; ipa: string; zh?: string; meaningZh?: string; examples: { en: string; zh: string }[] },
  seen: Set<string>,
) {
  const lemma = lemmaOf(w.lemma ?? w.word ?? w.display ?? "");
  const zh = w.zh ?? w.meaningZh ?? "";
  if (!lemma) fail(`${label}: empty lemma`);
  if (seen.has(lemma)) fail(`${label}: duplicate ${lemma}`);
  seen.add(lemma);
  if (!w.ipa) fail(`${label} ${lemma}: empty ipa`);
  if (!zh) fail(`${label} ${lemma}: empty zh`);
  if (zh.length > 16) fail(`${label} ${lemma}: zh too long`);
  if (!w.examples?.length) fail(`${label} ${lemma}: no examples`);
}

const dict = JSON.parse(await readFile(join(root, "src/data/dict-core.json"), "utf8")) as DictCore;
const dictSeen = new Set<string>();
for (const w of dict.words) checkWord("dict-core", w, dictSeen);

const lookup = JSON.parse(
  await readFile(join(root, "src/data/dict-lookup.json"), "utf8"),
) as DictLookup;
if (lookup.version !== 1) fail("dict-lookup: bad version");
if (!lookup.w || typeof lookup.w !== "object") fail("dict-lookup: missing w");
const lookupCount = Object.keys(lookup.w).length;
if (lookupCount < 10_000) fail(`dict-lookup: too few lemmas (${lookupCount})`);
for (const [lemma, row] of Object.entries(lookup.w)) {
  if (!lemma) fail("dict-lookup: empty lemma key");
  if (!Array.isArray(row) || row.length !== 3) {
    fail(`dict-lookup ${lemma}: bad tuple`);
    continue;
  }
  const [, , zh] = row;
  if (!zh) fail(`dict-lookup ${lemma}: empty zh`);
  // lookup may keep multiple senses; soft cap matches build-dict-lookup MAX_LOOKUP_ZH
  if ([...zh].length > 120) fail(`dict-lookup ${lemma}: zh too long (${zh})`);
}
for (const [form, base] of Object.entries(lookup.f ?? {})) {
  if (!form || !base) fail(`dict-lookup form: empty ${form}->${base}`);
  if (lookup.w[form]) fail(`dict-lookup form ${form}: overlaps lemma key`);
  if (!lookup.w[base]) fail(`dict-lookup form ${form}: missing base ${base}`);
}

const packDir = join(root, "src/data/packs");
for (const name of await readdir(packDir)) {
  if (!name.endsWith(".json")) continue;
  const pack = JSON.parse(await readFile(join(packDir, name), "utf8")) as WordPack;
  if (!pack.id) fail(`${name}: no id`);
  const seen = new Set<string>();
  for (const w of pack.words) checkWord(name, w, seen);
}

if (failed) {
  console.error(`${failed} error(s)`);
  process.exit(1);
}
console.log(`data ok (dict-core ${dict.words.length}, dict-lookup ${lookupCount})`);
