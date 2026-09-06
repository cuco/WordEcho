/** First kid-safe Chinese sense; drop dictionary junk and adult glosses. */
export function kidGloss(raw: string, fallback = ""): string {
  let t = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  t = t.replace(
    /^(na|num|pron|prep|conj|det|int|aux|adv|adj|phr|vt|vi|v|n|abbr|modalv)\.?\s*/i,
    "",
  );
  t = t.split(/[；;。]/)[0]?.trim() ?? "";
  const cn = t.match(/^[\u4e00-\u9fff〇零一二三四五六七八九十百千万]+(?:[的地得了着过们儿号]*)?/);
  if (cn) t = cn[0];
  else t = t.replace(/[A-Za-z].*$/, "").replace(/[（(].*$/, "").trim();
  if (/性交|色情|脏话/.test(t)) t = t.replace(/性交.*$/, "").trim() || fallback;
  const chars = [...t].filter((c) => c !== " ");
  t = chars.join("");
  if (t.length > 16) t = chars.slice(0, 16).join("");
  return t || fallback;
}
