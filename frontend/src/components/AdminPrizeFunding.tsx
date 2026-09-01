import { Check, Gift, KeyRound, LoaderCircle } from "lucide-react"
import { useState, type FormEvent } from "react"
import { Contract } from "ethers"
import { useEncrypt } from "@zama-fhe/react-sdk"
import type { ConfidentialPoolTogetherModel } from "../hooks/useConfidentialPoolTogether"
import { DEPLOYER, POOL_ABI, type MarketId } from "../lib/contracts"
import { parseTokenAmount } from "../lib/fhevm"

type AdminPrizeFundingProps = Pick<ConfidentialPoolTogetherModel, "account" | "activeMarket" | "markets" | "selectMarket" | "correctChain" | "browserProvider">

export function AdminPrizeFunding(props: AdminPrizeFundingProps) {
  const { mutateAsync: encrypt } = useEncrypt()
  const [amount, setAmount] = useState("")
  const [status, setStatus] = useState<"idle" | "encrypting" | "signature" | "pending" | "confirmed" | "error">("idle")
  const [hash, setHash] = useState<string>()
  const [error, setError] = useState<string>()
  const isDeployer = Boolean(props.account && props.account.toLowerCase() === DEPLOYER.toLowerCase())
  const busy = ["encrypting", "signature", "pending"].includes(status)

  if (!isDeployer) return null

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!props.account || !props.browserProvider || !props.correctChain || busy) return
    try {
      setError(undefined)
      const value = parseTokenAmount(amount)
      setStatus("encrypting")
      const encrypted = await encrypt({ values: [{ value, type: "euint64" }], contractAddress: props.activeMarket.poolAddress, userAddress: props.account })
      const signer = await props.browserProvider.getSigner()
      const pool = new Contract(props.activeMarket.poolAddress, POOL_ABI, signer)
      setStatus("signature")
      const tx = await pool.fundPrize(encrypted.encryptedValues[0], encrypted.inputProof)
      setHash(tx.hash)
      setStatus("pending")
      await tx.wait()
      setAmount("")
      setStatus("confirmed")
    } catch (nextError) {
      setStatus("error")
      setError(nextError instanceof Error ? nextError.message : "Prize funding failed.")
    }
  }

  return (
    <section className="admin-prize-funding ruled-panel" aria-labelledby="admin-prize-title" data-testid="admin-prize-funding">
      <header><div><p className="eyebrow"><KeyRound size={13} /> Deployer console</p><h3 id="admin-prize-title">Fund prize pool</h3></div><span>Owner only</span></header>
      {!props.correctChain ? <p className="admin-prize-gate">Switch to Sepolia to fund prizes.</p> : <form onSubmit={(event) => void submit(event)}>
        <div className="admin-prize-toolbar"><label htmlFor="admin-prize-market">Vault</label><select id="admin-prize-market" value={props.activeMarket.id} onChange={(event) => props.selectMarket(event.target.value as MarketId)} disabled={busy}>{Object.values(props.markets).map((market) => <option key={market.id} value={market.id}>{market.tokenSymbol}</option>)}</select></div>
        <label className="admin-prize-amount"><span>Encrypted amount</span><div><input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" inputMode="decimal" autoComplete="off" /><strong>{props.activeMarket.tokenSymbol}</strong></div></label>
        {error && <p className="admin-prize-error" role="alert">{error}</p>}
        {status === "confirmed" && <p className="admin-prize-success" role="status"><Check size={14} /> Prize funding confirmed.</p>}
        <button className="button button-accent" type="submit" disabled={busy || !amount}>{busy ? <><LoaderCircle className="spin" size={15} /> {status === "encrypting" ? "Encrypting…" : status === "signature" ? "Check wallet…" : "Funding…"}</> : <><Gift size={15} /> Fund {props.activeMarket.tokenSymbol} prizes</>}</button>
        {hash && <a className="admin-prize-tx" href={`https://sepolia.etherscan.io/tx/${hash}`} target="_blank" rel="noreferrer">View transaction</a>}
      </form>}
    </section>
  )
}
