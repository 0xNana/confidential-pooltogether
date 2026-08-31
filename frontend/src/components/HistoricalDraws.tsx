import { ArrowLeft, ArrowRight, Gift, ScanLine, Waves } from "lucide-react"
import type { ConfidentialPoolTogetherModel } from "../hooks/useConfidentialPoolTogether"

type HistoricalDrawsProps = Pick<
  ConfidentialPoolTogetherModel,
  "account" | "poolState" | "prize" | "prizeDrawId" | "operation" | "previewPrize" | "claimPrize" | "advanceSelection" | "sweepPrize" | "setHistoricalOffset"
>

const PAGE_SIZE = 32

export function HistoricalDraws(props: HistoricalDrawsProps) {
  const { poolState } = props
  if (poolState.actionableDrawCount === 0) return null
  const busy = props.operation.kind === "lifecycle" || props.operation.kind === "preview" || props.operation.kind === "claim"
  const hasPrevious = poolState.historicalOffset > 0
  const hasNext = poolState.historicalOffset + poolState.historicalDraws.length < poolState.actionableDrawCount

  return (
    <section className="historical-draws ruled-panel" aria-labelledby="historical-draws-title">
      <header className="panel-titlebar">
        <div><p className="eyebrow">Independent lifecycle</p><h2 id="historical-draws-title">Historical draw actions</h2></div>
        <span>{poolState.actionableDrawCount} unswept</span>
      </header>
      <div className="historical-draw-list">
        {poolState.historicalDraws.map((draw) => (
          <article key={draw.drawId} className="historical-draw-row">
            <div><strong>Draw #{draw.drawId}</strong><small>{draw.statusLabel} · {draw.scanCursor}/{draw.participantCount} scanned</small></div>
            <div className="historical-draw-action">
              {draw.status === 1 && (
                <button className="button button-outline" type="button" disabled={busy} onClick={() => void props.advanceSelection(draw.drawId)}><ScanLine size={14} /> Advance</button>
              )}
              {draw.status === 2 && draw.claimable && draw.isEntered && props.prizeDrawId !== draw.drawId && (
                <button className="button button-outline" type="button" disabled={busy || !props.account} onClick={() => void props.previewPrize(draw.drawId)}><Gift size={14} /> Private result</button>
              )}
              {draw.status === 2 && draw.claimable && draw.isEntered && props.prizeDrawId === draw.drawId && props.prize !== undefined && props.prize > 0n && (
                <button className="button button-accent" type="button" disabled={busy} onClick={() => void props.claimPrize(draw.drawId)}>Claim</button>
              )}
              {draw.status === 2 && draw.claimable && draw.isEntered && props.prizeDrawId === draw.drawId && props.prize === 0n && <small>No prize</small>}
              {draw.status === 2 && draw.claimable && !draw.isEntered && <small>Not entered</small>}
              {draw.status === 3 && (
                <button className="button button-outline" type="button" disabled={busy} onClick={() => void props.sweepPrize(draw.drawId)}><Waves size={14} /> Sweep expired prize</button>
              )}
            </div>
          </article>
        ))}
      </div>
      {(hasPrevious || hasNext) && (
        <nav className="historical-pagination" aria-label="Historical draw pages">
          <button type="button" disabled={!hasPrevious} onClick={() => props.setHistoricalOffset(Math.max(0, poolState.historicalOffset - PAGE_SIZE))}><ArrowLeft size={14} /> Previous page</button>
          <span>{poolState.historicalOffset + 1}–{poolState.historicalOffset + poolState.historicalDraws.length} of {poolState.actionableDrawCount}</span>
          <button type="button" disabled={!hasNext} onClick={() => props.setHistoricalOffset(poolState.historicalOffset + PAGE_SIZE)}>Next page <ArrowRight size={14} /></button>
        </nav>
      )}
    </section>
  )
}
