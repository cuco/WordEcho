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
  const [openMore, setOpenMore] = useState(true);
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
    try {
      const saved = await resolveMany(
        lines.map((l) => ({ word: l.word })),
        { kind: "reading" },
      );
      setRecent((r) => {
        const ids = new Set(saved.map((w) => w.id));
        return [...saved, ...r.filter((w) => !ids.has(w.id))].slice(0, 20);
      });
      setText("");
    } finally {
      setBusy(false);
    }
  }

  async function doImport(pack: WordPack) {
    setBusy(true);
    try {
      const r = await importPack(pack);
      setIds(await importedPackIds());
      setMsg(`${pack.title}：新增 ${r.added}，合并 ${r.merged}`);
    } catch {
      setMsg(`${pack.title}：导入失败`);
    } finally {
      setBusy(false);
    }
  }

  async function doImportAll() {
    if (!builtinPacks.length) return;
    setBusy(true);
    let added = 0;
    let merged = 0;
    let failed = 0;
    try {
      for (let i = 0; i < builtinPacks.length; i++) {
        const pack = builtinPacks[i]!;
        setMsg(`正在导入 ${i + 1}/${builtinPacks.length}：${pack.title}…`);
        try {
          const r = await importPack(pack);
          added += r.added;
          merged += r.merged;
        } catch {
          failed += 1;
        }
      }
      setIds(await importedPackIds());
      setMsg(
        failed
          ? `全部完成：新增 ${added}，合并 ${merged}，失败 ${failed} 个`
          : `全部完成：新增 ${added}，合并 ${merged}`,
      );
    } finally {
      setBusy(false);
    }
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
        <span>课文词包</span>
        <span className="muted">{openMore ? "收起" : "展开"}</span>
      </button>

      {openMore ? (
        <>
          <div className="pack-actions">
            <button
              className="btn ghost small"
              disabled={busy || !builtinPacks.length}
              onClick={() => void doImportAll()}
            >
              一键导入所有
            </button>
          </div>
          {msg ? <p className="muted">{msg}</p> : null}
          {builtinPacks.map((p) => {
            const imported = ids.includes(p.id);
            return (
              <div className="card pack-row" key={p.id}>
                <div className="pack-row-main">
                  <b className="pack-row-title">{p.title}</b>
                  <span className="muted pack-row-count">{p.words.length} 词</span>
                </div>
                <button
                  className={`btn ghost small${imported ? " is-update" : ""}`}
                  disabled={busy}
                  onClick={() => void doImport(p)}
                >
                  {imported ? "更新" : "导入"}
                </button>
              </div>
            );
          })}
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
