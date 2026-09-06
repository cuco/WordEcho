import type { DictCore } from "../lib/types";
import coreData from "./dict-core.json";

export const dictCore = coreData as DictCore;
export const dictCoreWords = dictCore.words;
