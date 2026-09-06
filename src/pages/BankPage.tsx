import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { db } from "../db/schema";
import type { ReviewState, WordRecord } from "../lib/types";
import { todayLocal } from "../lib/types";

export function BankPage() {
  const [words, setWords] = useState<WordRecord[]>([]);
  const [reviews, setReviews] = useState<ReviewState[]>([]);
  const [q, setQ] = useState("");
  const today = todayLocal();

  useEffect(() => {
    void (async () => {
      setWords(await db.words.toArray());
      setReviews(await db.reviews.toArray());
    })();
  }, []);

  const list = useMemo(() => {
    const filtered = words.filter(
      (w) =>
        !q ||
        w.display.toLowerCase().includes(q.toLowerCase()) ||
        w.meaningZh.includes(q),
    );
    return filtered.sort((a, b) => a.display.localeCompare(b.display));
  }, [words, q]);

  function tag(w: WordRecord) {
    if (w.enrichStatus !== "complete") return <span className="tag pending">待补全</span>;
    const r = reviews.find((x) => x.wordId === w.id);
    if (!r) return null;
    if (r.repetitions === 0) return <span className="tag new">新词</span>;
    if (r.dueAt <= today) return <span className="tag new">今天要复习</span>;
    return <span className="tag">{r.intervalDays} 天后</span>;
  }

  return (
    <main className="main">
      <h1>词库</h1>
      <p className="muted">共 {words.length} 个词</p>
      <input
        className="searchbar"
        style={{ marginTop: 12 }}
        placeholder="搜索单词或中文"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {list.map((w) => (
        <Link className="word-row" key={w.id} to={`/bank/${w.id}`}>
          <div>
            <b>{w.display}</b>
            <div className="zh">{w.meaningZh || "待补全"}</div>
          </div>
          {tag(w)}
        </Link>
      ))}
      {!words.length ? <p className="empty">还没有单词，去「录入」加一个吧。</p> : null}
    </main>
  );
}
