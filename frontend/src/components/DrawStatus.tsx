import { CalendarClock, CheckCircle2, CircleDot, LoaderCircle, LockKeyhole, ScanLine, Users, Wallet } from "lucide-react"
import { useEffect, useState } from "react"
import type { ConfidentialPoolTogetherModel } from "../hooks/useConfidentialPoolTogether"
import { deriveDrawLifecycle } from "../lib/draw-lifecycle"

type DrawStatusProps = Pick<
  ConfidentialPoolTogetherModel,
  "account" | "correctChain" | "poolState" | "loading" | "readError" | "operation" | "connect" | "switchNetwork" | "advanceDraw"
>

export function DrawStatus(props: DrawStatusProps) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  const { poolState } = props

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
  const lifecycle = deriveDrawLifecycle(poolState, now)
  const lifecycleBusy = props.operation.kind === "lifecycle" && ["signature", "pending"].includes(props.operation.stage)
  const actionLabel = !lifecycle.ready
    ? lifecycle.label
    : !props.account
      ? "Connect wallet"
      : !props.correctChain
        ? "Switch to Sepolia"
        : lifecycleBusy
          ? props.operation.stage === "pending" ? "Confirming…" : "Check wallet…"
          : lifecycle.label
  const action = !props.account ? props.connect : !props.correctChain ? props.switchNetwork : props.advanceDraw
  const selectionPercent = lifecycle.kind === "continue" && lifecycle.total
    ? Math.round((lifecycle.completed ?? 0) / lifecycle.total * 100)
    : 0

  return (
    <section
      className="draw-console"
      aria-label="Live draw state"
      data-testid="live-draw"
      data-state={props.loading ? "loading" : props.readError ? "error" : "ready"}
    >
      <div className="draw-console-metric draw-state"><CircleDot size={17} /><span><small>Draw #{props.loading ? "-" : poolState.drawId}</small><strong>{props.loading ? "Syncing" : poolState.phaseLabel}</strong></span></div>
      <div className="draw-console-metric"><Users size={17} /><span><small>Participants</small><strong>{props.loading ? "-" : poolState.participantCount}</strong></span></div>
      <div className="draw-console-metric"><CalendarClock size={17} /><span><small>{scheduleLabel}</small><strong>{props.loading ? "-" : scheduleValue}</strong></span></div>
      <div className="draw-console-metric snapshot"><LockKeyhole size={17} /><span><small>Prize pool</small><strong>Encrypted</strong></span></div>
      <div className={`claim-status ${poolState.claimable ? "ready" : "waiting"}`}><CheckCircle2 size={16} /><span>{poolState.claimable ? "Claims open" : poolState.phase === 2 ? "Window closed" : "Prize sealed"}</span></div>
      <div className="lifecycle-control">
        <span className="lifecycle-icon">{lifecycle.kind === "continue" ? <ScanLine size={18} /> : lifecycleBusy ? <LoaderCircle className="spin" size={18} /> : <Wallet size={18} />}</span>
        <div className="lifecycle-copy">
          <small>Permissionless draw action</small>
          <strong>{lifecycle.label}</strong>
          <p>{lifecycle.reason}</p>
          {lifecycle.kind === "continue" && (
            <div className="selection-progress" aria-label={`${lifecycle.completed} of ${lifecycle.total} selection accounts processed`}>
              <i style={{ width: `${selectionPercent}%` }} />
              <span>{lifecycle.completed}/{lifecycle.total} processed, {lifecycle.remaining} remaining</span>
            </div>
          )}
        </div>
        <button className="button button-ink" type="button" onClick={() => void action()} disabled={props.loading || !lifecycle.ready || lifecycleBusy} data-testid="draw-lifecycle-action">
          {lifecycleBusy && <LoaderCircle className="spin" size={15} />}{actionLabel}
        </button>
      </div>
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
