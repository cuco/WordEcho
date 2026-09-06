import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { kidGloss } from "../src/lib/kid-gloss.ts";
import { isPlaceholderExample, makeExample } from "../src/lib/make-example.ts";
import type { WordPack } from "../src/lib/types.ts";

const packDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src/data/packs");

let changed = 0;
for (const name of await readdir(packDir)) {
  if (!name.startsWith("oxford-sh-g") || !name.endsWith(".json")) continue;
  const path = join(packDir, name);
  const pack = JSON.parse(await readFile(path, "utf8")) as WordPack;
  pack.words = pack.words.map((w) => {
    const zh = kidGloss(w.zh, w.word);
    const old = w.examples[0];
    const examples =
      !old || isPlaceholderExample(old) || old.en.toLowerCase().startsWith("this is")
        ? [makeExample(w.word, w.pos, zh)]
        : w.examples;
    if (zh !== w.zh || examples !== w.examples) changed += 1;
    return { ...w, zh, examples };
  });
  await writeFile(path, JSON.stringify(pack, null, 2) + "\n");
}
console.log("updated", changed, "entries");
