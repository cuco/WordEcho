import { beforeAll, describe, expect, it } from "vitest";
import { ensureDictLookup, lookupDictWord } from "../data/dict-lookup";
import { lookupOffline, resolveWord } from "./resolve-word";
import type { DictCoreWord, DictLookupWord, WordRecord } from "./types";

const dict: DictCoreWord[] = [
  {
    lemma: "cat",
    display: "cat",
    ipa: "/kæt/",
    pos: "n",
    zh: "猫",
    examples: [{ en: "I have a cat.", zh: "我有一只猫。" }],
  },
];

function fakeLookup(map: Record<string, DictLookupWord>): (lemma: string) => DictLookupWord | null {
  return (lemma) => map[lemma] ?? null;
}

describe("resolveWord", () => {
  beforeAll(async () => {
    await ensureDictLookup();
  });

  it("hits dict-core offline", async () => {
    const r = await resolveWord("Cat", { local: [], dictCore: dict, packs: [] });
    expect(r.source).toBe("dict-core");
    expect(r.meaningZh).toBe("猫");
    expect(r.enrichStatus).toBe("complete");
  });

  it("prefers complete local over dict", () => {
    const local: WordRecord[] = [
      {
        id: "1",
        lemma: "cat",
        display: "cat",
        ipa: null,
        meaningZh: "猫咪",
        pos: "n",
        examples: [],
        sources: [],
        enrichStatus: "complete",
        createdAt: "",
        updatedAt: "",
      },
    ];
    const hit = lookupOffline("cat", { local, dictCore: dict, packs: [] });
    expect(hit?.meaningZh).toBe("猫咪");
  });

  it("enriches pending local from dict-lookup", async () => {
    const local: WordRecord[] = [
      {
        id: "1",
        lemma: "hedgehog",
        display: "hedgehog",
        ipa: null,
        meaningZh: "",
        pos: null,
        examples: [],
        sources: [],
        enrichStatus: "pending",
        createdAt: "",
        updatedAt: "",
      },
    ];
    const r = await resolveWord("hedgehog", {
      local,
      dictCore: [],
      packs: [],
      dictLookup: fakeLookup({
        hedgehog: {
          lemma: "hedgehog",
          display: "hedgehog",
          ipa: "/h/",
          pos: "n",
          zh: "刺猬",
        },
      }),
    });
    expect(r.source).toBe("dict-lookup");
    expect(r.meaningZh).toBe("刺猬");
    expect(r.enrichStatus).toBe("complete");
  });

  it("pending without ai when nothing hits", async () => {
    const r = await resolveWord("zzzxnotaword", { local: [], dictCore: dict, packs: [] });
    expect(r.enrichStatus).toBe("pending");
  });

  it("hits dict-lookup without ai", async () => {
    const r = await resolveWord(
      "hedgehog",
      {
        local: [],
        dictCore: dict,
        packs: [],
        dictLookup: fakeLookup({
          hedgehog: {
            lemma: "hedgehog",
            display: "hedgehog",
            ipa: "/h/",
            pos: "n",
            zh: "刺猬",
          },
        }),
      },
    );
    expect(r.source).toBe("dict-lookup");
    expect(r.meaningZh).toBe("刺猬");
    expect(r.enrichStatus).toBe("complete");
  });

  it("resolves inflection via dict-lookup while keeping typed lemma", async () => {
    const r = await resolveWord(
      "Went",
      {
        local: [],
        dictCore: [],
        packs: [],
        dictLookup: (lemma) => {
          if (lemma === "went") {
            return { lemma: "go", display: "go", ipa: "/gəʊ/", pos: "v", zh: "去" };
          }
          return null;
        },
      },
    );
    expect(r.source).toBe("dict-lookup");
    expect(r.lemma).toBe("went");
    expect(r.display).toBe("Went");
    expect(r.meaningZh).toBe("去");
  });

  it("real dict-lookup map finds common words and forms", () => {
    expect(lookupDictWord("hedgehog")?.zh).toBeTruthy();
    expect(lookupDictWord("went")?.zh).toBeTruthy();
    // saw exists as its own lemma → must not be overwritten by see
    const saw = lookupDictWord("saw");
    expect(saw?.lemma).toBe("saw");
  });

  it("real dict-lookup keeps multiple Chinese senses", () => {
    const bank = lookupDictWord("bank")?.zh ?? "";
    expect(bank).toMatch(/银行/);
    expect(bank).toMatch(/堤|岸/);
    const book = lookupDictWord("book")?.zh ?? "";
    expect(book).toMatch(/书/);
    expect(book).toMatch(/预订|登记/);
    const fine = lookupDictWord("fine")?.zh ?? "";
    expect(fine).toMatch(/好的|晴朗/);
    expect(fine).toMatch(/罚款|罚金/);
    // domain-only tails should not be the only sense
    expect(bank).not.toMatch(/^库$/);
  });
});
