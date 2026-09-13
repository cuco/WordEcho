import type { WordRecord } from "./types";

/** English placeholders such as `ant → ant` are not Chinese definitions. */
export function hasChineseMeaning(value: string): boolean {
  return /\p{Script=Han}/u.test(value);
}

export function isStudyWord(word: WordRecord): boolean {
  return word.enrichStatus === "complete" && hasChineseMeaning(word.meaningZh);
}
