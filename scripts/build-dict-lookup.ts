/**
 * Build src/data/dict-lookup.json from ECDICT ecdict.csv.
 * Usage: npm run build-dict-lookup
 * Optional: ECDICT_CSV=/path/to/ecdict.csv npm run build-dict-lookup
 */
import { createReadStream } from "node:fs";
import { mkdir, writeFile, access } from "node:fs/promises";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { lemmaOf } from "../src/lib/types.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = join(root, "scripts/.cache");
const defaultCsv = join(cacheDir, "ecdict.csv");
const outPath = join(root, "src/data/dict-lookup.json");
const TARGET = 25_000;
const FRQ_CAP = 28_000;
const BNC_CAP = 28_000;

const ECDICT_URL =
  "https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv";

type Row = {
  word: string;
  phonetic: string;
  translation: string;
  pos: string;
  oxford: string;
  tag: string;
  bnc: string;
  frq: string;
  exchange: string;
};

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQ = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

/** Soft cap for PWA size / UI; prefer keeping everyday senses over collapsing to one. */
const MAX_LOOKUP_ZH = 120;

const POS_PREFIX_RE =
  /^(na\.|num\.|pron\.|prep\.|conj\.|det\.|int\.|aux\.|adv\.|adj\.|art\.|abbr\.|phr\.|vt\.|vi\.|v\.|n\.|a\.|ad\.)\s*/i;

/** Domain-only ECDICT lines like "[计] 工作簿" / "[医] 库" — drop whole line. */
const TECH_LINE_RE = /^\[[^\]]+\]/;

function cleanSenseLine(line: string): string {
  let t = line.trim();
  if (!t || TECH_LINE_RE.test(t)) return "";
  t = t.replace(POS_PREFIX_RE, "").trim();
  // Drop parenthetical clutter
  t = t.replace(/[（(][^）)]*[）)]/g, "").trim();
  // Normalize gloss separators within a POS group
  t = t.replace(/\s*[,，]\s*/g, "，");
  t = t.replace(/^[,，、.;；\s]+/, "").replace(/[,，、.;；\s]+$/, "").trim();
  return t;
}

/** Truncate at sense/gloss boundary when over the soft cap. */
function truncateZh(s: string, max: number): string {
  const chars = [...s];
  if (chars.length <= max) return s;
  const slice = chars.slice(0, max).join("");
  const minKeep = Math.floor(max * 0.4);
  const semi = slice.lastIndexOf("；");
  if (semi >= minKeep) return slice.slice(0, semi);
  const comma = slice.lastIndexOf("，");
  if (comma >= minKeep) return slice.slice(0, comma);
  return slice;
}

/**
 * Keep all useful Chinese senses from ECDICT `translation`.
 * Major POS groups joined by `；`; domain-only `[计]`/`[医]` lines dropped.
 */
function formatZh(translation: string): string {
  const raw = translation.replace(/\r/g, "").replace(/\\n/g, "\n").trim();
  if (!raw) return "";

  const majors: string[] = [];
  const seen = new Set<string>();
  for (const line of raw.split(/\n/)) {
    const cleaned = cleanSenseLine(line);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    majors.push(cleaned);
  }
  if (!majors.length) return "";

  return truncateZh(majors.join("；"), MAX_LOOKUP_ZH);
}

function posOf(posField: string, translation: string): string {
  const p = posField.trim().toLowerCase();
  if (p) {
    // "n:46/v:54" → pick highest share
    let best = "";
    let bestN = -1;
    for (const part of p.split("/")) {
      const [tag, n] = part.split(":");
      const score = n ? Number(n) : 0;
      if (tag && score >= bestN) {
        best = tag;
        bestN = score;
      }
    }
    if (best === "j") return "adj";
    if (best === "r") return "adv";
    if (best === "m") return "num";
    if (best === "c") return "conj";
    if (best === "i") return "prep";
    if (best === "u") return "int";
    if (best === "v" || best === "t") return "v";
    if (best) return best;
  }
  const t = translation.trim().toLowerCase();
  if (/^(vt\.|vi\.|v\.|aux\.)/.test(t)) return "v";
  if (/^(adv\.)/.test(t)) return "adv";
  if (/^(adj\.|a\.)/.test(t)) return "adj";
  if (/^(prep\.)/.test(t)) return "prep";
  if (/^(conj\.)/.test(t)) return "conj";
  if (/^(pron\.)/.test(t)) return "pron";
  if (/^(int\.)/.test(t)) return "int";
  if (/^(n\.)/.test(t)) return "n";
  return "n";
}

function ipaOf(phonetic: string): string {
  const p = phonetic.trim();
  if (!p) return "";
  if (p.startsWith("/") && p.endsWith("/")) return p;
  return `/${p}/`;
}

