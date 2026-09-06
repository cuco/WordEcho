import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FollowButton, SpeakButton } from "../components/AudioButtons";
import { Confetti } from "../components/Confetti";
import { CheckIcon, CrossIcon, FlameIcon, TrophyIcon } from "../components/icons";
import { db, getPrefs } from "../db/schema";
import { appendRetries, finishSession, gradeItem } from "../db/session";
import type { Praise } from "../lib/praise";
import { praiseCorrect, praiseFinish, praiseWrong } from "../lib/praise";
import { playCombo, playCorrect, playFinish, playWrong, setSoundEnabled } from "../lib/sfx";
import { speak, stopSpeaking, warmUpSpeech } from "../lib/speech";
import type { QuizItem, QuizSession, ReviewState, WordRecord } from "../lib/types";

const TYPE_LABEL: Record<QuizItem["type"], string> = {
  en_to_zh: "选择正确的中文",
  zh_to_en: "选择正确的单词",
  cloze: "补全这个单词",
};

/**
 * 亮答案后自动念单词要等音效先散掉。掌声移除后提示音短了很多：离线渲染量出来
 * `playCorrect` 的钟音 0.36s 收完（-30dB 在 0.29s），`playWrong` 0.33s 收完，
 * 所以 400ms 刚好留 ~40ms 空隙，不抢音效也不再有那段尴尬的空白。
 */
const AUTO_SPEAK_DELAY_MS = 400;

