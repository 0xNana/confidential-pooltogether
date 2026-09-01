import { useEffect, useState } from "react"
import { ArrowRight, Wallet } from "lucide-react"
import type { ConfidentialPoolTogetherModel } from "../hooks/useConfidentialPoolTogether"
import { PositionCard } from "./PositionCard"

type OverviewDashboardProps = Pick<
  ConfidentialPoolTogetherModel,
  "account" | "activeMarket" | "correctChain" | "permitReady" | "principal" | "walletBalance" | "poolState" | "isEntered" | "operation" | "connect" | "switchNetwork" | "authorizeReads" | "revealPosition"
> & { onNavigate: (view: "deposit") => void }

export function OverviewDashboard(props: OverviewDashboardProps) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  const { currentDraw } = props.poolState

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1_000)
    return () => window.clearInterval(interval)
  }, [])

  const lastDraw = props.poolState.historicalDraws[0]
  return (
    <div className="overview-dashboard">
      <section className="overview-banner" aria-labelledby="overview-title">
        <div className="overview-hero-main">
          <div className="overview-hero-top">
            <div className="overview-banner-copy">
              <p className="eyebrow">Powered by Zama FHEVM</p>
              <h1 id="overview-title">Save privately.<br /><em>Win onchain.</em></h1>
            </div>
            <section className="overview-next-draw" aria-labelledby="next-draw-title" data-testid="overview-next-draw">
              <header>
                <div><p className="eyebrow">Next draw</p><h2 id="next-draw-title">Draw #{currentDraw.drawId || "—"}</h2></div>
                <span className="next-draw-market">{props.activeMarket.tokenSymbol}</span>
              </header>
              <div className="next-draw-stats">
                <div><strong>{formatCountdown(currentDraw.scheduledClose - now)}</strong><small>Entry closes in</small></div>
                <div><strong>Encrypted</strong><small>Prize pool</small></div>
              </div>
              <p className="next-draw-last">Last draw: {lastDraw ? `Draw #${lastDraw.drawId} settled privately` : "No previous draw"}</p>
              {!props.account && currentDraw.status === 0 && <button className="button button-accent" type="button" onClick={() => void props.connect()} data-testid="overview-connect-draw"><Wallet size={15} /> Connect wallet to enter the draw <ArrowRight size={15} /></button>}
            </section>
          </div>
          <ol className="overview-demo-path" aria-label="Walkthrough path">
            <li><span>01</span><strong>Fund</strong><small>Get test tokens</small></li>
            <li><span>02</span><strong>Shield</strong><small>Encrypt the balance</small></li>
            <li><span>03</span><strong>Deposit</strong><small>Enter the draw</small></li>
            <li><span>04</span><strong>Reveal</strong><small>Decrypt locally</small></li>
          </ol>
          <PositionCard {...props} />
        </div>
      </section>
    </div>
  )
}

function formatCountdown(seconds: number) {
  if (seconds <= 0) return "Ready"
  const hours = Math.floor(seconds / 3_600).toString().padStart(2, "0")
  const minutes = Math.floor((seconds % 3_600) / 60).toString().padStart(2, "0")
  const remaining = Math.floor(seconds % 60).toString().padStart(2, "0")
  return `${hours}:${minutes}:${remaining}`
}
