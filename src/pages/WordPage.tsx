import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FollowButton, SpeakButton } from "../components/AudioButtons";
import { db, getPrefs } from "../db/schema";
import type { ReviewState, WordRecord } from "../lib/types";

export function WordPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [word, setWord] = useState<WordRecord | null>(null);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [lang, setLang] = useState("en-US");
  const [rate, setRate] = useState(0.9);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setWord((await db.words.get(id!)) ?? null);
      setReview((await db.reviews.get(id!)) ?? null);
      const prefs = await getPrefs();
      setLang(prefs.ttsLang);
      setRate(prefs.ttsRate);
    })();
  }, [id]);

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
      {msg ? <p className="muted" style={{ textAlign: "center" }}>{msg}</p> : null}

      {word.examples.map((e, i) => (
        <div className="card" key={i}>
          <div className="top" style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div>{e.en}</div>
              <div className="muted">{e.zh}</div>
            </div>
            <SpeakButton text={e.en} lang={lang} rate={rate} size="sm" />
          </div>
        </div>
      ))}

      <p className="muted">
        来源：{word.sources.map((s) => s.unit || (s.kind === "reading" ? "速记" : s.kind)).join(" · ") || "—"}
      </p>
      <p className="muted">下次复习：{review?.dueAt ?? "—"}</p>
    </main>
  );
}
