import { useEffect, useState } from "react";
import { SpeakButton } from "../components/AudioButtons";
import { builtinPacks } from "../data/packs";
import { importPack, importedPackIds, resolveMany } from "../db/repo";
import { getPrefs } from "../db/schema";
import { parseImportText, uniqueLemmas } from "../lib/parse-import";
import type { WordPack, WordRecord } from "../lib/types";

export function ImportPage() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<WordRecord[]>([]);
  const [ids, setIds] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [openMore, setOpenMore] = useState(false);
  const [lang, setLang] = useState("en-US");
  const [rate, setRate] = useState(0.9);

  useEffect(() => {
    void importedPackIds().then(setIds);
    void getPrefs().then((p) => {
      setLang(p.ttsLang);
      setRate(p.ttsRate);
    });
  }, []);

  async function addWords() {
    const lines = uniqueLemmas(
      parseImportText(text.replace(/[,，\s]+/g, "\n")).filter((l) => !l.invalid),
    );
    if (!lines.length) return;
    setBusy(true);
    const saved = await resolveMany(
      lines.map((l) => ({ word: l.word })),
      { kind: "reading" },
    );
    setRecent((r) => {
      const ids = new Set(saved.map((w) => w.id));
      return [...saved, ...r.filter((w) => !ids.has(w.id))].slice(0, 20);
    });
    setText("");
    setBusy(false);
  }

  async function doImport(pack: WordPack) {
    setBusy(true);
    const r = await importPack(pack);
    setIds(await importedPackIds());
    setMsg(`${pack.title}：新增 ${r.added}，合并 ${r.merged}`);
    setBusy(false);
  }

  async function fromFile(file: File) {
    try {
      const pack = JSON.parse(await file.text()) as WordPack;
      if (!pack.id || !Array.isArray(pack.words)) {
        setMsg("这个文件不是有效词包");
        return;
      }
      await doImport(pack);
    } catch {
      setMsg("文件读取失败");
    }
  }

  return (
    <main className="main">
      <h1>录入单词</h1>
      <p className="muted">只打英文就行，中文和例句自动补。多个词用空格或换行隔开。</p>

      <div className="quick-row" style={{ marginTop: 14 }}>
        <input
          placeholder="hedgehog"
          value={text}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void addWords();
          }}
        />
        <button className="btn" disabled={busy || !text.trim()} onClick={() => void addWords()}>
          添加
        </button>
      </div>

      {recent.length ? (
        <>
          <div className="section-title">刚刚录入</div>
          {recent.map((w) => (
            <div
              className={`result-card${w.enrichStatus === "complete" ? "" : " pending"}`}
              key={w.id + w.updatedAt}
            >
              <div className="top">
                <div>
                  <b>{w.display}</b>{" "}
                  <span className="muted">{w.ipa ?? ""}</span>
                  <div className="zh">
                    {w.meaningZh || "词典里没有，可稍后补或配 AI"}
                  </div>
                </div>
                <SpeakButton text={w.display} lang={lang} rate={rate} size="sm" />
              </div>
              {w.examples[0] ? (
                <div className="ex">
                  {w.examples[0].en} · {w.examples[0].zh}
                </div>
              ) : null}
            </div>
          ))}
        </>
      ) : null}

      <div className="section-title">批量导入</div>
      <button className="disclosure" onClick={() => setOpenMore((v) => !v)}>
        <span>课文词包（不常用）</span>
        <span className="muted">{openMore ? "收起" : "展开"}</span>
      </button>

      {openMore ? (
        <>
          {msg ? <p className="muted">{msg}</p> : null}
          {builtinPacks.map((p) => (
            <div className="card" key={p.id}>
              <b>{p.title}</b>
              <p className="muted">
                {p.words.length} 词 · {ids.includes(p.id) ? "已导入" : "未导入"}
              </p>
              <button className="btn ghost" disabled={busy} onClick={() => void doImport(p)}>
                {ids.includes(p.id) ? "重新导入（合并）" : "导入"}
              </button>
            </div>
          ))}
          <label>从文件导入 JSON</label>
          <input
            type="file"
            accept="application/json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void fromFile(f);
            }}
          />
        </>
      ) : null}
    </main>
  );
}
