import { lemmaOf } from "./types";

export type EnrichResult = {
  lemma: string;
  ipa: string;
  pos: string;
  meaningZh: string;
  examples: { en: string; zh: string }[];
};

export const ENRICH_SYSTEM_PROMPT = `你为中国小学生补全英语单词卡片。
每个词只给一条简体中文主义，不超过16个汉字，禁止超纲义、俚语、成人语境。
例句用简单现在时，1条即可，最多2条。
只输出 JSON 数组，每项字段：lemma, ipa, pos, meaningZh, examples:[{en,zh}]。`;

export async function enrichWordsWithAi(
  words: string[],
  opts: { baseUrl: string; apiKey: string; model: string },
): Promise<EnrichResult[]> {
  const lemmas = words.map(lemmaOf);
  const chunks: string[][] = [];
  for (let i = 0; i < lemmas.length; i += 40) chunks.push(lemmas.slice(i, i + 40));
  const all: EnrichResult[] = [];
  for (const chunk of chunks) {
    const url = opts.baseUrl.replace(/\/$/, "") + "/chat/completions";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        temperature: 0.2,
        messages: [
          { role: "system", content: ENRICH_SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({ words: chunk, audience: "elementary_zh" }),
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`AI ${res.status}`);
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content ?? "[]";
    const start = content.indexOf("[");
    const end = content.lastIndexOf("]");
    const parsed = JSON.parse(content.slice(start, end + 1)) as EnrichResult[];
    all.push(...parsed);
  }
  return all;
}
