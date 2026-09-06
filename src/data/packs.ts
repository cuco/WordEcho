import type { WordPack } from "../lib/types";
import opwL1 from "./packs/opw-l1.json";
import opwL2 from "./packs/opw-l2.json";
import opwL3 from "./packs/opw-l3.json";
import opwL4 from "./packs/opw-l4.json";
import opwL5 from "./packs/opw-l5.json";
import goPhonicsL1 from "./packs/go-phonics-l1.json";
import goSightWords220 from "./packs/go-sight-words-220.json";
import newMagic1a from "./packs/new-magic-1a.json";
import newMagic1b from "./packs/new-magic-1b.json";
import newMagic2a from "./packs/new-magic-2a.json";
import newMagic2b from "./packs/new-magic-2b.json";

/**
 * Builtin packs. Partial New Magic / Go! Phonics lists are marked in titles.
 * Empty templates stay in wordlists/ until a public or parent-supplied list exists
 * (see src/data/wordlists/BOOKS.md).
 */
export const builtinPacks: WordPack[] = [
  opwL1 as WordPack,
  opwL2 as WordPack,
  opwL3 as WordPack,
  opwL4 as WordPack,
  opwL5 as WordPack,
  goPhonicsL1 as WordPack,
  goSightWords220 as WordPack,
  newMagic1a as WordPack,
  newMagic1b as WordPack,
  newMagic2a as WordPack,
  newMagic2b as WordPack,
];
