import { CalendarClock, CheckCircle2, CircleDot, LockKeyhole, Users } from "lucide-react"
import { useEffect, useState } from "react"
import type { PoolState } from "../hooks/useConfidentialPoolTogether"

export function DrawStatus({ poolState, loading }: { poolState: PoolState; loading: boolean }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  const selectionProgress = poolState.participantCount > 0
    ? Math.min(100, (poolState.scanCursor / poolState.participantCount) * 100)
    : 0

  useEffect(() => {
    if (poolState.phase === 1) return
    const interval = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1_000)
    return () => window.clearInterval(interval)
  }, [poolState.claimClosesAt, poolState.drawClosesAt, poolState.phase])

  const scheduleLabel = poolState.phase === 0 ? "Draw closes in" : poolState.phase === 2 ? "Claims close in" : "Draw schedule"
  const scheduleValue = poolState.phase === 0
    ? formatCountdown(poolState.drawClosesAt - now)
    : poolState.phase === 2
      ? formatCountdown(poolState.claimClosesAt - now, "Closed")
      : "Lifecycle active"

  return (
    <section className="draw-console" aria-label="Live draw state" data-testid="live-draw">
      <div className="draw-console-id">
        <span className={`phase-light phase-${poolState.phase}`} />
        <div><small>Onchain draw</small><strong>{loading ? "Syncing" : `#${String(poolState.drawId).padStart(3, "0")}`}</strong></div>
      </div>
      <div className="draw-console-phase">
        <span><CircleDot size={14} /> Contract phase</span>
        <strong>{loading ? "Reading Sepolia" : poolState.phaseLabel}</strong>
        {poolState.phase === 1 && <div className="selection-meter"><i style={{ width: `${selectionProgress}%` }} /><small>{poolState.scanCursor} / {poolState.participantCount} accounts scanned</small></div>}
      </div>
      <div className="draw-console-metric"><Users size={17} /><span><small>Participants</small><strong>{loading ? "—" : poolState.participantCount}</strong></span></div>
      <div className="draw-console-metric"><CalendarClock size={17} /><span><small>{scheduleLabel}</small><strong>{loading ? "—" : scheduleValue}</strong></span></div>
      <div className="draw-console-metric snapshot"><LockKeyhole size={17} /><span><small>Pool size</small><strong>Encrypted</strong></span></div>
      <div className={`claim-status ${poolState.claimable ? "ready" : "waiting"}`}><CheckCircle2 size={16} /><span>{poolState.claimable ? "Claims open" : poolState.phase === 2 ? "Window closed" : "Prize sealed"}</span></div>
    </section>
  )
}

function formatCountdown(seconds: number, expiredLabel = "Ready to close") {
  if (seconds <= 0) return expiredLabel
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  return `${hours}h ${minutes}m`
}
