import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckIcon,
  FlameIcon,
  GearIcon,
  GemIcon,
  HomeIcon,
  SunIcon,
  TargetIcon,
} from "../components/icons";
import { NameChip } from "../components/NameChip";
import { db, getPrefs, savePrefs } from "../db/schema";
import { startOrResumeDaily } from "../db/session";
import { todayLocal } from "../lib/types";

function isStandaloneDisplay(): boolean {
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

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
  const [xp, setXp] = useState(0);
  const [limit, setLimit] = useState(15);
  const [due, setDue] = useState(0);
  const [total, setTotal] = useState(0);
  const [studyDates, setStudyDates] = useState<string[]>([]);
  const [cursor, setCursor] = useState(() => new Date());
  const [busy, setBusy] = useState(false);
  const [showHomeTip, setShowHomeTip] = useState(false);

  useEffect(() => {
    void (async () => {
      const prefs = await getPrefs();
      setStreak(prefs.streakDays);
      setXp(prefs.xpDate === today ? prefs.xpToday : 0);
      setLimit(prefs.dailyLimit);
      setStudyDates(prefs.studyDates);
      setShowHomeTip(!prefs.hideHomeScreenTip && !isStandaloneDisplay());
      const reviews = await db.reviews.toArray();
      setDue(reviews.filter((r) => r.dueAt <= today).length);
      setTotal(await db.words.count());
    })();
  }, [today]);

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

  async function start() {
    if (!total) {
      nav("/import");
      return;
    }
    setBusy(true);
    const { session, items } = await startOrResumeDaily();
    setBusy(false);
    if (!items.length) return;
    nav(`/lesson/${session.id}`);
  }

  function shift(delta: number) {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  }

  async function dismissHomeTip() {
    setShowHomeTip(false);
    const prefs = await getPrefs();
    await savePrefs({ ...prefs, hideHomeScreenTip: true });
  }

  return (
    <>
      <header className="hud">
        <NameChip />
        <span className="item flame">
          <FlameIcon />
          {streak}
        </span>
        <span className="item gem">
          <GemIcon />
          {xp}
        </span>
        <span className="item target">
          <TargetIcon />
          {doneToday ? goal : 0}/{goal || limit}
        </span>
        <span className="spacer" />
        <button className="gear" aria-label="设置" onClick={() => nav("/settings")}>
          <GearIcon />
        </button>
      </header>

      <main className="main">
        {showHomeTip ? (
          <aside className="home-screen-tip" aria-label="添加到主屏幕提示">
            <span className="tip-icon">
              <HomeIcon size={20} />
            </span>
            <p>
              在 iPad 的浏览器里点「分享 → 添加到主屏幕」，之后从主屏幕打开，就像装了 App 一样。
            </p>
            <button type="button" className="tip-dismiss" onClick={() => void dismissHomeTip()}>
              知道了
            </button>
          </aside>
        ) : null}

        <section className="learn-hero">
          <h1>
            {doneToday ? (
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
            {total === 0
              ? "词库还是空的，先去录入几个单词"
              : doneToday
                ? due > 0
                  ? `还有 ${due} 个词没轮到，想加练就再来一组`
                  : "今天要复习的词都清完啦"
                : due > 0
                  ? `有 ${due} 个词到期，今天练 ${goal} 题`
                  : `没有到期的词，练 ${goal} 题巩固一下`}
          </p>
          <button className="btn" disabled={busy} onClick={() => void start()}>
            {total === 0 ? "去录入单词" : doneToday ? "再练一组" : "开始学习"}
          </button>
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
