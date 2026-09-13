import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FollowButton, SpeakButton } from "../components/AudioButtons";
import { db, getPrefs } from "../db/schema";
import { allWords } from "../db/repo";
import type { ReviewState, WordRecord } from "../lib/types";
import { stopSpeaking } from "../lib/speech";

export function WordPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [word, setWord] = useState<WordRecord | null>(null);
  const [ids, setIds] = useState<string[]>([]);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [lang, setLang] = useState("en-US");
  const [rate, setRate] = useState(0.9);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const all = (await allWords()).sort((a, b) =>
        a.display.localeCompare(b.display),
      );
      setIds(all.map((w) => w.id));
      setWord(all.find((w) => w.id === id) ?? (await db.words.get(id!)) ?? null);
      setReview((await db.reviews.get(id!)) ?? null);
      const prefs = await getPrefs();
      setLang(prefs.ttsLang);
      setRate(prefs.ttsRate);
      setMsg(null);
      stopSpeaking();
    })();
  }, [id]);

  const { prevId, nextId } = useMemo(() => {
    const i = ids.indexOf(id ?? "");
    if (i < 0) return { prevId: null, nextId: null };
    return {
      prevId: i > 0 ? ids[i - 1] : null,
      nextId: i < ids.length - 1 ? ids[i + 1] : null,
    };
  }, [ids, id]);

  if (!word) return <div className="empty">找不到这个词。</div>;

  return (
    <main className="main">
      <button className="btn ghost small" onClick={() => nav(-1)}>
        返回
      </button>
      <div className="word-hero">
        <div className="w">{word.display}</div>
        <div className="ipa">
          {word.ipa} {word.pos ? `· ${word.pos}` : ""}
        </div>
        <div className="zh">{word.meaningZh || "待补全"}</div>
      </div>
      <div className="center-row">
        <SpeakButton text={word.display} lang={lang} rate={rate} />
        <FollowButton word={word.display} lang={lang} rate={rate} onResult={setMsg} />
      </div>
      {msg ? (
        <p className="muted" style={{ textAlign: "center" }}>
          {msg}
        </p>
      ) : null}

      {(word.examples ?? []).filter((e) => e?.en?.trim()).map((e, i) => (
        <div className="card" key={i}>
          <div className="top" style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div>{e.en}</div>
              {e.zh?.trim() ? <div className="muted">{e.zh}</div> : null}
            </div>
            <SpeakButton text={e.en} lang={lang} rate={rate} size="sm" />
          </div>
        </div>
      ))}

      <div className="word-nav">
        <button
          className="btn ghost small"
          disabled={!prevId}
          onClick={() => prevId && nav(`/bank/${prevId}`, { replace: true })}
        >
          上一个
        </button>
        <button
          className="btn ghost small"
          disabled={!nextId}
          onClick={() => nextId && nav(`/bank/${nextId}`, { replace: true })}
        >
          下一个
        </button>
      </div>

      <p className="muted">
        来源：
        {word.sources.map((s) => s.unit || (s.kind === "reading" ? "速记" : s.kind)).join(" · ") ||
          "—"}
      </p>
      <p className="muted">下次复习：{review?.dueAt ?? "—"}</p>
    </main>
  );
}
