import { useState } from "react"
import { ArrowLeft, CircleDot, ExternalLink, FileCheck2, Github, LockKeyhole } from "lucide-react"
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

      <main className="vault-main">
        <header className="vault-intro dashboard-intro">
          <div>
            <p className="eyebrow"><CircleDot size={13} /> Draw #{String(model.poolState.drawId).padStart(3, "0")} · {model.loading ? "syncing" : model.poolState.phaseLabel}</p>
            <h1>Your private<br />prize account.</h1>
            <p>Deposit confidential cUSDT, keep control of your principal, and compete for yield without publishing your balance.</p>
          </div>
          <div className="dashboard-privacy-status"><LockKeyhole size={20} /><span><small>Privacy is active</small><strong>Financial values remain ciphertext onchain</strong></span></div>
        </header>

        {model.readError && <div className="read-error" role="alert"><strong>Sepolia read degraded.</strong><span>{model.readError}</span><button type="button" onClick={() => void model.refresh()}>Retry</button></div>}

        <DrawStatus poolState={model.poolState} loading={model.loading} />

        <section className="workspace" id="workspace" aria-label="Confidential PoolTogether vault workspace">
          <div className="workspace-main">
            <VaultAction {...model} />
            <PositionCard {...model} />
          </div>
          <aside className="workspace-rail">
            <PrizeCard {...model} />
            <ActivityFeed activity={model.activity} loading={model.loading} />
          </aside>
        </section>
      </main>

      <footer className="site-footer vault-footer">
        <a className="brand footer-brand" href="/"><BrandMark /><span><strong>Confidential PoolTogether</strong><small>Save quietly. Win verifiably.</small></span></a>
        <p>Live Zama FHEVM integration · Sepolia testnet · Not yet audited</p>
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
