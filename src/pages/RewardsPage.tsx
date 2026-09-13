import { liveQuery } from "dexie";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Confetti } from "../components/Confetti";
import { CrossIcon, GemIcon } from "../components/icons";
import { FoodBowlIcon, RewardHunger } from "../components/RewardHunger";
import { rewards } from "../data/rewards";
import { feedReward, getRewardState, redeemReward, type RewardState } from "../db/rewards";
import { db } from "../db/schema";
import { praiseReward, praiseRewardCollection } from "../lib/praise";
import { prepareRewardSound, setSoundEnabled } from "../lib/sfx";
import type { RewardDefinition } from "../lib/types";
import { careLabel, FEED_COST, isRewardOwned } from "../lib/reward-care";

const sortedRewards = [...rewards].sort((a, b) => a.cost - b.cost);

export function RewardsPage() {
  const [state, setState] = useState<RewardState | null>(null);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<RewardDefinition | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void getRewardState().then((next) => { if (active) { setState(next); setError(false); } })
        .catch(() => { if (active) setError(true); });
    };
    const subscription = liveQuery(() => Promise.all([db.prefs.toArray(), db.redemptions.toArray()]))
      .subscribe({ next: ([prefs]) => {
        setSoundEnabled(prefs[0]?.soundOn ?? true);
        refresh();
      }, error: () => { if (active) setError(true); } });
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { active = false; subscription.unsubscribe(); window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [reload]);
  const close = useCallback(() => setSelected(null), []);
  const records = new Map(state?.redemptions.map((r) => [r.rewardId, r]));

  return <main className="main rewards-page">
    <header className="rewards-heading">
      <h1>贴纸兑换</h1>
      <div className="reward-balance" role="status" aria-label={`当前可用积分 ${state?.available ?? "加载中"}`}>
        <GemIcon size={26} /><strong>{state ? state.available.toLocaleString() : "—"}</strong>
      </div>
    </header>
    {error && <div className="reward-error" role="alert">加载失败<button onClick={() => setReload((n) => n + 1)}>重试</button></div>}
    <div className="reward-grid">{sortedRewards.map((reward) => {
        const record = records.get(reward.id);
        const isOwned = !!record && isRewardOwned(record);
        const fullness = record?.care?.fullness ?? 5;
        const actionLabel = fullness < 5 ? "喂它" : "点击查看";
        return <button key={reward.id} className={`reward-card reward-tier-${reward.cost} ${isOwned ? "is-owned" : "is-locked"}`} onClick={() => setSelected(reward)} disabled={!state || error} aria-label={isOwned ? `${reward.name}，${careLabel(fullness)}，${actionLabel}` : `???，${reward.cost} 积分${record ? "，等待重新解锁" : ""}`}>
          <span className="reward-art"><img src={reward.image} alt="" className={isOwned ? "reward-living-image" : "reward-silhouette"} style={isOwned ? { "--fullness": fullness / 5 } as CSSProperties : undefined} /></span>
          <strong className="reward-name">{isOwned ? reward.name : "???"}</strong>
          <span className={`reward-card-action ${isOwned ? "collected" : ""}`}>
            {record && <RewardHunger fullness={fullness} />}
            {isOwned ? actionLabel : <><GemIcon size={19} />{reward.cost}</>}
          </span>
        </button>;
    })}</div>
    {selected && state && <RewardDialog key={selected.id} reward={selected} state={state} onState={setState} onClose={close} />}
  </main>;
}

