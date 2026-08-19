import {
  ArrowDown,
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
  Sparkles,
  TicketCheck,
  WalletCards,
} from "lucide-react"
import { BrandMark } from "../components/BrandMark"
import { POOL_ADDRESS } from "../lib/contracts"

const DRAW_STEPS = [
  { icon: WalletCards, number: "01", title: "Save", copy: "Deposit cUSDT without publishing your amount, balance, or odds." },
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

      <div className="landing-statusbar">
        <span><i /> Live on Ethereum Sepolia</span>
        <span>Encrypted prize savings powered by Zama FHEVM</span>
        <a href={`https://sepolia.etherscan.io/address/${POOL_ADDRESS}#code`} target="_blank" rel="noreferrer">Verified contract <ArrowUpRight size={13} /></a>
      </div>

      <header className="landing-nav">
        <a className="brand" href="#top" aria-label="Confidential PoolTogether home">
          <BrandMark />
          <span><strong>Confidential PoolTogether</strong><small>Private prize savings</small></span>
        </a>
        <nav aria-label="Landing navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#privacy">Privacy model</a>
        </nav>
        <a className="button button-lime landing-launch" href="/app">Open vault <ArrowUpRight size={15} /></a>
      </header>

      <main id="landing-content">
        <section className="landing-hero" id="top" aria-labelledby="landing-title">
          <div className="landing-hero-media" role="img" aria-label="Confidential PoolTogether live vault dashboard" />
          <div className="landing-hero-shade" />
          <div className="landing-hero-copy">
            <p className="eyebrow"><Sparkles size={14} /> The no-loss prize account, now confidential</p>
            <h1 id="landing-title">Confidential<br />PoolTogether</h1>
            <p className="landing-hero-statement">Save privately.<br /><em>Win verifiably.</em></p>
            <p className="landing-lede">Your principal stays yours. Your balance, odds, and prize stay encrypted. Every draw still settles onchain.</p>
            <div className="landing-actions">
              <a className="button button-lime landing-primary-cta" href="/app" data-testid="launch-app">Enter the live vault <ArrowRight size={17} /></a>
              <a className="landing-text-link" href="#how-it-works">See how privacy works <ArrowDown size={15} /></a>
            </div>
          </div>
          <div className="landing-hero-proof" aria-label="Protocol assurances">
            <span><ShieldCheck size={16} /><strong>Live contract</strong><small>Verified on Sepolia</small></span>
            <span><LockKeyhole size={16} /><strong>Encrypted balances</strong><small>Client-side FHE</small></span>
            <span><EyeOff size={16} /><strong>Private results</strong><small>Wallet-only decryption</small></span>
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
            <p>Every state shown in the vault comes from the deployed contract. No simulated odds, hardcoded prizes, or frontend-only winner flags.</p>
          </div>
          <ol className="landing-steps">
            {DRAW_STEPS.map((step) => (
              <li key={step.number}>
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
          <div className="landing-privacy-grid">
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
          <p>Connect on Sepolia, fund cUSDT, and enter the encrypted draw.</p>
          <a className="button button-lime landing-primary-cta" href="/app">Open Confidential PoolTogether <ArrowRight size={17} /></a>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="brand"><BrandMark /><span><strong>Confidential PoolTogether</strong><small>Private prize savings</small></span></div>
        <p>Built for Zama Developer Program Season 4.<br />Sepolia testnet software. Not yet audited.</p>
        <div>
          <a href={`https://sepolia.etherscan.io/address/${POOL_ADDRESS}`} target="_blank" rel="noreferrer"><ArrowUpRight size={14} /> Etherscan</a>
          <a href="https://github.com/zama-ai/fhevm" target="_blank" rel="noreferrer"><Github size={14} /> FHEVM</a>
        </div>
      </footer>
    </div>
  )
}
