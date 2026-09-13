import { useEffect, useMemo, useState } from "react";
import { liveQuery } from "dexie";
import { useNavigate } from "react-router-dom";
import {
  CheckIcon,
  FlameIcon,
  GearIcon,
  GemIcon,
  SunIcon,
  TargetIcon,
} from "../components/icons";
import { NameChip } from "../components/NameChip";
import { db, getPrefs } from "../db/schema";
import { repairWordMeanings } from "../db/repo";
import { getRewardState } from "../db/rewards";
import { getUnfinishedSession, startOrResumeDaily } from "../db/session";
import { todayLocal } from "../lib/types";
import { isStudyWord } from "../lib/word-quality";

const DOW = ["一", "二", "三", "四", "五", "六", "日"];

function monthCells(year: number, month: number) {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Monday-first
  const cells: (number | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push(d);
  return cells;
}

export function LearnPage() {
  const nav = useNavigate();
  const today = todayLocal();
  const [streak, setStreak] = useState(0);
  const [available, setAvailable] = useState<number | null>(null);
  const [limit, setLimit] = useState(15);
  const [due, setDue] = useState(0);
  const [total, setTotal] = useState(0);
  const [studyDates, setStudyDates] = useState<string[]>([]);
  const [cursor, setCursor] = useState(() => new Date());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [unfinished, setUnfinished] = useState<Awaited<ReturnType<typeof getUnfinishedSession>>>(null);

  useEffect(() => {
    void (async () => {
      const prefs = await getPrefs();
      setStreak(prefs.streakDays);
      setLimit(prefs.dailyLimit);
      setStudyDates(prefs.studyDates);
      const words = await repairWordMeanings();
      const studyIds = new Set(words.filter(isStudyWord).map((word) => word.id));
      const reviews = await db.reviews.toArray();
      setDue(reviews.filter((r) => r.dueAt <= today && studyIds.has(r.wordId)).length);
      setTotal(words.length);
      setUnfinished(await getUnfinishedSession(today));
      setLoaded(true);
    })();
  }, [today]);

  useEffect(() => {
    let active = true;
    // Both pages read the same balance; watch earned XP and all reward spending.
    const subscription = liveQuery(() => Promise.all([db.prefs.toArray(), db.redemptions.toArray()]))
      .subscribe({
        next: () => {
          void getRewardState().then((state) => { if (active) setAvailable(state.available); })
            .catch(() => { if (active) setAvailable(null); });
        },
        error: () => { if (active) setAvailable(null); },
      });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const cells = useMemo(
    () => monthCells(cursor.getFullYear(), cursor.getMonth()),
    [cursor],
  );
  const doneThisMonth = useMemo(() => {
    const prefix = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    return studyDates.filter((d) => d.startsWith(prefix)).length;
  }, [studyDates, cursor]);

  const goal = Math.min(due, limit) || Math.min(total, limit);
  const doneToday = studyDates.includes(today);
  const answered = unfinished?.items.filter((item) => item.chosenIndex !== null).length ?? 0;
  const lessonTotal = unfinished?.items.length ?? 0;

  async function start() {
    if (!total && !unfinished) {
      nav("/import");
      return;
    }
    setBusy(true);
    try {
      const { session, items } = await startOrResumeDaily();
      if (items.length) nav(`/lesson/${session.id}`);
      else setNotice("这些单词的中文释义还没补全，补全后再来学习。");
    } finally {
      setBusy(false);
    }
  }

  function shift(delta: number) {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  }

  return (
    <>
      <header className="hud">
        <NameChip />
        <span className="item flame">
          <FlameIcon />
          {streak}
        </span>
        <span className="item gem" role="status" title="可用积分，可兑换贴纸和喂养伙伴" aria-label={`当前可用积分 ${available ?? "加载中"}`}>
          <GemIcon />
          {available === null ? "—" : available.toLocaleString()}
        </span>
        <span className="item target">
          <TargetIcon />
          {unfinished ? answered : doneToday ? goal : 0}/{unfinished ? lessonTotal : goal || limit}
        </span>
        <span className="spacer" />
        <button className="gear" aria-label="设置" onClick={() => nav("/settings")}>
          <GearIcon />
        </button>
      </header>

      <main className="main">
        <section className="learn-hero">
          <h1>
            {unfinished ? "接着上次继续学" : doneToday ? (
              <>
                <span className="done-badge">
                  <CheckIcon size={18} />
                </span>
                今天打卡完成
              </>
            ) : (
              "今天背单词"
            )}
          </h1>
          <p>
            {unfinished
              ? `已完成 ${answered} / ${lessonTotal} 题，接着第 ${unfinished.session.currentIndex + 1} 题继续`
              : total === 0
              ? "词库还是空的，先去录入几个单词"
              : doneToday
                ? due > 0
                  ? `还有 ${due} 个词没轮到，想加练就再来一组`
                  : "今天要复习的词都清完啦"
                : due > 0
                  ? `有 ${due} 个词到期，今天练 ${goal} 题`
                  : `没有到期的词，练 ${goal} 题巩固一下`}
          </p>
          {unfinished ? (
            <div
              className="progress resume-progress"
              role="progressbar"
              aria-label="本课答题进度"
              aria-valuemin={0}
              aria-valuemax={lessonTotal}
              aria-valuenow={answered}
            >
              <span style={{ width: `${(answered / lessonTotal) * 100}%` }} />
            </div>
          ) : null}
          <button className="btn" disabled={busy || !loaded} onClick={() => void start()}>
            {unfinished ? "继续学习" : total === 0 ? "去录入单词" : doneToday ? "再练一组" : "开始学习"}
          </button>
          {notice ? <p role="status">{notice}</p> : null}
        </section>

        <div className="section-title">打卡日历</div>
        <div className="calendar">
          <div className="cal-head">
            <button onClick={() => shift(-1)} aria-label="上个月">
              ‹
            </button>
            <span>
              {cursor.getFullYear()} 年 {cursor.getMonth() + 1} 月
            </span>
            <button onClick={() => shift(1)} aria-label="下个月">
              ›
            </button>
          </div>
          <div className="cal-grid">
            {DOW.map((d) => (
              <div className="dow" key={d}>
                {d}
              </div>
            ))}
            {cells.map((d, i) => {
              if (d === null) return <div key={`x${i}`} />;
              const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
              const isDone = studyDates.includes(iso);
              const isToday = iso === today;
              const cls = ["cal-cell", isDone ? "done" : "", isToday ? "today" : ""]
                .filter(Boolean)
                .join(" ");
              const label = `${d} 日${isToday ? "，今天" : ""}${isDone ? "，已打卡" : ""}`;
              return (
                <div className={cls} key={iso} aria-label={label}>
                  <span className="cal-disc">
                    {isDone ? (
                      <CheckIcon size={30} />
                    ) : isToday ? (
                      <SunIcon size={30} />
                    ) : (
                      d
                    )}
                    {isDone && isToday ? (
                      <span className="cal-sun">
                        <SunIcon size={22} />
                      </span>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="cal-foot">
            本月打卡 {doneThisMonth} 天 · 连胜 {streak} 天
          </div>
        </div>
      </main>
    </>
  );
}
