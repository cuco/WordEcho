import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { kidGloss } from "../src/lib/kid-gloss.ts";
import { makeExample } from "../src/lib/make-example.ts";
import type { DictCore, PackWord, WordPack } from "../src/lib/types.ts";
import { lemmaOf } from "../src/lib/types.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const BOOKS = [
  { id: "oxford-sh-g1-vol1", grade: "一年级", volume: "上册", slug: "bk_2a255b" },
  { id: "oxford-sh-g1-vol2", grade: "一年级", volume: "下册", slug: "bk_a825fd" },
  { id: "oxford-sh-g2-vol1", grade: "二年级", volume: "上册", slug: "bk_29658c" },
  { id: "oxford-sh-g2-vol2", grade: "二年级", volume: "下册", slug: "bk_a80673" },
  { id: "oxford-sh-g3-vol1", grade: "三年级", volume: "上册", slug: "bk_5febb1" },
  { id: "oxford-sh-g3-vol2", grade: "三年级", volume: "下册", slug: "bk_b6ad30" },
  { id: "oxford-sh-g4-vol1", grade: "四年级", volume: "上册", slug: "bk_900d77" },
  { id: "oxford-sh-g4-vol2", grade: "四年级", volume: "下册", slug: "bk_de6dd3" },
  { id: "oxford-sh-g5-vol1", grade: "五年级", volume: "上册", slug: "bk_9cab2f" },
  { id: "oxford-sh-g5-vol2", grade: "五年级", volume: "下册", slug: "bk_7d0e67" },
  { id: "oxford-sh-g6-vol1", grade: "六年级", volume: "上册", slug: "bk_2090f7" },
  { id: "oxford-sh-g6-vol2", grade: "六年级", volume: "下册", slug: "bk_fad97c" },
] as const;

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

function clipZh(brief: string): string {
  let t = decodeEntities(brief).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  t = t.replace(/^(na\.|num\.|pron\.|prep\.|conj\.|det\.|int\.|aux\.|adv\.|adj\.|phr\.|vt\.|vi\.|v\.|n\.)\s*/i, "");
  t = t.split(/[；;。\n]/)[0]?.trim() ?? "";
  t = t.replace(/^[,，、.\s]+/, "").replace(/[（(].*$/, "").trim();
  const chars = [...t];
  if (chars.length > 16) t = chars.slice(0, 16).join("");
  return t;
}

function posOf(brief: string): string {
  const t = decodeEntities(brief).trim().toLowerCase();
  if (t.startsWith("na.")) return "n";
  if (/^(num\.)/.test(t)) return "num";
  if (/^(pron\.)/.test(t)) return "pron";
  if (/^(prep\.)/.test(t)) return "prep";
  if (/^(conj\.)/.test(t)) return "conj";
  if (/^(int\.)/.test(t)) return "int";
  if (/^(adv\.)/.test(t)) return "adv";
  if (/^(adj\.)/.test(t)) return "adj";
  if (/^(det\.)/.test(t)) return "det";
  if (/^(phr\.)/.test(t)) return "phr";
  if (/^(vt\.|vi\.|v\.|aux\.)/.test(t)) return "v";
  if (/^(n\.)/.test(t)) return "n";
  return "n";
}

type Row = { word: string; unit: string; ipa: string; pos: string; zh: string };

function parseBook(html: string): Row[] {
  const rows: Row[] = [];
  const unitBlocks = html.split(/<h4 class="ci-list-h4">/);
  for (const block of unitBlocks.slice(1)) {
    const unitMatch = block.match(/^([^<]+)<\/h4>/);
    const unitRaw = decodeEntities(unitMatch?.[1] ?? "Unit 1").replace(/\s+/g, " ").trim();
    if (unitRaw === "单词表") continue;
    const unit = unitRaw.replace(/^Module\s+(\d+)\s+Unit\s+(\d+)$/i, "M$1U$2");
    const re =
      /<div class="dancibiao-word">\s*<a[^>]*>([^<]*)<\/a>[\s\S]*?英音\s*\[([^\]]*)\][\s\S]*?<div class="dancibiao-brief">([\s\S]*?)<\/div>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block))) {
      const word = decodeEntities(m[1]).replace(/\s+/g, " ").trim();
      if (!word || word === "无") continue;
      const zh = clipZh(m[3]);
      if (!zh) continue;
      const ipaRaw = m[2].trim();
      rows.push({
        word,
        unit,
        ipa: ipaRaw ? (ipaRaw.startsWith("/") ? ipaRaw : `/${ipaRaw}/`) : "/–/",
        pos: posOf(m[3]),
        zh,
      });
    }
  }
  return rows;
}

const dict = JSON.parse(
  await readFile(join(root, "src/data/dict-core.json"), "utf8"),
) as DictCore;
const byLemma = new Map(dict.words.map((w) => [w.lemma, w]));

const listDir = join(root, "src/data/wordlists");
const packDir = join(root, "src/data/packs");
await mkdir(listDir, { recursive: true });
await mkdir(packDir, { recursive: true });

const summary: string[] = [];

for (const book of BOOKS) {
  const url = `https://fanyi.kkabc.com/list/${book.slug}`;
  const res = await fetch(url, { headers: { "User-Agent": "WordEcho/1.0" } });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  const html = await res.text();
  const parsed = parseBook(html);
  const seen = new Set<string>();
  const listLines = [`# 牛津上海版 ${book.grade}${book.volume} · 社区对照表，导入前请核对课本 Word List`];
  const words: PackWord[] = [];
  for (const row of parsed) {
    const lemma = lemmaOf(row.word);
    if (seen.has(lemma)) continue;
    seen.add(lemma);
    listLines.push(`${row.word}\t${row.unit}`);
    const hit = byLemma.get(lemma);
    const zh = kidGloss(hit?.zh && hit.zh.length <= 16 ? hit.zh : row.zh, row.word);
    const ipa = hit?.ipa || row.ipa;
    const pos = hit?.pos || row.pos;
    const examples = hit?.examples?.length ? hit.examples : [makeExample(row.word, pos, zh)];
    words.push({
      word: hit?.display ?? row.word,
      lemma,
      ipa,
      pos,
      zh,
      examples,
      unit: row.unit,
    });
  }

  const listPath = join(listDir, `${book.id}.txt`);
  await writeFile(listPath, listLines.join("\n") + "\n");

  const pack: WordPack = {
    id: book.id,
    title: `牛津上海 ${book.grade}${book.volume}`,
    curriculum: "other",
    grade: book.grade,
    volume: book.volume,
    language: "en",
    version: 1,
    words,
  };
  const packPath = join(packDir, `${book.id}.json`);
  await writeFile(packPath, JSON.stringify(pack, null, 2) + "\n");
  summary.push(`${book.id}\t${words.length} words\t${url}`);
  console.log(book.id, words.length, "words");
}

await writeFile(join(listDir, "oxford-sh-index.txt"), summary.join("\n") + "\n");
console.log("done", summary.length, "packs");