export function LessonPage() {
  const { sessionId } = useParams();
  const nav = useNavigate();
  const [session, setSession] = useState<QuizSession | null>(null);
  const [items, setItems] = useState<QuizItem[]>([]);
  const [words, setWords] = useState<WordRecord[]>([]);
  const [reviews, setReviews] = useState<ReviewState[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(false);
  const [streak, setStreak] = useState(0);
  const [followMsg, setFollowMsg] = useState<string | null>(null);
  const [praise, setPraise] = useState<Praise | null>(null);
  const [finalPraise, setFinalPraise] = useState<Praise | null>(null);
  const [combo, setCombo] = useState(0);
  const [comboFlash, setComboFlash] = useState(false);
  const retriesAdded = useRef(false);
  const autoSpeakTimer = useRef<number | null>(null);
  const autoSpokenFor = useRef<string | null>(null);
  const shownAt = useRef(Date.now());
  const bestCombo = useRef(0);
  const [lang, setLang] = useState("en-US");
  const [rate, setRate] = useState(0.9);
  const autoSpeakOn = useRef(true);
  const name = useRef("");

  useEffect(() => {
    void (async () => {
      const s = await db.sessions.get(sessionId!);
      const raw = await db.items.where("sessionId").equals(sessionId!).toArray();
      const prefs = await getPrefs();
      setLang(prefs.ttsLang);
      setRate(prefs.ttsRate);
      setSoundEnabled(prefs.soundOn ?? true);
      autoSpeakOn.current = prefs.autoSpeak ?? true;
      name.current = prefs.name ?? "";
      setWords(await db.words.toArray());
      setReviews(await db.reviews.toArray());
      const ordered = s
        ? (s.itemIds.map((id) => raw.find((i) => i.id === id)).filter(Boolean) as QuizItem[])
        : raw;
      setSession(s ?? null);
      setItems(ordered);
      retriesAdded.current = ordered.some((i) => i.id.includes("retry"));
      if (s?.finishedAt) setDone(true);
      const cur = ordered[s?.currentIndex ?? 0];
      if (cur?.chosenIndex != null) {
        setPicked(cur.chosenIndex);
        setRevealed(true);
      }
      shownAt.current = Date.now();
    })();
  }, [sessionId]);

  const idx = session?.currentIndex ?? 0;
  const item = items[idx];
  const word = words.find((w) => w.id === item?.wordId);
  const pct = useMemo(
    () => (items.length ? Math.round((idx / items.length) * 100) : 0),
    [idx, items.length],
  );

  /** 上一题排着的朗读绝不能念到下一题的单词上：排队的掐掉，正在念的也掐掉 */
  function cancelAutoSpeak() {
    if (autoSpeakTimer.current !== null) {
      clearTimeout(autoSpeakTimer.current);
      autoSpeakTimer.current = null;
    }
    stopSpeaking();
  }

  useEffect(() => () => cancelAutoSpeak(), []);

  async function check() {
    if (picked === null || !item || revealed) return;
    // 手势里先解锁语音引擎，等下的 setTimeout 才敢在 iPad Safari 上开口
    if (autoSpeakOn.current) warmUpSpeech();
    const graded = await gradeItem(item, picked);
    setItems((list) => list.map((i) => (i.id === graded.id ? graded : i)));
    setRevealed(true);

    const review = reviews.find((r) => r.wordId === item.wordId);
    if (graded.correct) {
      const next = combo + 1;
      setCombo(next);
      bestCombo.current = Math.max(bestCombo.current, next);
      setPraise(
        praiseCorrect({
          combo: next,
          type: item.type,
          isRetry: item.id.includes("retry"),
          repetitions: review?.repetitions ?? 0,
          lapses: review?.lapses ?? 0,
          elapsedMs: Date.now() - shownAt.current,
          seed: item.id,
          name: name.current,
        }),
      );
      playCorrect(next);
      if (next >= 3) {
        setComboFlash(true);
        if (next % 5 === 0) playCombo();
      }
    } else {
      setPraise(
        praiseWrong({
          type: item.type,
          answer: item.options[item.answerIndex],
          chosen: item.options[picked],
          display: word?.display ?? "",
          lapses: review?.lapses ?? 0,
          comboBefore: combo,
          seed: item.id,
          name: name.current,
        }),
      );
      setCombo(0);
      setComboFlash(false);
      playWrong();
    }

    // 音效先响完，再把这个词念一遍；答错的时候最需要听见它。
    // T2（中译英）也只在这里念——亮答案之后，答题前一个字都不会漏。
    if (word && autoSpeakOn.current && autoSpokenFor.current !== item.id) {
      // 这里不调 cancelAutoSpeak()：它会把 warmUpSpeech() 那条静音 utterance 掐掉，
      // iPad 上的手势解锁就白做了。revealed 守卫已经保证一题只会走到这里一次。
      autoSpokenFor.current = item.id;
      autoSpeakTimer.current = window.setTimeout(() => {
        autoSpeakTimer.current = null;
        speak(word.display, lang, rate);
      }, AUTO_SPEAK_DELAY_MS);
    }
  }

  async function cont() {
    if (!session || !item) return;
    cancelAutoSpeak();
    // 每题的 XP 由 gradeItem 写进库里，这里必须拿最新的，不然会把分数覆盖掉
    let cur = (await db.sessions.get(session.id)) ?? session;
    let list = items;
    if (!retriesAdded.current && idx === items.length - 1) {
      retriesAdded.current = true;
      const appended = await appendRetries(cur, items);
      cur = appended.session;
      list = appended.items;
      setItems(list);
    }
    const nextIndex = idx + 1;
    if (nextIndex >= list.length) {
      const fin = await finishSession(cur);
      const main = list.filter((i) => !i.id.includes("retry"));
      const retry = list.filter((i) => i.id.includes("retry"));
      setFinalPraise(
        praiseFinish({
          total: main.length,
          correct: main.filter((i) => i.correct).length,
          retried: retry.length,
          retriedFixed: retry.filter((i) => i.correct).length,
          bestCombo: bestCombo.current,
          streak: fin.streak,
          seed: cur.id,
          name: name.current,
        }),
      );
      setStreak(fin.streak);
      setSession(fin.session);
      setDone(true);
      playFinish();
      return;
    }
    const next = { ...cur, currentIndex: nextIndex };
    await db.sessions.put(next);
    setSession(next);
    setPicked(null);
    setRevealed(false);
    setFollowMsg(null);
    setPraise(null);
    shownAt.current = Date.now();
  }

  if (!session) return <div className="empty">加载中…</div>;

  if (done) {
    const main = items.filter((i) => !i.id.includes("retry"));
    const wrong = main.filter((i) => i.correct === false);
    const ok = main.filter((i) => i.correct).length;
    const acc = main.length ? Math.round((ok / main.length) * 100) : 0;
    const head = finalPraise ?? { title: "完成啦！", note: "今天这一课练完了" };
    return (
      <div className="celebrate">
        <Confetti />
        <div className="trophy pop">
          <TrophyIcon />
        </div>
        <h1>{head.title}</h1>
        {head.note ? <p className="sub big">{head.note}</p> : null}
        <p className="sub">
          <FlameIcon size={18} /> 连胜 {streak} 天
        </p>
        <div className="score-row">
          <div className="score xp">
            <div className="inner">
              <small>获得 XP</small>
              <b>{session.xpEarned}</b>
            </div>
          </div>
          <div className="score acc">
            <div className="inner">
              <small>正确率</small>
              <b>{acc}%</b>
            </div>
          </div>
          <div className="score miss">
            <div className="inner">
              <small>最长连对</small>
              <b>{bestCombo.current}</b>
            </div>
          </div>
        </div>

        {wrong.length ? (
          <div className="miss-list">
            <div className="section-title">这些词明天还会见面</div>
            {wrong.slice(0, 6).map((w) => {
              const ww = words.find((x) => x.id === w.wordId);
              if (!ww) return null;
              return (
                <div className="miss-item" key={w.id}>
                  <span>
                    {ww.display}
                    <span className="muted"> · {ww.meaningZh}</span>
                  </span>
                  <SpeakButton text={ww.display} lang={lang} rate={rate} size="sm" />
                </div>
              );
            })}
            {wrong.length > 6 ? (
              <p className="muted">还有 {wrong.length - 6} 个词，明天继续</p>
            ) : null}
          </div>
        ) : null}

        <div className="footer">
          <button className="btn" onClick={() => nav("/")}>
            继续
          </button>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="celebrate">
        <p className="empty">这一课没有题目。</p>
        <div className="footer">
          <button className="btn" onClick={() => nav("/")}>
            返回
          </button>
        </div>
      </div>
    );
  }

  const showAudio = item.audioBeforeAnswer || revealed;

  return (
    <div className="lesson">
      <div className="lesson-top">
        <button className="quit" aria-label="退出" onClick={() => nav("/")}>
          ✕
        </button>
        <div className="progress">
          <span style={{ width: `${pct}%` }} />
        </div>
        {comboFlash && combo >= 3 ? (
          <span className="combo" key={combo}>
            <FlameIcon size={16} />
            {combo}
          </span>
        ) : null}
      </div>

      <div className="q-type">{TYPE_LABEL[item.type]}</div>

      <div className="prompt-row">
        {showAudio && word ? <SpeakButton text={word.display} lang={lang} rate={rate} /> : null}
        <div className={`prompt ${item.type === "zh_to_en" ? "zh" : ""}`}>
          {item.type === "cloze"
            ? item.prompt.split("").map((ch, i) =>
                ch === "_" ? (
                  <span className="blank" key={i}>
                    _
                  </span>
                ) : (
                  <span key={i}>{ch}</span>
                ),
              )
            : item.prompt}
        </div>
      </div>

      {item.options.map((opt, i) => {
        let cls = "option";
        if (revealed && i === item.answerIndex) cls += " ok";
        else if (revealed && picked === i) cls += " bad shake";
        else if (!revealed && picked === i) cls += " picked";
        return (
          <button
            key={`${opt}-${i}`}
            className={cls}
            disabled={revealed}
            onClick={() => setPicked(i)}
          >
            {opt}
          </button>
        );
      })}

      {!revealed ? (
        <div className="footer">
          <button className="btn" disabled={picked === null} onClick={() => void check()}>
            检查
          </button>
        </div>
      ) : (
        <div className={`sheet ${item.correct ? "ok" : "bad"}`}>
          <div className="sheet-head">
            <span className="badge">{item.correct ? <CheckIcon /> : <CrossIcon />}</span>
            <h2>{praise?.title ?? (item.correct ? "答对了！" : "再记一次")}</h2>
            {item.correct ? <span className="xp-pop">+{item.isRetry ? 5 : 10} XP</span> : null}
          </div>
          {praise?.note ? <p className="praise-note">{praise.note}</p> : null}
          <div className="answer">
            {word?.display} · {word?.meaningZh}
            {word?.examples[0] ? (
              <small>
                {word.examples[0].en} {word.examples[0].zh}
              </small>
            ) : null}
          </div>
          <div className="actions">
            {word ? <SpeakButton text={word.display} lang={lang} rate={rate} /> : null}
            {word ? (
              <FollowButton word={word.display} lang={lang} rate={rate} onResult={setFollowMsg} />
            ) : null}
            {followMsg ? <span className="hint">{followMsg}</span> : null}
          </div>
          <button className={`btn${item.correct ? "" : " red"}`} onClick={() => void cont()}>
            继续
          </button>
        </div>
      )}
    </div>
  );
}