function isSimpleLemma(word: string): boolean {
  if (!/^[a-z][a-z'-]*[a-z]$|^[a-z]$/i.test(word)) return false;
  if (word.includes(" ")) return false;
  if (word.length > 24) return false;
  return true;
}

function wantRow(r: Row): boolean {
  if (!isSimpleLemma(r.word)) return false;
  if (!r.translation.trim()) return false;
  if (r.oxford === "1") return true;
  const tags = r.tag.toLowerCase().split(/\s+/).filter(Boolean);
  if (tags.some((t) => t === "zk" || t === "gk" || t === "cet4" || t === "cet6" || t === "ky" || t === "ielts")) {
    return true;
  }
  const frq = Number(r.frq);
  const bnc = Number(r.bnc);
  if (frq > 0 && frq <= FRQ_CAP) return true;
  if (bnc > 0 && bnc <= BNC_CAP) return true;
  return false;
}

function scoreRow(r: Row): number {
  // Lower is better; prefer tagged + frequent
  let s = 1_000_000;
  if (r.oxford === "1") s = Math.min(s, 100);
  const tags = new Set(r.tag.toLowerCase().split(/\s+/).filter(Boolean));
  if (tags.has("zk")) s = Math.min(s, 200);
  if (tags.has("gk")) s = Math.min(s, 300);
  if (tags.has("cet4")) s = Math.min(s, 400);
  if (tags.has("cet6")) s = Math.min(s, 500);
  const frq = Number(r.frq);
  const bnc = Number(r.bnc);
  if (frq > 0) s = Math.min(s, 1000 + frq);
  if (bnc > 0) s = Math.min(s, 1000 + bnc);
  return s;
}

function parseExchangeForms(exchange: string): string[] {
  const forms: string[] = [];
  if (!exchange.trim()) return forms;
  for (const part of exchange.split("/")) {
    const idx = part.indexOf(":");
    if (idx < 0) continue;
    const kind = part.slice(0, idx);
    const form = part.slice(idx + 1).trim().toLowerCase();
    // Skip lemma pointers (0:) and meta (1:)
    if (kind === "0" || kind === "1") continue;
    if (form && isSimpleLemma(form)) forms.push(form);
  }
  return forms;
}

async function ensureCsv(path: string): Promise<void> {
  try {
    await access(path);
    return;
  } catch {
    /* download */
  }
  await mkdir(dirname(path), { recursive: true });
  console.log("downloading", ECDICT_URL);
  const res = await fetch(ECDICT_URL);
  if (!res.ok || !res.body) throw new Error(`download failed ${res.status}`);
  await pipeline(res.body as unknown as NodeJS.ReadableStream, createWriteStream(path));
  console.log("saved", path);
}

async function main() {
  const csvPath = process.env.ECDICT_CSV ?? defaultCsv;
  await ensureCsv(csvPath);

  const rl = createInterface({ input: createReadStream(csvPath, { encoding: "utf8" }), crlfDelay: Infinity });
  let header: string[] | null = null;
  const col = (name: string) => {
    const i = header!.indexOf(name);
    if (i < 0) throw new Error(`missing column ${name}`);
    return i;
  };

  const candidates: { row: Row; score: number }[] = [];
  let lineNo = 0;
  for await (const line of rl) {
    lineNo += 1;
    if (!header) {
      header = parseCsvLine(line);
      continue;
    }
    if (!line.trim()) continue;
    const cells = parseCsvLine(line);
    const row: Row = {
      word: cells[col("word")] ?? "",
      phonetic: cells[col("phonetic")] ?? "",
      translation: cells[col("translation")] ?? "",
      pos: cells[col("pos")] ?? "",
      oxford: cells[col("oxford")] ?? "",
      tag: cells[col("tag")] ?? "",
      bnc: cells[col("bnc")] ?? "",
      frq: cells[col("frq")] ?? "",
      exchange: cells[col("exchange")] ?? "",
    };
    if (!wantRow(row)) continue;
    const zh = formatZh(row.translation);
    if (!zh) continue;
    candidates.push({ row, score: scoreRow(row) });
  }

  candidates.sort((a, b) => a.score - b.score || a.row.word.localeCompare(b.row.word));

  const w: Record<string, [string, string, string]> = {};
  const pendingForms: { form: string; lemma: string }[] = [];

  for (const { row } of candidates) {
    if (Object.keys(w).length >= TARGET) break;
    const lemma = lemmaOf(row.word);
    if (w[lemma]) continue;
    const zh = formatZh(row.translation);
    if (!zh) continue;
    w[lemma] = [ipaOf(row.phonetic), posOf(row.pos, row.translation), zh];
    for (const form of parseExchangeForms(row.exchange)) {
      pendingForms.push({ form: lemmaOf(form), lemma });
    }
  }

  const f: Record<string, string> = {};
  for (const { form, lemma } of pendingForms) {
    if (form === lemma) continue;
    if (w[form]) continue; // existing lemma wins (e.g. saw as noun)
    if (f[form] && f[form] !== lemma) continue;
    f[form] = lemma;
  }

  const payload = { version: 1 as const, w, f };
  await writeFile(outPath, JSON.stringify(payload) + "\n");
  console.log(
    `wrote ${outPath}: ${Object.keys(w).length} lemmas, ${Object.keys(f).length} forms (${lineNo} csv lines)`,
  );
}

await main();
