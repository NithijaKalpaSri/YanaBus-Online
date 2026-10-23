// Crowd level shown with a colour AND a word, so it never relies on colour alone
export function CrowdBadge({ level, label }) {
  if (!level) return null
  return (
    <span className={`badge ${level}`}>
      <i />
      {label}
    </span>
  )
}

export const seatText = (count, seats = 50) =>
  count > seats ? `${count} on board (${count - seats} standing)` : `${count} of ${seats} seats taken`

export function Meter({ count, seats = 50, level }) {
  return (
    <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={seats} aria-valuenow={count}>
      <div className={level} style={{ width: `${Math.min(100, (count / seats) * 100)}%` }} />
    </div>
  )
}
