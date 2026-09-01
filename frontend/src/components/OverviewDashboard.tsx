import type { ConfidentialPoolTogetherModel } from "../hooks/useConfidentialPoolTogether"
import { PositionCard } from "./PositionCard"

type OverviewDashboardProps = Pick<
  ConfidentialPoolTogetherModel,
  "account" | "activeMarket" | "correctChain" | "permitReady" | "principal" | "walletBalance" | "poolState" | "isEntered" | "operation" | "connect" | "switchNetwork" | "authorizeReads" | "revealPosition"
> & { onNavigate: (view: "deposit") => void }

export function OverviewDashboard(props: OverviewDashboardProps) {
  return (
    <div className="overview-dashboard">
      <section className="overview-banner" aria-labelledby="overview-title">
        <div className="overview-hero-main">
          <div className="overview-banner-copy">
            <p className="eyebrow">Powered by Zama FHEVM</p>
            <h1 id="overview-title">Save privately.<br /><em>Win onchain.</em></h1>
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
