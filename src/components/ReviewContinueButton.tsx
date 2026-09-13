import { useEffect, useRef, useState } from "react";

const REVIEW_DELAY_MS = 5_000;

/** Mount a new button for each revealed answer, including a resumed result. */
export function ReviewContinueButton({ className, onContinue }: {
  className: string;
  onContinue: () => Promise<void>;
}) {
  const [secondsLeft, setSecondsLeft] = useState(5);
  const [busy, setBusy] = useState(false);
  const readyAt = useRef<number | null>(null);
  const advancing = useRef(false);

  useEffect(() => {
    readyAt.current = performance.now() + REVIEW_DELAY_MS;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((readyAt.current! - performance.now()) / 1_000));
      setSecondsLeft(remaining);
      if (remaining === 0) window.clearInterval(timer);
    }, 100);
    return () => window.clearInterval(timer);
  }, []);

  async function advance() {
    if (readyAt.current === null || performance.now() < readyAt.current || advancing.current) return;
    advancing.current = true;
    setBusy(true);
    try {
      await onContinue();
    } finally {
      advancing.current = false;
      setBusy(false);
    }
  }

  return (
    <button className={className} disabled={secondsLeft > 0 || busy} onClick={() => void advance()}>
      {secondsLeft > 0 ? `继续（${secondsLeft}秒）` : busy ? "继续…" : "继续"}
    </button>
  );
}
