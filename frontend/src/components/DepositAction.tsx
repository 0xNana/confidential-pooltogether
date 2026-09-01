import { ArrowRight, Check, Eye, KeyRound, LockKeyhole, Network, ShieldCheck, Wallet } from "lucide-react"
import { FormEvent, useMemo, useState } from "react"
import type { ReactNode } from "react"
import type { ConfidentialPoolTogetherModel } from "../hooks/useConfidentialPoolTogether"
import { validateActionAmount } from "../lib/action-validation"
import { formatTokenAmount } from "../lib/fhevm"

type DepositActionProps = Pick<
  ConfidentialPoolTogetherModel,
  "account" | "activeMarket" | "markets" | "selectMarket" | "correctChain" | "permitReady" | "isOperator" | "walletBalance" | "operation" | "connect" | "switchNetwork" | "authorizeReads" | "revealPosition" | "approveOperator" | "transact"
>

const TRANSACTION_FLOW = ["Prepare", "Encrypt + prove", "Wallet signature", "Onchain confirmation"]

export function DepositAction(props: DepositActionProps) {
  const [amount, setAmount] = useState("")
  const busy = ["preparing", "encrypting", "signature", "pending"].includes(props.operation.stage)
  const depositBusy = busy && props.operation.kind === "deposit"
  const preparationReady = Boolean(props.account && props.correctChain && props.permitReady && props.walletBalance !== undefined && props.isOperator)
  const currentTransactionStep = stageIndex(props.operation.stage)
  const disabledReason = useMemo(() => {
    if (!props.account) return "Connect wallet"
    if (!props.correctChain) return "Switch to Sepolia"
    if (!props.permitReady) return "Authorize private balance"
    if (props.walletBalance === undefined) return "Reveal private balance"
    if (!props.isOperator) return "Approve pool access"
    return validateActionAmount("deposit", amount, props.walletBalance)
  }, [amount, props.account, props.correctChain, props.isOperator, props.permitReady, props.walletBalance])

  const preparationAction = !props.account
    ? { label: "Connect wallet", icon: <Wallet size={16} />, run: props.connect }
    : !props.correctChain
      ? { label: "Switch to Sepolia", icon: <Network size={16} />, run: props.switchNetwork }
      : !props.permitReady
        ? { label: "Authorize private balance", icon: <KeyRound size={16} />, run: props.authorizeReads }
        : props.walletBalance === undefined
          ? { label: "Reveal balance locally", icon: <Eye size={16} />, run: props.revealPosition }
          : !props.isOperator
            ? { label: "Approve vault access", icon: <ShieldCheck size={16} />, run: props.approveOperator }
            : undefined

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (disabledReason || depositBusy) return
    try {
      await props.transact("deposit", amount)
      setAmount("")
    } catch {
      // The shared operation controller renders the actionable error.
    }
  }

  return (
    <section className="deposit-journey ruled-panel" aria-labelledby="deposit-title">
      <header className="deposit-hero">
        <div>
          <p className="eyebrow"><LockKeyhole size={14} /> Private prize savings</p>
          <h1 id="deposit-title">Make a private deposit.</h1>
          <p>Choose a vault and deposit privately.</p>
        </div>
      </header>

      <ol className="deposit-progress" aria-label="Deposit steps" data-testid="deposit-steps">
        <li className="complete"><span><Check size={12} /></span><div><small>Step 1</small><strong>Choose vault</strong></div></li>
        <li className={preparationReady ? "complete" : "current"}><span>{preparationReady ? <Check size={12} /> : "2"}</span><div><small>Step 2</small><strong>Prepare access</strong></div></li>
        <li className={preparationReady ? "current" : ""}><span>3</span><div><small>Step 3</small><strong>Deposit privately</strong></div></li>
      </ol>

      <form onSubmit={(event) => void submit(event)}>
        <section className="deposit-step deposit-market-step" aria-labelledby="deposit-market-title">
          <header><span>01</span><div><strong id="deposit-market-title">Choose your vault</strong><small>Your selection updates the full app.</small></div></header>
          <div className="deposit-market-grid">
            {Object.values(props.markets).map((market) => {
              const selected = props.activeMarket.id === market.id
              return (
                <button key={market.id} className={selected ? "deposit-market active" : "deposit-market"} type="button" aria-pressed={selected} onClick={() => props.selectMarket(market.id)} data-testid={`deposit-market-${market.id.toLowerCase()}`}>
                  <span className="deposit-token-mark"><img src={`/tokens/${market.underlyingSymbol.toLowerCase()}.svg`} alt="" /></span>
                  <span className="deposit-market-copy"><small>Confidential {market.underlyingSymbol}</small><strong>{market.tokenSymbol}</strong></span>
                  <span className="deposit-market-state">{selected ? <><Check size={13} /> Selected</> : "Choose"}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="deposit-step deposit-access-step" aria-labelledby="deposit-access-title">
          <header><span>02</span><div><strong id="deposit-access-title">Prepare private access</strong><small>Complete each wallet gate once, in order.</small></div></header>
          <div className="deposit-readiness">
            <Readiness icon={<Eye size={15} />} label="Private balance" value={props.walletBalance === undefined ? "Sealed" : `${formatTokenAmount(props.walletBalance)} ${props.activeMarket.tokenSymbol}`} ready={props.walletBalance !== undefined} />
            <Readiness icon={<ShieldCheck size={15} />} label="Vault access" value={props.isOperator ? "Approved" : "Approval required"} ready={Boolean(props.isOperator)} />
          </div>
          {preparationAction ? (
            <button className="button button-accent deposit-prepare-action" type="button" onClick={() => void preparationAction.run()} disabled={busy} data-testid="deposit-prepare-action">
              {busy ? props.operation.title ?? "Check wallet…" : preparationAction.label}
              {busy ? <span className="button-loader" /> : preparationAction.icon}
            </button>
          ) : (
            <p className="deposit-ready"><Check size={14} /> Private balance ready for this vault.</p>
          )}
        </section>

        <section className={preparationReady ? "deposit-step deposit-amount-step ready" : "deposit-step deposit-amount-step"} aria-labelledby="deposit-amount-title">
          <header><span>03</span><div><strong id="deposit-amount-title">Set your deposit</strong><small>Principal stays withdrawable. Amounts remain encrypted.</small></div></header>
          <label className="amount-entry">
            <span>Amount</span>
            <div><input name="amount" autoComplete="off" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" data-testid="amount-input" /><strong>{props.activeMarket.tokenSymbol}</strong></div>
          </label>
          <div className="amount-toolbar">
            <div>{["100", "500", "1000"].map((value) => <button key={value} type="button" onClick={() => setAmount(value)}>{value}</button>)}</div>
            <button type="button" disabled={props.walletBalance === undefined} onClick={() => props.walletBalance !== undefined && setAmount(formatTokenAmount(props.walletBalance, 6))}>Max</button>
            <span>Balance: {props.walletBalance === undefined ? "sealed" : `${formatTokenAmount(props.walletBalance)} ${props.activeMarket.tokenSymbol}`}</span>
          </div>

          {depositBusy && (
            <ol className="transaction-steps" aria-label="Confidential transaction progress" aria-live="polite">
              {TRANSACTION_FLOW.map((step, index) => <li key={step} className={index < currentTransactionStep ? "complete" : index === currentTransactionStep ? "current" : ""}><span>{index < currentTransactionStep ? <Check size={12} /> : index + 1}</span><small>{step}</small></li>)}
            </ol>
          )}

          <button className="button button-accent action-primary" type="submit" disabled={Boolean(disabledReason) || depositBusy} data-testid="submit-action">
            {depositBusy ? props.operation.title : disabledReason ?? `Deposit ${props.activeMarket.tokenSymbol}`}
            {depositBusy ? <span className="button-loader" /> : <ArrowRight size={17} />}
          </button>
        </section>
      </form>
    </section>
  )
}

function Readiness({ icon, label, value, ready }: { icon: ReactNode; label: string; value: string; ready: boolean }) {
  return <div className={ready ? "ready" : ""}>{icon}<span><small>{label}</small><strong>{value}</strong></span>{ready ? <Check size={13} /> : <i />}</div>
}

function stageIndex(stage: ConfidentialPoolTogetherModel["operation"]["stage"]) {
  if (stage === "preparing") return 0
  if (stage === "encrypting") return 1
  if (stage === "signature") return 2
  if (stage === "pending" || stage === "confirmed") return 3
  return 0
}
