import { careLabel } from "../lib/reward-care";

export function FoodBowlIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M6 10a3 3 0 0 1 5-2 3.5 3.5 0 0 1 7 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M3 11h18l-2.3 7.2a2 2 0 0 1-1.9 1.4H7.2a2 2 0 0 1-1.9-1.4L3 11Z" fill="currentColor" />
    <path d="M9 15h6" stroke="white" strokeWidth="2" strokeLinecap="round" />
  </svg>;
}

/** Always paired with a five-step meter; status doesn't rely on color alone. */
export function RewardHunger({ fullness }: { fullness: number }) {
  const label = careLabel(fullness);
  return <span className={`reward-hunger ${fullness === 0 ? "is-empty" : fullness <= 2 ? "is-hungry" : fullness < 5 ? "is-peckish" : "is-full"}`} role="img" aria-label={label} title={label}>
    <FoodBowlIcon />
    <span className="reward-hunger-meter" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <i key={i} className={i < fullness ? "is-filled" : ""} />)}</span>
  </span>;
}
