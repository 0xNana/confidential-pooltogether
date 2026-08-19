import { useState } from "react"
import { ArrowLeft, ExternalLink, FileCheck2, Github } from "lucide-react"
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
        {model.readError && <div className="read-error" role="alert"><strong>Sepolia read degraded.</strong><span>{model.readError}</span><button type="button" onClick={() => void model.refresh()}>Retry</button></div>}

        <DrawStatus poolState={model.poolState} loading={model.loading} />

        <div className="workspace-heading">
          <div>
            <p className="eyebrow">Private pool workspace</p>
            <h1>Your vault</h1>
          </div>
          <p>Review your account, manage your position, and check the current draw result.</p>
        </div>

        <section className="workspace" id="workspace" aria-label="Confidential PoolTogether vault workspace">
          <div className="workspace-main">
            <PositionCard {...model} />
            <VaultAction {...model} />
          </div>
          <aside className="workspace-rail">
            <PrizeCard {...model} />
            <ActivityFeed activity={model.activity} loading={model.loading} />
          </aside>
        </section>
      </main>

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
