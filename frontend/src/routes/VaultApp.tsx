import { useEffect, useState } from "react"
import { Activity, ArrowDownToLine, ArrowLeft, ArrowUpRight, ExternalLink, FileCheck2, Github, LayoutDashboard, Send, Shield, ShieldOff, Trophy, Zap } from "lucide-react"
import { ActivityFeed } from "../components/ActivityFeed"
import { BrandMark } from "../components/BrandMark"
import { DepositAction } from "../components/DepositAction"
import { DrawsView } from "../components/DrawsView"
import { EarnView } from "../components/EarnView"
import { OperationToast } from "../components/OperationToast"
import { OverviewDashboard } from "../components/OverviewDashboard"
import { ProofDrawer } from "../components/ProofDrawer"
import { SendAction } from "../components/SendAction"
import { TokenAction } from "../components/TokenAction"
import { VaultAction } from "../components/VaultAction"
import { WalletControl } from "../components/WalletControl"
import { useConfidentialPoolTogether } from "../hooks/useConfidentialPoolTogether"

export default function VaultApp() {
  const model = useConfidentialPoolTogether()
  const [proofOpen, setProofOpen] = useState(false)
  const [activeView, setActiveView] = useState<"overview" | "draws" | "deposit" | "withdraw" | "shield" | "unshield" | "send" | "earn" | "activity">("overview")

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" })
  }, [activeView])

  const viewCopy = {
    overview: { title: "Your vault" },
    draws: { title: "Draws" },
    deposit: { title: "Deposit" },
    withdraw: { title: "Withdraw" },
    shield: { title: "Shield" },
    unshield: { title: "Unshield" },
    send: { title: "Send" },
    earn: { title: "Earn" },
    activity: { title: "Activity" },
  }[activeView]
  return (
    <div className="app-shell vault-shell">
      <a className="skip-link" href="#workspace">Skip to vault workspace</a>

      <header className="site-header vault-header">
        <a className="brand" href="/" aria-label="Confidential PoolTogether home">
          <BrandMark />
          <span><strong>Confidential PoolTogether</strong><small>Built on Zama FHEVM</small></span>
        </a>
        <nav className="main-nav vault-nav" aria-label="Vault navigation">
          <a href="/"><ArrowLeft size={14} /> Protocol</a>
          <button type="button" onClick={() => setProofOpen(true)} data-testid="open-proof"><FileCheck2 size={14} /> Verify draw</button>
        </nav>
        <div className="vault-header-actions">
          <button className="icon-button vault-mobile-proof" type="button" onClick={() => setProofOpen(true)} aria-label="Open verification record"><FileCheck2 size={16} /></button>
          <button className="header-faucet" type="button" onClick={() => void model.fundTestnet()} disabled={model.operation.kind === "fund" && ["signature", "pending"].includes(model.operation.stage)} data-testid="shell-faucet" title={`Get Sepolia test ${model.activeMarket.tokenSymbol}`}><Zap size={15} /><span>Get test {model.activeMarket.tokenSymbol}</span></button>
          <WalletControl {...model} />
        </div>
      </header>

      <div className="vault-shell-layout">
        <aside className="vault-sidebar" aria-label="Vault navigation">
          <nav className="sidebar-nav">
            <button type="button" className={activeView === "overview" ? "active" : ""} onClick={() => setActiveView("overview")} aria-current={activeView === "overview" ? "page" : undefined} data-testid="shell-overview"><LayoutDashboard size={16} /><span>Overview</span></button>
            <button type="button" className={activeView === "deposit" ? "active" : ""} onClick={() => setActiveView("deposit")} aria-current={activeView === "deposit" ? "page" : undefined} data-testid="shell-deposit"><ArrowDownToLine size={16} /><span>Deposit</span></button>
            <button type="button" className={activeView === "draws" ? "active" : ""} onClick={() => setActiveView("draws")} aria-current={activeView === "draws" ? "page" : undefined} data-testid="shell-draws"><Trophy size={16} /><span>Draws</span></button>
            <button type="button" className={activeView === "withdraw" ? "active" : ""} onClick={() => setActiveView("withdraw")} aria-current={activeView === "withdraw" ? "page" : undefined} data-testid="shell-withdraw"><ArrowUpRight size={16} /><span>Withdraw</span></button>
            <button type="button" className={activeView === "shield" ? "active" : ""} onClick={() => setActiveView("shield")} aria-current={activeView === "shield" ? "page" : undefined} data-testid="shell-shield"><Shield size={16} /><span>Shield</span></button>
            <button type="button" className={activeView === "unshield" ? "active" : ""} onClick={() => setActiveView("unshield")} aria-current={activeView === "unshield" ? "page" : undefined} data-testid="shell-unshield"><ShieldOff size={16} /><span>Unshield</span></button>
            <button type="button" className={activeView === "send" ? "active" : ""} onClick={() => setActiveView("send")} aria-current={activeView === "send" ? "page" : undefined} data-testid="shell-send"><Send size={16} /><span>Send</span></button>
            <button type="button" className={activeView === "earn" ? "active" : ""} onClick={() => setActiveView("earn")} aria-current={activeView === "earn" ? "page" : undefined} data-testid="shell-earn"><Zap size={16} /><span>Earn</span></button>
            <button type="button" className={activeView === "activity" ? "active" : ""} onClick={() => setActiveView("activity")} aria-current={activeView === "activity" ? "page" : undefined} data-testid="shell-activity"><Activity size={16} /><span>Activity</span></button>
          </nav>
          <div className="sidebar-footnote"><span className="sidebar-dot" /> <span>Sepolia pool<br />Live contract state</span></div>
        </aside>

        <main className="vault-main" data-workflow-step={model.workflowStep}>
          {model.readError && <div className="read-error" role="alert"><strong>Sepolia read degraded.</strong><span>{model.readError}</span><button type="button" onClick={() => void model.refresh()}>Retry</button></div>}

          {activeView !== "overview" && activeView !== "draws" && activeView !== "deposit" && (
            <div className="workspace-heading">
              <div>
                <h1>{viewCopy.title}</h1>
              </div>
            </div>
          )}

          {activeView === "overview" && <OverviewDashboard {...model} onNavigate={setActiveView} />}

          {activeView === "draws" && <DrawsView {...model} />}

          {activeView === "deposit" && (
            <section className="focused-view deposit-view" id="workspace" aria-label="Deposit into a confidential prize vault">
              <DepositAction {...model} />
            </section>
          )}

          {activeView === "withdraw" && (
            <section className="focused-view" id="workspace" aria-label="Withdraw vault position">
              <VaultAction {...model} mode="withdraw" />
            </section>
          )}

          {(activeView === "shield" || activeView === "unshield") && (
            <section className="focused-view" id="workspace" aria-label={`${viewCopy.title} confidential token`}>
              <TokenAction {...model} mode={activeView} />
            </section>
          )}

          {activeView === "send" && (
            <section className="focused-view" id="workspace" aria-label={`Send confidential ${model.activeMarket.tokenSymbol}`}>
              <SendAction {...model} />
            </section>
          )}

          {activeView === "earn" && (
            <section className="focused-view" id="workspace" aria-label="Earn yield on private savings">
              <EarnView {...model} />
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
          <a href={`https://sepolia.etherscan.io/address/${model.activeMarket.poolAddress}`} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Etherscan</a>
          <a href="https://github.com/zama-ai/fhevm" target="_blank" rel="noreferrer"><Github size={13} /> FHEVM</a>
        </div>
      </footer>

      <ProofDrawer open={proofOpen} onClose={() => setProofOpen(false)} poolState={model.poolState} market={model.activeMarket} />
      <OperationToast operation={model.operation} onClose={model.clearOperation} />
    </div>
  )
}
