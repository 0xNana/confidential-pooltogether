import { useState } from "react"
import { Activity, ArrowLeft, ExternalLink, FileCheck2, Github, LayoutDashboard, WalletCards, Zap } from "lucide-react"
import { ActivityFeed } from "../components/ActivityFeed"
import { BrandMark } from "../components/BrandMark"
import { DrawStatus } from "../components/DrawStatus"
import { OperationToast } from "../components/OperationToast"
import { PositionCard } from "../components/PositionCard"
import { PrizeCard } from "../components/PrizeCard"
import { ProofDrawer } from "../components/ProofDrawer"
import { VaultAction } from "../components/VaultAction"
import { WalletControl } from "../components/WalletControl"
import { useConfidentialPoolTogether } from "../hooks/useConfidentialPoolTogether"
import { POOL_ADDRESS } from "../lib/contracts"

export default function VaultApp() {
  const model = useConfidentialPoolTogether()
  const [proofOpen, setProofOpen] = useState(false)
  const [activeView, setActiveView] = useState<"overview" | "manage" | "activity">("overview")

  const viewCopy = {
    overview: { eyebrow: "Private pool workspace", title: "Your vault", description: "Account and draw overview." },
    manage: { eyebrow: "Position controls", title: "Manage position", description: "Deposit or withdraw through encrypted actions." },
    activity: { eyebrow: "Public contract record", title: "Activity", description: "Contract events without private amounts." },
  }[activeView]

  return (
    <div className="app-shell vault-shell">
      <a className="skip-link" href="#workspace">Skip to vault workspace</a>

      <header className="site-header vault-header">
        <a className="brand" href="/" aria-label="Confidential PoolTogether home">
          <BrandMark />
          <span><strong>Confidential PoolTogether</strong><small>Confidential prize savings</small></span>
        </a>
        <nav className="main-nav vault-nav" aria-label="Vault navigation">
          <a href="/"><ArrowLeft size={14} /> Protocol</a>
          <button type="button" onClick={() => setProofOpen(true)} data-testid="open-proof"><FileCheck2 size={14} /> Verify draw</button>
        </nav>
        <div className="vault-header-actions">
          <button className="icon-button vault-mobile-proof" type="button" onClick={() => setProofOpen(true)} aria-label="Open verification record"><FileCheck2 size={16} /></button>
          <WalletControl {...model} />
        </div>
      </header>

      <div className="vault-shell-layout">
        <aside className="vault-sidebar" aria-label="Vault sections">
          <div className="sidebar-heading"><p className="eyebrow">Vault sections</p><strong>Workspace</strong></div>
          <nav className="sidebar-nav">
            <button type="button" className={activeView === "overview" ? "active" : ""} onClick={() => setActiveView("overview")} aria-current={activeView === "overview" ? "page" : undefined} data-testid="shell-overview"><LayoutDashboard size={16} /><span>Overview</span><small>Account and draw</small></button>
            <button type="button" className={activeView === "manage" ? "active" : ""} onClick={() => setActiveView("manage")} aria-current={activeView === "manage" ? "page" : undefined} data-testid="shell-manage"><WalletCards size={16} /><span>Manage position</span><small>Deposit or withdraw</small></button>
            <button type="button" className={activeView === "activity" ? "active" : ""} onClick={() => setActiveView("activity")} aria-current={activeView === "activity" ? "page" : undefined} data-testid="shell-activity"><Activity size={16} /><span>Activity</span><small>Public contract events</small></button>
          </nav>
          <div className="sidebar-faucet">
            <div><Zap size={15} /><span><strong>Sepolia cUSDT</strong><small>Official testnet faucet</small></span></div>
            <button className="text-button" type="button" onClick={() => void model.fundTestnet()} disabled={model.operation.kind === "fund" && ["signature", "pending"].includes(model.operation.stage)} data-testid="shell-faucet">Get 1,000 cUSDT <span aria-hidden="true">↗</span></button>
          </div>
          <div className="sidebar-footnote"><span className="sidebar-dot" /> <span>Sepolia pool<br />Live contract state</span></div>
        </aside>

        <main className="vault-main">
          {model.readError && <div className="read-error" role="alert"><strong>Sepolia read degraded.</strong><span>{model.readError}</span><button type="button" onClick={() => void model.refresh()}>Retry</button></div>}

          {activeView !== "overview" && <DrawStatus poolState={model.poolState} loading={model.loading} />}

          <div className="workspace-heading">
            <div>
              <p className="eyebrow">{viewCopy.eyebrow}</p>
              <h1>{viewCopy.title}</h1>
            </div>
            <p>{viewCopy.description}</p>
          </div>

          {activeView === "overview" && (
            <section className="workspace" id="workspace" aria-label="Vault overview">
              <div className="workspace-main"><PositionCard {...model} /></div>
              <aside className="workspace-rail"><PrizeCard {...model} /></aside>
            </section>
          )}

          {activeView === "manage" && (
            <section className="focused-view" id="workspace" aria-label="Manage vault position">
              <VaultAction {...model} />
              <PositionCard {...model} />
            </section>
          )}

          {activeView === "activity" && (
            <section className="focused-view activity-view" id="workspace" aria-label="Vault activity">
              <ActivityFeed activity={model.activity} loading={model.loading} />
            </section>
          )}
        </main>
      </div>

      <footer className="site-footer vault-footer">
        <a className="brand footer-brand" href="/"><BrandMark /><span><strong>Confidential PoolTogether</strong><small>Save quietly. Win verifiably.</small></span></a>
        <div className="footer-links">
          <a href={`https://sepolia.etherscan.io/address/${POOL_ADDRESS}`} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Etherscan</a>
          <a href="https://github.com/zama-ai/fhevm" target="_blank" rel="noreferrer"><Github size={13} /> FHEVM</a>
        </div>
      </footer>

      <ProofDrawer open={proofOpen} onClose={() => setProofOpen(false)} poolState={model.poolState} />
      <OperationToast operation={model.operation} onClose={model.clearOperation} />
    </div>
  )
}
