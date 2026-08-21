import { useEffect, useRef } from "react"
import { Check, Circle, ExternalLink, ShieldCheck, X } from "lucide-react"
import type { PoolState } from "../hooks/useConfidentialPoolTogether"
import type { MarketConfig } from "../lib/contracts"

type ProofDrawerProps = {
  open: boolean
  onClose: () => void
  poolState: PoolState
  market: MarketConfig
}

export function ProofDrawer({ open, onClose, poolState, market }: ProofDrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) closeRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && onClose()
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const checks = [
    { title: "Vault is live", detail: `The confidential prize vault is running on Sepolia${poolState.deploymentBlock ? ` from block ${poolState.deploymentBlock.toLocaleString()}` : ""}.`, complete: true },
    { title: "Entries are locked in", detail: "Deposits are included in the draw without exposing anyone's amount.", complete: poolState.phase >= 1 },
    { title: "Winner selection is private", detail: "The draw uses encrypted balances and keeps the winner hidden.", complete: poolState.phase >= 1 },
    { title: "Prize results are ready", detail: "Participants can check their private result without revealing anyone else's.", complete: poolState.claimable },
  ]
  const completeCount = checks.filter((check) => check.complete).length

  return (
    <div className="drawer-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="proof-drawer" role="dialog" aria-modal="true" aria-labelledby="proof-title">
        <header className="drawer-header">
          <div><p className="eyebrow">Draw details</p><h2 id="proof-title">Draw #{String(poolState.drawId).padStart(3, "0")}</h2></div>
          <button ref={closeRef} className="icon-button" type="button" onClick={onClose} aria-label="Close verification record" data-testid="close-proof"><X size={19} /></button>
        </header>

        <div className={`verification-seal ${poolState.claimable ? "complete" : "progress"}`}>
          <ShieldCheck size={25} />
          <div><strong>{poolState.claimable ? "Draw complete" : "Draw in progress"}</strong><span>{completeCount} of {checks.length} steps complete</span></div>
        </div>

        <dl className="proof-meta">
          <div><dt>Network</dt><dd>Ethereum Sepolia</dd></div>
          <div><dt>Vault address</dt><dd className="mono">{shortAddress(market.poolAddress)}</dd></div>
          <div><dt>Entries</dt><dd>{poolState.participantCount}</dd></div>
          <div><dt>Security</dt><dd>Testnet · not audited</dd></div>
        </dl>

        <section className="proof-section" aria-labelledby="proof-checks-title">
          <div className="section-heading-line"><h3 id="proof-checks-title">Draw progress</h3><span>{completeCount} / {checks.length}</span></div>
          <ol className="proof-checks">
            {checks.map((check) => (
              <li key={check.title} className={check.complete ? "complete" : "pending"}>
                <span className="check-icon">{check.complete ? <Check size={14} /> : <Circle size={13} />}</span>
                <div><strong>{check.title}</strong><p>{check.detail}</p></div>
              </li>
            ))}
          </ol>
        </section>

        <div className="privacy-note"><strong>What stays private</strong><p>Your deposit, balance, odds, winner status, and prize amount stay private. Anyone can verify the draw timing and progress, but no one can see your financial details.</p></div>

        <div className="drawer-links">
          <a className="button button-outline" href={`https://sepolia.etherscan.io/address/${market.poolAddress}#code`} target="_blank" rel="noreferrer"><ExternalLink size={15} /> View contract</a>
          <a className="button button-ink" href={`https://sepolia.etherscan.io/tx/${market.deploymentTx}`} target="_blank" rel="noreferrer"><ExternalLink size={15} /> View transaction</a>
        </div>
      </aside>
    </div>
  )
}

function shortAddress(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`
}