function RewardDialog({ reward, state, onState, onClose }: { reward: RewardDefinition; state: RewardState; onState: (s: RewardState) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useRef(true);
  const pending = useRef(false);
  const stopSound = useRef<() => void>(() => {});
  const [busy, setBusy] = useState(false);
  const [imageStatus, setImageStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [imageAttempt, setImageAttempt] = useState(0);
  const [error, setError] = useState("");
  const [celebration, setCelebration] = useState<RewardState | null>(null);
  const [settled, setSettled] = useState(false);
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const record = state.redemptions.find((r) => r.rewardId === reward.id);
  const isOwned = !!record && isRewardOwned(record);
  const fullness = record?.care?.fullness ?? 5;
  const missing = Math.max(0, reward.cost - state.available);
  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const element = dialog.current;
    element?.showModal();
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media.matches);
    media.addEventListener("change", change);
    return () => {
      mounted.current = false;
      stopSound.current();
      media.removeEventListener("change", change);
      document.body.style.overflow = oldOverflow;
      element?.close();
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    let active = true;
    setImageStatus("loading");
    const image = new Image();
    image.onload = () => { void image.decode().then(() => { if (active) setImageStatus("ready"); }).catch(() => { if (active) setImageStatus("failed"); }); };
    image.onerror = () => { if (active) setImageStatus("failed"); };
    image.src = reward.image;
    return () => { active = false; image.onload = null; image.onerror = null; };
  }, [reward.image, imageAttempt]);
  useEffect(() => {
    if (!celebration) return;
    const timer = window.setTimeout(() => setSettled(true), 3000);
    return () => window.clearTimeout(timer);
  }, [celebration]);

  async function redeem() {
    if (pending.current || imageStatus !== "ready" || isOwned || missing) return;
    pending.current = true;
    setBusy(true);
    setError("");
    const play = prepareRewardSound();
    try {
      const result = await redeemReward(reward.id);
      if (!mounted.current) return;
      onState(result.state);
      if (result.status === "redeemed") {
        setCelebration(result.state);
        // A missing audio API must never hide a successful, committed redemption.
        try { stopSound.current = play(); } catch { /* Visual celebration remains available. */ }
      } else if (result.status === "insufficient") setError("积分不足");
    } catch {
      if (mounted.current) setError("未扣积分，请重试");
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function feed() {
    if (pending.current || !isOwned || fullness === 5 || state.available < FEED_COST) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await feedReward(reward.id);
      if (!mounted.current) return;
      onState(result.state);
      if (result.status === "insufficient") setError("积分不足");
    } catch {
      if (mounted.current) setError("未扣积分，请重试");
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const collectedIds = new Set(celebration?.redemptions.filter(isRewardOwned).map((r) => r.rewardId));
  const praise = praiseReward({ collected: rewards.filter((r) => collectedIds.has(r.id)).length, total: rewards.length, themeCollected: rewards.filter((r) => r.theme === reward.theme && collectedIds.has(r.id)).length, themeTotal: 4 });
  const still = settled || reduced;
  const collectionPraise = praiseRewardCollection();
  return <dialog ref={dialog} className={`reward-dialog ${celebration ? `reward-celebration ${still ? "is-settled" : "is-animating"}` : "reward-detail"}`} aria-labelledby="reward-dialog-title" aria-describedby={celebration ? undefined : "reward-detail-description"} onCancel={(event) => { event.preventDefault(); if (!pending.current) onClose(); }}>
    <button className="reward-close" aria-label="关闭" disabled={busy} onClick={onClose}><CrossIcon /></button>
    {celebration ? <>
      <div className="reward-celebration-bg" aria-hidden="true" />
      {!still && <div className="reward-confetti"><Confetti count={72} delay={1.4} durationScale={0.35} /></div>}
      <div className="reward-reveal-content">
        <h2 id="reward-dialog-title" aria-live="polite">{praise.title}</h2>
        <div className="reward-stage">
          <div className="reward-halo" aria-hidden="true" />
          <div className="reward-sparks" aria-hidden="true">{Array.from({ length: 16 }, (_, i) => <span key={i} style={{ "--angle": `${i * 22.5}deg`, "--spark-delay": `${i % 4 * 0.07}s` } as CSSProperties}>✦</span>)}</div>
          <img src={reward.image} alt={reward.name} className="reward-revealed-image" />
        </div>
        <h3>{reward.name}</h3>
        <div className="reward-reveal-actions"><button className="btn reward-primary" onClick={onClose}>收下</button>{!still && <button className="reward-skip" onClick={() => { dialog.current?.querySelector<HTMLButtonElement>(".reward-primary")?.focus(); setSettled(true); stopSound.current(); }}>跳过动画</button>}</div>
      </div>
    </> : <>
      <span className="reward-detail-label">{isOwned ? collectionPraise.title : "神秘贴纸"}</span>
      <div className="reward-detail-art"><img src={reward.image} className={isOwned ? "reward-living-image" : "reward-silhouette"} style={isOwned ? { "--fullness": fullness / 5 } as CSSProperties : undefined} alt={isOwned ? reward.name : "未兑换贴纸的剪影"} />{record && <RewardHunger fullness={fullness} />}</div>
      <h2 id="reward-dialog-title">{isOwned ? reward.name : "???"}</h2>
      {record && <p className="reward-care-status" role="status">{careLabel(fullness).replace("，", " · ")}</p>}
      <p className="reward-detail-description" id="reward-detail-description">{isOwned ? collectionPraise.note : record ? "重新解锁，小伙伴就会恢复满满活力。" : "兑换后，小伙伴就会露出它的模样！"}<span className="reward-care-help">每 {reward.hungerDays} 天消耗一格 · 喂一次恢复一格</span></p>
      {imageStatus === "failed" && <p role="alert" className="reward-error">加载失败<button onClick={() => setImageAttempt((n) => n + 1)}>重试</button></p>}
      {error && <p role="alert" className="reward-error">{error}</p>}
      {isOwned ? <button className="btn reward-primary" disabled={busy || fullness === 5 || state.available < FEED_COST} aria-label={fullness === 5 ? "吃饱啦" : state.available < FEED_COST ? "积分不足" : `用 ${FEED_COST} 积分喂一喂，恢复 20% 饱食度`} onClick={() => void feed()}>{busy ? "喂养中…" : fullness === 5 ? <><FoodBowlIcon />吃饱啦</> : state.available < FEED_COST ? "积分不足" : <><FoodBowlIcon /><span>喂一喂</span><GemIcon size={22} />{FEED_COST}</>}</button> : <button className="btn reward-primary" disabled={busy || imageStatus !== "ready" || missing > 0} aria-label={busy ? "兑换中" : imageStatus !== "ready" ? "加载中" : missing ? "积分不足" : `用 ${reward.cost} 积分${record ? "重新解锁" : "兑换"}`} onClick={() => void redeem()}>{busy ? "兑换中…" : imageStatus === "loading" ? "加载中…" : imageStatus === "failed" ? "请重试" : missing ? "积分不足" : <><GemIcon size={22} />{reward.cost}<span>{record ? "重新解锁" : "兑换"}</span></>}</button>}
    </>}
  </dialog>;
}
