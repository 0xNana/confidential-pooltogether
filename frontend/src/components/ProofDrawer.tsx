import { useEffect, useRef } from "react"
import { Check, Circle, ExternalLink, ShieldCheck, X } from "lucide-react"
import type { PoolState } from "../hooks/useConfidentialPoolTogether"
import { DEPLOYMENT_TX, POOL_ADDRESS } from "../lib/contracts"

type ProofDrawerProps = {
  open: boolean
  onClose: () => void
  poolState: PoolState
}

export function ProofDrawer({ open, onClose, poolState }: ProofDrawerProps) {
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
    { title: "Contract deployed", detail: `Verified Sepolia bytecode at block ${poolState.deploymentBlock?.toLocaleString() ?? "—"}`, complete: true },
    { title: "Encrypted snapshot sealed", detail: "Principal handles copied into draw-versioned encrypted weights", complete: poolState.phase >= 1 },
    { title: "Private threshold generated", detail: "Encrypted total multiplied by encrypted 64-bit randomness; no aggregate is revealed", complete: poolState.phase >= 1 },
    { title: "Weighted FHE selection complete", detail: "Prize-or-zero previews available without revealing the winner", complete: poolState.claimable },
  ]
  const completeCount = checks.filter((check) => check.complete).length

  return (
    <div className="drawer-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="proof-drawer" role="dialog" aria-modal="true" aria-labelledby="proof-title">
        <header className="drawer-header">
          <div><p className="eyebrow">Live verification record</p><h2 id="proof-title">Draw #{String(poolState.drawId).padStart(3, "0")}</h2></div>
          <button ref={closeRef} className="icon-button" type="button" onClick={onClose} aria-label="Close verification record" data-testid="close-proof"><X size={19} /></button>
        </header>

        <div className={`verification-seal ${poolState.claimable ? "complete" : "progress"}`}>
          <ShieldCheck size={25} />
          <div><strong>{poolState.claimable ? "Draw lifecycle complete" : `${poolState.phaseLabel} · live`}</strong><span>{completeCount} of {checks.length} public checks satisfied</span></div>
        </div>

        <dl className="proof-meta">
          <div><dt>Network</dt><dd>Ethereum Sepolia · 11155111</dd></div>
          <div><dt>Contract</dt><dd className="mono">{shortAddress(POOL_ADDRESS)}</dd></div>
          <div><dt>Participants</dt><dd>{poolState.participantCount}</dd></div>
          <div><dt>Selection primitive</dt><dd>Encrypted 128-bit threshold scan</dd></div>
          <div><dt>Audit status</dt><dd>Bounty deployment · unaudited</dd></div>
        </dl>

        <section className="proof-section" aria-labelledby="proof-checks-title">
          <div className="section-heading-line"><h3 id="proof-checks-title">Onchain lifecycle</h3><span>{completeCount} / {checks.length}</span></div>
          <ol className="proof-checks">
            {checks.map((check) => (
              <li key={check.title} className={check.complete ? "complete" : "pending"}>
                <span className="check-icon">{check.complete ? <Check size={14} /> : <Circle size={13} />}</span>
                <div><strong>{check.title}</strong><p>{check.detail}</p></div>
              </li>
            ))}
          </ol>
        </section>

        <div className="privacy-note"><strong>Deliberate disclosure boundary</strong><p>Deposits, balances, aggregate pool size, snapshot weights, winner identity, and prize amounts stay encrypted. Transaction timing, draw phase, schedule, participant count, and selection progress remain public.</p></div>

        <div className="drawer-links">
          <a className="button button-outline" href={`https://sepolia.etherscan.io/address/${POOL_ADDRESS}#code`} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Verified source</a>
          <a className="button button-ink" href={`https://sepolia.etherscan.io/tx/${DEPLOYMENT_TX}`} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Deployment tx</a>
        </div>
      </aside>
    </div>
  )
}

function shortAddress(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`
}
