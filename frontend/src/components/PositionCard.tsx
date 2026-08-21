import { Eye, Fingerprint, KeyRound, LockKeyhole, ShieldCheck, Wallet } from "lucide-react"
import type { ConfidentialPoolTogetherModel } from "../hooks/useConfidentialPoolTogether"
import { formatTokenAmount } from "../lib/fhevm"

type PositionCardProps = Pick<
  ConfidentialPoolTogetherModel,
  "account" | "activeMarket" | "correctChain" | "permitReady" | "principal" | "walletBalance" | "operation" | "connect" | "switchNetwork" | "authorizeReads" | "revealPosition"
>

export function PositionCard(props: PositionCardProps) {
  const decrypting = props.operation.stage === "preparing" && props.operation.title?.includes("decryption")
  const authorizing = props.operation.kind === "permit" && ["preparing", "signature"].includes(props.operation.stage)
  return (
    <section className="position-card ruled-panel" aria-labelledby="position-title">
      <header className="panel-titlebar">
        <div>
          <p className="eyebrow">In this vault</p>
          <h2 id="position-title">Your wallet</h2>
        </div>
        <span className="security-badge"><LockKeyhole size={13} /> Encrypted onchain</span>
      </header>

      {!props.account ? (
        <div className="position-gate">
          <span className="gate-icon"><Wallet size={23} /></span>
          <div><h3>Connect to access your sealed account.</h3><p>Public pool data remains visible. Your balances require your wallet and a signed Zama decryption permit.</p></div>
          <button className="button button-orange" type="button" onClick={() => void props.connect()}><Wallet size={16} /> Connect</button>
        </div>
      ) : !props.correctChain ? (
        <div className="position-gate">
          <span className="gate-icon"><Fingerprint size={23} /></span>
          <div><h3>Sepolia is required.</h3><p>The deployed pool and its FHEVM ACL live on Ethereum Sepolia.</p></div>
          <button className="button button-orange" type="button" onClick={() => void props.switchNetwork()}>Switch network</button>
        </div>
      ) : (
        <>
          <div className="ledger-grid">
            <LedgerValue label="Your balance" value={props.principal === undefined ? undefined : `${formatTokenAmount(props.principal)} ${props.activeMarket.tokenSymbol}`} />
            <LedgerValue label="Wallet" value={props.walletBalance === undefined ? undefined : `${formatTokenAmount(props.walletBalance)} ${props.activeMarket.tokenSymbol}`} />
            <div className="ledger-value ledger-private"><span><LockKeyhole size={12} /> Draw entry</span><strong>{props.principal === undefined ? "—" : props.principal > 0n ? "Active" : "Inactive"}</strong><small>Odds remain encrypted with the pool</small></div>
          </div>

          {!props.permitReady ? (
            <div className="permit-callout">
              <KeyRound size={19} />
              <div><strong>Reveal your private position</strong><p>Sign once to let this device decrypt your balances and prize status. Nothing is posted onchain.</p></div>
              <button className="button button-ink" type="button" onClick={() => void props.authorizeReads()} disabled={authorizing} data-testid="authorize-session">
                {authorizing ? "Check wallet" : "Reveal privately"}
              </button>
            </div>
          ) : props.principal === undefined || props.walletBalance === undefined ? (
            <div className="permit-callout authorized">
              <ShieldCheck size={19} />
              <div><strong>Session authorized</strong><p>Request threshold decryption. Clear values return only to this browser session.</p></div>
              <button className="button button-teal" type="button" onClick={() => void props.revealPosition()} disabled={decrypting} data-testid="reveal-position">
                <Eye size={15} /> {decrypting ? "Decrypting" : "Reveal values"}
              </button>
            </div>
          ) : (
            <div className="local-reveal-note"><ShieldCheck size={14} /> Values decrypted locally through the Zama KMS threshold network.</div>
          )}
        </>
      )}
    </section>
  )
}

function LedgerValue({ label, value }: { label: string; value?: string }) {
  return (
    <div className="ledger-value">
      <span><LockKeyhole size={12} /> {label}</span>
      {value ? <strong>{value}</strong> : <span className="cipher-line" aria-label={`${label} sealed`}><i /><i /><i /><i /><i /></span>}
      <small>{value ? "Visible only in this session" : "FHE ciphertext"}</small>
    </div>
  )
}
