import { ArrowRight, Send, Wallet } from "lucide-react"
import { useState, type FormEvent } from "react"
import { useConfidentialTransfer } from "@zama-fhe/react-sdk"
import type { ConfidentialPoolTogetherModel } from "../hooks/useConfidentialPoolTogether"
import { type Address } from "../lib/contracts"
import { parseTokenAmount } from "../lib/fhevm"

type SendActionProps = Pick<ConfidentialPoolTogetherModel, "account" | "activeMarket" | "correctChain">

export function SendAction({ account, activeMarket, correctChain }: SendActionProps) {
  const [recipient, setRecipient] = useState("")
  const [amount, setAmount] = useState("")
  const [error, setError] = useState<string>()
  const transfer = useConfidentialTransfer({ address: activeMarket.assetAddress })

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!account || !correctChain || transfer.isPending) return
    try {
      setError(undefined)
      const parsedAmount = parseTokenAmount(amount)
      if (parsedAmount <= 0n) throw new Error("Enter an amount greater than zero.")
      if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) throw new Error("Enter a valid recipient address.")
      await transfer.mutateAsync({ to: recipient as Address, amount: parsedAmount })
      setRecipient("")
      setAmount("")
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "The confidential transfer failed.")
    }
  }

  return (
    <section className="vault-action send-action ruled-panel" aria-labelledby="send-action-title">
      <div className="token-action-mark"><span><Send size={22} /></span></div>
      <form onSubmit={(event) => void submit(event)}>
        <div className="action-heading"><div><p className="eyebrow">Private transfer</p><h2 id="send-action-title">Send {activeMarket.tokenSymbol}</h2></div></div>
        <p className="token-action-copy">Send confidential {activeMarket.tokenSymbol} to another wallet without publishing the transfer amount.</p>
        {!account ? (
          <div className="token-action-gate"><Wallet size={18} /> Connect a wallet to continue.</div>
        ) : !correctChain ? (
          <div className="token-action-gate"><Send size={18} /> Switch to Sepolia to send {activeMarket.tokenSymbol}.</div>
        ) : (
          <>
            <label className="send-field"><span>Recipient</span><input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="0x…" autoComplete="off" spellCheck="false" data-testid="send-recipient-input" /></label>
            <label className="amount-entry token-amount-entry"><span>Amount</span><div><input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" inputMode="decimal" autoComplete="off" data-testid="send-amount-input" /><strong>{activeMarket.tokenSymbol}</strong></div></label>
            {error && <p className="token-action-error" role="alert">{error}</p>}
            <button className="button button-orange action-primary" type="submit" disabled={transfer.isPending || !amount || !recipient} data-testid="send-submit">
              {transfer.isPending ? "Sending" : `Send ${activeMarket.tokenSymbol}`} {transfer.isPending ? <span className="button-loader" /> : <ArrowRight size={17} />}
            </button>
          </>
        )}
      </form>
    </section>
  )
}
