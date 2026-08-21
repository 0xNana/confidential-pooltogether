import { ArrowRight, Check, KeyRound } from "lucide-react"
import { FormEvent, useMemo, useState } from "react"
import type { ConfidentialPoolTogetherModel } from "../hooks/useConfidentialPoolTogether"
import { validateActionAmount } from "../lib/action-validation"
import { formatTokenAmount } from "../lib/fhevm"

type VaultActionProps = Pick<
  ConfidentialPoolTogetherModel,
  "account" | "activeMarket" | "correctChain" | "isOperator" | "walletBalance" | "principal" | "poolState" | "operation" | "approveOperator" | "transact"
>

type Mode = "deposit" | "withdraw"
const FLOW = ["Prepare", "Encrypt + prove", "Wallet signature", "Onchain confirmation"]

export function VaultAction({ mode, ...props }: VaultActionProps & { mode: Mode }) {
  const [amount, setAmount] = useState("")
  const busy = ["preparing", "encrypting", "signature", "pending"].includes(props.operation.stage)
  const actionBusy = busy && (props.operation.kind === mode || props.operation.kind === "operator")
  const currentStep = stageIndex(props.operation.stage)
  const available = mode === "deposit" ? props.walletBalance : props.principal
  const disabledReason = useMemo(() => {
    if (!props.account) return "Connect wallet"
    if (!props.correctChain) return "Switch to Sepolia"
    if (mode === "deposit" && props.poolState.phase !== 0) return "Deposits paused during draw close"
    if (mode === "deposit" && !props.isOperator) return "Approve pool access first"
    return validateActionAmount(mode, amount, available)
  }, [amount, available, mode, props.account, props.correctChain, props.isOperator, props.poolState.phase])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (disabledReason || actionBusy) return
    try {
      await props.transact(mode, amount)
      setAmount("")
    } catch {
      // The shared operation controller renders the actionable error.
    }
  }

  return (
    <section className="vault-action ruled-panel" aria-labelledby="vault-action-title">
      <form onSubmit={(event) => void submit(event)}>
        <div className="action-heading">
          <div><p className="eyebrow">{mode === "deposit" ? "In this vault" : "Your balance"}</p><h2 id="vault-action-title">{mode === "deposit" ? "Deposit" : "Withdraw"}</h2></div>
        </div>

        <p className="action-copy">{mode === "deposit" ? `Add ${props.activeMarket.tokenSymbol} to this vault to join the draw.` : `Take your ${props.activeMarket.tokenSymbol} back out anytime.`}</p>

        {mode === "deposit" && props.account && props.correctChain && !props.isOperator && (
          <div className="operator-step">
            <span className="step-index">01</span><KeyRound size={18} />
            <div><strong>Approve confidential token access</strong><p>Grant Confidential PoolTogether a revocable 30-day ERC-7984 operator permission. Amounts remain encrypted.</p></div>
            <button className="button button-outline" type="button" onClick={() => void props.approveOperator()} disabled={actionBusy}>Approve</button>
          </div>
        )}

        <label className="amount-entry">
          <span>Amount</span>
          <div><input name="amount" autoComplete="off" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" data-testid="amount-input" /><strong>{props.activeMarket.tokenSymbol}</strong></div>
        </label>
        <div className="amount-toolbar">
          <div>{["100", "500", "1000"].map((value) => <button key={value} type="button" onClick={() => setAmount(value)}>{value}</button>)}</div>
          <button type="button" disabled={available === undefined} onClick={() => available !== undefined && setAmount(formatTokenAmount(available, 6))}>Max</button>
          <span>{mode === "deposit" ? "Balance" : "Deposited"}: {available === undefined ? "sealed" : `${formatTokenAmount(available)} ${props.activeMarket.tokenSymbol}`}</span>
        </div>

        {actionBusy && props.operation.kind === mode && (
          <ol className="transaction-steps" aria-label="Confidential transaction progress" aria-live="polite">
            {FLOW.map((step, index) => <li key={step} className={index < currentStep ? "complete" : index === currentStep ? "current" : ""}><span>{index < currentStep ? <Check size={12} /> : index + 1}</span><small>{step}</small></li>)}
          </ol>
        )}

        <button className="button button-orange action-primary" type="submit" disabled={Boolean(disabledReason) || actionBusy} data-testid="submit-action">
          {actionBusy && props.operation.kind === mode ? props.operation.title : disabledReason ?? (mode === "deposit" ? "Deposit" : "Withdraw")}
          {actionBusy ? <span className="button-loader" /> : <ArrowRight size={17} />}
        </button>
      </form>
    </section>
  )
}

function stageIndex(stage: ConfidentialPoolTogetherModel["operation"]["stage"]) {
  if (stage === "preparing") return 0
  if (stage === "encrypting") return 1
  if (stage === "signature") return 2
  if (stage === "pending" || stage === "confirmed") return 3
  return 0
}
