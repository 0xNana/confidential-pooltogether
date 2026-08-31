import { ArrowUpRight, CheckCircle2, Globe2, Layers3, LockKeyhole } from "lucide-react"
import { useState } from "react"
import type { ConfidentialPoolTogetherModel } from "../hooks/useConfidentialPoolTogether"
import { PositionCard } from "./PositionCard"
import { PrizeCard } from "./PrizeCard"
import { HistoricalDraws } from "./HistoricalDraws"

type OverviewDashboardProps = Pick<
  ConfidentialPoolTogetherModel,
  "account" | "activeMarket" | "markets" | "selectMarket" | "correctChain" | "permitReady" | "principal" | "walletBalance" | "prize" | "prizeDrawId" | "poolState" | "isEntered" | "operation" | "connect" | "switchNetwork" | "authorizeReads" | "revealPosition" | "enterDraw" | "previewPrize" | "claimPrize" | "advanceSelection" | "sweepPrize" | "setHistoricalOffset"
> & { onNavigate: (view: "deposit" | "withdraw") => void }

type ChainFilter = "all" | "sepolia"

export function OverviewDashboard(props: OverviewDashboardProps) {
  const [filter, setFilter] = useState<ChainFilter>("all")
  const showSepolia = filter === "all" || filter === "sepolia"
  function openMarketDeposit(marketId: "cUSDT" | "cUSDC") {
    props.selectMarket(marketId)
    props.onNavigate("deposit")
  }

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
        <div className="overview-hero-prize">
          <PrizeCard {...props} />
        </div>
      </section>

      <HistoricalDraws {...props} />

      <section className="overview-catalog" aria-labelledby="vaults-title">
        <header className="overview-section-heading">
          <div><h2 id="vaults-title">Vaults</h2></div>
          <span className="overview-count"><Layers3 size={14} /> 2 live markets</span>
        </header>

        <div className="chain-filters" role="group" aria-label="Filter vaults by chain">
          <button type="button" className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}><Globe2 size={15} /> All chains</button>
          <button type="button" className={filter === "sepolia" ? "active" : ""} onClick={() => setFilter("sepolia")}><span className="chain-dot chain-dot-sepolia" /> Sepolia <small>Live</small></button>
          <button type="button" className="chain-filter-soon" disabled><span className="chain-dot chain-dot-ethereum" /> Ethereum <small>Soon</small></button>
        </div>

        <div className="vault-list" aria-label="Available vaults">
          {showSepolia && (
            <article className="vault-list-row vault-list-row-live">
              <div className="vault-list-name"><span className="vault-token-mark">c</span><div><strong>Confidential PoolTogether</strong><small>cUSDT prize vault</small></div></div>
              <div className="vault-list-detail"><small>Chain</small><strong><span className="chain-dot chain-dot-sepolia" /> Sepolia</strong></div>
              <div className="vault-list-detail"><small>Prize pool</small><strong><LockKeyhole size={13} /> Encrypted</strong></div>
              <div className="vault-list-status"><span><CheckCircle2 size={14} /> {props.activeMarket.id === "cUSDT" ? "Selected" : "Live"}</span><button type="button" onClick={() => openMarketDeposit("cUSDT")} data-testid="market-cusdt">Deposit <ArrowUpRight size={14} /></button></div>
            </article>
          )}
          {showSepolia && (
            <article className="vault-list-row vault-list-row-live">
              <div className="vault-list-name"><span className="vault-token-mark">c</span><div><strong>Confidential PoolTogether</strong><small>cUSDC prize vault</small></div></div>
              <div className="vault-list-detail"><small>Chain</small><strong><span className="chain-dot chain-dot-sepolia" /> Sepolia</strong></div>
              <div className="vault-list-detail"><small>Prize pool</small><strong><LockKeyhole size={13} /> Encrypted</strong></div>
              <div className="vault-list-status"><span><CheckCircle2 size={14} /> {props.activeMarket.id === "cUSDC" ? "Selected" : "Live"}</span><button type="button" onClick={() => openMarketDeposit("cUSDC")} data-testid="market-cusdc">Deposit <ArrowUpRight size={14} /></button></div>
            </article>
          )}
        </div>
      </section>

    </div>
  )
}
