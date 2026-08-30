import { ArrowDown, ArrowRight, Eye, KeyRound, Shield, ShieldCheck, ShieldOff, Wallet } from "lucide-react"
import { useState, type FormEvent } from "react"
import { useShield, useUnshield } from "@zama-fhe/react-sdk"
import type { ConfidentialPoolTogetherModel } from "../hooks/useConfidentialPoolTogether"
import { formatTokenAmount, parseTokenAmount } from "../lib/fhevm"

type TokenActionProps = Pick<ConfidentialPoolTogetherModel, "account" | "activeMarket" | "correctChain" | "walletBalance" | "underlyingBalance" | "permitReady" | "operation" | "authorizeReads" | "revealPosition"> & {
  mode: "shield" | "unshield"
}

export function TokenAction({ account, activeMarket, correctChain, mode, walletBalance, underlyingBalance, permitReady, operation, authorizeReads, revealPosition }: TokenActionProps) {
  const [amount, setAmount] = useState("")
  const [error, setError] = useState<string>()
  const shield = useShield({ address: activeMarket.assetAddress })
  const unshield = useUnshield(activeMarket.assetAddress)
  const mutation = mode === "shield" ? shield : unshield
  const busy = mutation.isPending
  const isShield = mode === "shield"
  const available = isShield ? underlyingBalance : walletBalance
  const authorizing = operation.kind === "permit" && ["preparing", "signature"].includes(operation.stage)
  const decrypting = operation.stage === "preparing" && operation.title?.toLowerCase().includes("decryption")

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!account || !correctChain || busy) return
    try {
      setError(undefined)
      const parsedAmount = parseTokenAmount(amount)
      if (parsedAmount <= 0n) throw new Error("Enter an amount greater than zero.")
      await mutation.mutateAsync({ amount: parsedAmount })
      setAmount("")
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "The token action failed.")
    }
  }

  return (
    <section className="vault-action token-action ruled-panel" aria-labelledby="token-action-title">
      <div className="token-action-mark"><span>{isShield ? <Shield size={22} /> : <ShieldOff size={22} />}</span></div>
      <form onSubmit={(event) => void submit(event)}>
        <div className="action-heading">
          <div><p className="eyebrow">{isShield ? "Public to private" : "Private to public"}</p><h2 id="token-action-title">{isShield ? `Shield ${activeMarket.tokenSymbol}` : `Unshield ${activeMarket.tokenSymbol}`}</h2></div>
        </div>
        <p className="token-action-copy">{isShield ? `Convert public test ${activeMarket.underlyingSymbol} into confidential ${activeMarket.tokenSymbol} before entering the prize pool.` : `Convert confidential ${activeMarket.tokenSymbol} back into public test ${activeMarket.underlyingSymbol}. The wrapper completes the encrypted unwrap flow.`}</p>
        <div className="token-route" aria-label={isShield ? `Public ${activeMarket.underlyingSymbol} to confidential ${activeMarket.tokenSymbol}` : `Confidential ${activeMarket.tokenSymbol} to public ${activeMarket.underlyingSymbol}`}>
          <div className="token-swap-pane">
            <small>{isShield ? "You shield" : "You unshield"}</small>
            <label className="token-swap-field">
              <input name={`${mode}-amount`} autoComplete="off" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" aria-label={`${isShield ? `Public ${activeMarket.underlyingSymbol}` : `Confidential ${activeMarket.tokenSymbol}`} amount`} data-testid={`${mode}-amount-input`} />
              <strong>{isShield ? activeMarket.underlyingSymbol : activeMarket.tokenSymbol}</strong>
            </label>
            <span>{available === undefined ? (isShield ? "Balance unavailable" : `Decrypt ${activeMarket.tokenSymbol} to view`) : `Balance: ${formatTokenAmount(available)} ${isShield ? activeMarket.underlyingSymbol : activeMarket.tokenSymbol}`}</span>
            <button className="token-max" type="button" onClick={() => available !== undefined && setAmount(formatTokenAmount(available, 6))} disabled={available === undefined || busy}>Max</button>
          </div>
          <ArrowDown size={18} aria-hidden="true" />
          <div className="token-swap-pane token-swap-receive">
            <small>You receive</small>
            <strong className="token-swap-output">{amount || "0.00"} <span>{isShield ? activeMarket.tokenSymbol : activeMarket.underlyingSymbol}</span></strong>
            <span>1:1 wrapper rate</span>
          </div>
        </div>

        {!account ? (
          <div className="token-action-gate"><Wallet size={18} /> Connect a wallet to continue.</div>
        ) : !correctChain ? (
          <div className="token-action-gate"><Shield size={18} /> Switch to Sepolia to use the official wrapper.</div>
        ) : (
          <>
            {!isShield && available === undefined && !permitReady && <div className="token-action-gate"><KeyRound size={18} /><span>Authorize a private session to access your {activeMarket.tokenSymbol} balance.</span><button className="button button-accent" type="button" onClick={() => void authorizeReads()} disabled={authorizing}>{authorizing ? "Check wallet…" : "Authorize reads"}</button></div>}
            {!isShield && available === undefined && permitReady && <div className="token-action-gate token-action-reveal"><ShieldCheck size={18} /><button className="button button-accent" type="button" onClick={() => void revealPosition()} disabled={decrypting}><Eye size={15} /> {decrypting ? "Decrypting…" : "Reveal balance"}</button></div>}
            {error && <p className="token-action-error" role="alert">{error}</p>}
            <button className="button button-accent action-primary" type="submit" disabled={busy || !amount || (!isShield && available === undefined)} data-testid={`${mode}-submit`}>
              {busy ? (isShield ? "Shielding" : "Unshielding") : (isShield ? `Shield ${activeMarket.tokenSymbol}` : `Unshield ${activeMarket.tokenSymbol}`)}
              {busy ? <span className="button-loader" /> : <ArrowRight size={17} />}
            </button>
          </>
        )}
      </form>
    </section>
  )
}
