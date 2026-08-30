import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Eye,
  EyeOff,
  Fingerprint,
  Github,
  KeyRound,
  LockKeyhole,
  ScanLine,
  ShieldCheck,
  TicketCheck,
  WalletCards,
} from "lucide-react"
import { BrandMark } from "../components/BrandMark"
import { POOL_ADDRESS } from "../lib/contracts"

const DRAW_STEPS = [
  { icon: WalletCards, number: "01", title: "Save", copy: "Deposit cUSDT or cUSDC without publishing your amount, balance, or odds." },
  { icon: LockKeyhole, number: "02", title: "Seal", copy: "The contract snapshots encrypted positions for the live draw." },
  { icon: Fingerprint, number: "03", title: "Select", copy: "FHE weighted selection runs onchain without exposing the winner." },
  { icon: TicketCheck, number: "04", title: "Claim", copy: "Privately decrypt prize-or-zero and keep your principal available." },
]

const PRIVATE_FIELDS = ["Deposit and withdrawal amounts", "Your balance and draw weight", "Aggregate pool size", "Winner identity and prize"]
const PUBLIC_FIELDS = ["Transaction timing", "Draw phase and schedule", "Participant count", "Contract execution"]

export function LandingPage() {
  return (
    <div className="landing-shell">
      <a className="skip-link" href="#landing-content">Skip to main content</a>

      <header className="landing-nav">
        <a className="brand" href="#top" aria-label="Confidential PoolTogether home">
          <BrandMark />
          <span><strong><span className="landing-brand-long">Confidential PoolTogether</span><span className="landing-brand-short">PoolTogether</span></strong><small>Built on Zama FHEVM</small></span>
        </a>
        <nav aria-label="Landing navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#privacy">Privacy model</a>
        </nav>
        <a className="button button-accent landing-launch" href="/app">Open vault <ArrowUpRight size={15} /></a>
      </header>

      <main id="landing-content">
        <section className="landing-hero" id="top" aria-labelledby="landing-title">
          <div className="landing-hero-inner">
            <div className="landing-hero-copy">
              <p className="eyebrow"><LockKeyhole size={14} /> Zama FHEVM · Live on Sepolia</p>
              <h1 id="landing-title"><span>Confidential</span><em>PoolTogether</em></h1>
              <p className="landing-hero-statement">Prize savings with a private balance<br />and a publicly verifiable draw.</p>
              <p className="landing-lede">Deposit confidential stablecoins, keep your principal available, and compete for yield while FHE keeps every position, odds, winner, and prize encrypted.</p>
              <div className="landing-actions">
                <a className="button button-accent landing-primary-cta" href="/app" data-testid="launch-app">Enter the private draw <ArrowRight size={17} /></a>
                <a className="landing-text-link" href={`https://sepolia.etherscan.io/address/${POOL_ADDRESS}#code`} target="_blank" rel="noreferrer">Verify the live contract <ArrowUpRight size={15} /></a>
              </div>
              <p className="landing-hero-note"><ShieldCheck size={15} /><span><strong>No-loss prize design</strong>Your deposited principal is never awarded.</span></p>
            </div>

            <div className="hero-product" role="group" aria-label="How a confidential prize draw protects your position">
              <div className="hero-product-orbit" aria-hidden="true" />
              <header className="hero-product-header">
                <span><BrandMark /><strong>Private draw console</strong></span>
                <small><i /> Sepolia live</small>
              </header>
              <div className="hero-draw-status">
                <span><small>Current draw</small><strong>#001 · Deposits open</strong></span>
                <span><small>Prize pool</small><strong><LockKeyhole size={13} /> Encrypted</strong></span>
              </div>
              <div className="hero-private-position">
                <div className="hero-private-heading">
                  <span><small>Your position</small><strong>Visible only to you</strong></span>
                  <span className="hero-encrypted-badge"><ShieldCheck size={13} /> FHE encrypted</span>
                </div>
                <div className="hero-cipher-value">
                  <small>Vault balance</small>
                  <span role="img" aria-label="Encrypted vault balance"><i /><i /><i /><i /><i /><i /></span>
                  <p><EyeOff size={13} /> No plaintext amount is published</p>
                </div>
              </div>
              <ol className="hero-privacy-path" aria-label="Confidential draw flow">
                <li><span>01</span><strong>Save</strong><small>Encrypt</small></li>
                <li><span>02</span><strong>Seal</strong><small>Snapshot</small></li>
                <li><span>03</span><strong>Draw</strong><small>Compute</small></li>
                <li><span>04</span><strong>Claim</strong><small>Decrypt</small></li>
              </ol>
              <div className="hero-product-foot"><ScanLine size={15} /><span><strong>Public execution. Private values.</strong><small>Powered by Zama FHEVM</small></span></div>
            </div>
          </div>
          <div className="landing-hero-proof" aria-label="Protocol assurances">
            <span><WalletCards size={16} /><strong>Principal stays yours</strong><small>Withdraw while the pool is open</small></span>
            <span><LockKeyhole size={16} /><strong>Financial values stay sealed</strong><small>Encrypted before submission</small></span>
            <span><ShieldCheck size={16} /><strong>Every draw stays auditable</strong><small>Verified contract execution</small></span>
          </div>
        </section>

        <section className="landing-thesis" aria-labelledby="thesis-title">
          <div className="landing-section-label"><span>01</span><p>A better public record</p></div>
          <div className="landing-thesis-copy">
            <h2 id="thesis-title">The draw is public.<br /><em>Your finances are not.</em></h2>
            <div>
              <p>Prize savings should be easy to verify without turning every saver into an open balance sheet. Confidential PoolTogether separates proof from disclosure.</p>
              <a href={`https://sepolia.etherscan.io/address/${POOL_ADDRESS}#code`} target="_blank" rel="noreferrer">Inspect the deployed contract <ArrowUpRight size={14} /></a>
            </div>
          </div>
          <div className="landing-principles">
            <article><span>01</span><WalletCards size={23} /><strong>Principal stays liquid</strong><p>Withdraw while deposits are open. Prize yield remains separate from saver principal.</p></article>
            <article><span>02</span><EyeOff size={23} /><strong>Positions stay sealed</strong><p>Balances, weights, winner identity, and prize amounts remain ciphertext throughout the draw.</p></article>
            <article><span>03</span><ScanLine size={23} /><strong>Execution stays visible</strong><p>Anyone can inspect the schedule, lifecycle, participant count, and verified contract code.</p></article>
          </div>
        </section>

        <section className="landing-lifecycle" id="how-it-works" aria-labelledby="lifecycle-title">
          <div className="landing-section-label light"><span>02</span><p>One path from savings to prize</p></div>
          <div className="landing-section-heading">
            <h2 id="lifecycle-title">Four public steps.<br />Zero public balances.</h2>
          </div>
          <ol className="landing-steps">
            {DRAW_STEPS.map((step) => (
              <li className="landing-step-card" key={step.number}>
                <div><span>{step.number}</span><step.icon size={22} /></div>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-privacy" id="privacy" aria-labelledby="privacy-heading">
          <div className="landing-section-label light"><span>03</span><p>An explicit privacy boundary</p></div>
          <div className="landing-privacy-heading">
            <p className="eyebrow">Designed for informed trust</p>
            <h2 id="privacy-heading">Private values.<br /><em>Public proof.</em></h2>
            <p>Confidential PoolTogether hides financial values, not the existence of Ethereum activity. The boundary is visible before you connect.</p>
          </div>
          <div className="landing-privacy-grid privacy-book">
            <div className="privacy-list private-list">
              <header><EyeOff size={20} /><span><strong>Encrypted</strong><small>Never published as plaintext</small></span></header>
              <ul>{PRIVATE_FIELDS.map((field) => <li key={field}><Check size={14} /> {field}</li>)}</ul>
            </div>
            <div className="privacy-list public-list">
              <header><Eye size={20} /><span><strong>Verifiable</strong><small>Visible for accountability</small></span></header>
              <ul>{PUBLIC_FIELDS.map((field) => <li key={field}><Check size={14} /> {field}</li>)}</ul>
            </div>
          </div>
        </section>

        <section className="landing-final-cta" aria-labelledby="final-cta-title">
          <KeyRound size={28} />
          <p className="eyebrow">The live confidential vault</p>
          <h2 id="final-cta-title">Your balance is<br />nobody else&apos;s business.</h2>
          <p>Connect on Sepolia, fund confidential stablecoins, and enter the encrypted draw.</p>
          <a className="button button-accent landing-primary-cta" href="/app">Open Confidential PoolTogether <ArrowRight size={17} /></a>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="brand"><BrandMark /><span><strong>Confidential PoolTogether</strong><small>Built on Zama FHEVM</small></span></div>
        <p>Built for Zama Developer Program Season 4.<br />Sepolia testnet software. Not yet audited.</p>
        <div>
          <a href={`https://sepolia.etherscan.io/address/${POOL_ADDRESS}`} target="_blank" rel="noreferrer"><ArrowUpRight size={14} /> Etherscan</a>
          <a href="https://github.com/zama-ai/fhevm" target="_blank" rel="noreferrer"><Github size={14} /> FHEVM</a>
        </div>
      </footer>
    </div>
  )
}
