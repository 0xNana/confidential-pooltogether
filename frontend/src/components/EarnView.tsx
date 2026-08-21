import { ArrowRight, ArrowUpRight, BookOpen, ChartNoAxesCombined, Check, LockKeyhole, Wallet } from "lucide-react"
import { FormEvent, useEffect, useState } from "react"
import { Contract } from "ethers"
import { useEncrypt } from "@zama-fhe/react-sdk"
import type { ConfidentialPoolTogetherModel } from "../hooks/useConfidentialPoolTogether"
import { ASSET_ABI, LIQUIDITY_VAULT_ABI } from "../lib/contracts"
import { formatTokenAmount, parseTokenAmount } from "../lib/fhevm"

type EarnViewProps = Pick<ConfidentialPoolTogetherModel, "account" | "activeMarket" | "correctChain" | "walletBalance" | "vaultTvl" | "browserProvider" | "connect" | "switchNetwork">

export function EarnView(props: EarnViewProps) {
  const { mutateAsync: encrypt } = useEncrypt()
  const [amount, setAmount] = useState("")
  const [status, setStatus] = useState<"idle" | "approving" | "encrypting" | "pending" | "confirmed" | "error">("idle")
  const [error, setError] = useState("")
  const [hash, setHash] = useState<string>()
  const [operatorReady, setOperatorReady] = useState(false)
  const hasRewardSource = props.activeMarket.liquidityVaultApyAccounting && props.activeMarket.liquidityVaultRewardSourceConfigured

  useEffect(() => {
    let cancelled = false
    async function checkOperator() {
      if (!props.account || !props.browserProvider || !props.correctChain) {
        setOperatorReady(false)
        return
      }
      try {
        const asset = new Contract(props.activeMarket.assetAddress, ASSET_ABI, props.browserProvider)
        const approved = await asset.isOperator(props.account, props.activeMarket.liquidityVaultAddress)
        if (!cancelled) setOperatorReady(Boolean(approved))
      } catch {
        if (!cancelled) setOperatorReady(false)
      }
    }
    void checkOperator()
    return () => { cancelled = true }
  }, [props.account, props.activeMarket.assetAddress, props.activeMarket.liquidityVaultAddress, props.browserProvider, props.correctChain])

  const busy = ["approving", "encrypting", "pending"].includes(status)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!props.account || !props.browserProvider || !props.correctChain || busy) return
    try {
      const value = parseTokenAmount(amount)
      if (props.walletBalance !== undefined && value > props.walletBalance) throw new Error("Amount exceeds your wallet balance.")
      setError("")
      const signer = await props.browserProvider.getSigner()
      const asset = new Contract(props.activeMarket.assetAddress, ASSET_ABI, signer)
      const operatorUntil = Math.floor(Date.now() / 1000) + 30 * 86_400
      if (!operatorReady) {
        setStatus("approving")
        const approval = await asset.setOperator(props.activeMarket.liquidityVaultAddress, operatorUntil)
        await approval.wait()
        setOperatorReady(true)
      }
      setStatus("encrypting")
      const encrypted = await encrypt({ values: [{ value, type: "euint64" }], contractAddress: props.activeMarket.liquidityVaultAddress, userAddress: props.account })
      const vault = new Contract(props.activeMarket.liquidityVaultAddress, LIQUIDITY_VAULT_ABI, signer)
      const deposit = await vault.deposit(encrypted.encryptedValues[0], encrypted.inputProof)
      setHash(deposit.hash)
      setStatus("pending")
      await deposit.wait()
      setAmount("")
      setStatus("confirmed")
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Earn deposit failed.")
      setStatus("error")
    }
  }

  return (
    <section className="earn-surface ruled-panel" aria-labelledby="earn-title">
      <header className="earn-header">
        <div><p className="eyebrow">Yield farm</p><h2 id="earn-title">Earn on private savings</h2></div>
        <span className="security-badge"><LockKeyhole size={13} /> Confidential strategy</span>
      </header>
      <div className="earn-intro"><ChartNoAxesCombined size={23} /><div><strong>{hasRewardSource ? "12% APY target feeds prize liquidity." : "Reward-source vault is ready for activation."}</strong><p>{hasRewardSource ? "Earn keeps principal encrypted and uses a funded reward reserve to contribute the 90-day APY slice into the prize pool." : "The deployed app must show a reward-source vault with APY accounting and pool wiring before claiming live prize funding."}</p></div></div>
      <div className="earn-metrics"><div><small>APY</small><strong>12%</strong><span>{hasRewardSource ? "Target source" : "Not live yet"}</span></div><div><small>TVL</small><strong>{props.vaultTvl === undefined ? "Encrypted" : `${formatTokenAmount(props.vaultTvl)} ${props.activeMarket.tokenSymbol}`}</strong><span>Vault principal</span></div><div><small>Principal at risk</small><strong>None</strong><span>{hasRewardSource ? "Reward reserve separate" : "Principal-only live"}</span></div><div><small>Strategy status</small><strong>{hasRewardSource ? "Simulated" : "Pending"}</strong><span>{hasRewardSource ? "FHE reward source" : "Verify deployment"}</span></div></div>
      <form className="earn-deposit" onSubmit={(event) => void submit(event)}>
        <div className="earn-deposit-heading"><div><p className="eyebrow">Liquidity Hunt vault</p><h3>Deposit {props.activeMarket.tokenSymbol}</h3><p>{hasRewardSource ? "Deposits define encrypted Earn TVL. The reward source funds prize liquidity from a separate reserve." : "This deployed vault should be treated as principal-only until reward-source verification passes."}</p></div><span className="earn-vault-status"><Check size={14} /> Vault live</span></div>
        {!props.account ? <div className="earn-deposit-gate"><Wallet size={17} /> Connect your wallet to deposit.</div> : !props.correctChain ? <div className="earn-deposit-gate"><Wallet size={17} /> Switch to Sepolia to deposit.</div> : <>
          <label className="earn-amount"><span>Amount</span><div><input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.0" inputMode="decimal" autoComplete="off" /><strong>{props.activeMarket.tokenSymbol}</strong></div></label>
          <div className="earn-deposit-toolbar"><button type="button" onClick={() => props.walletBalance !== undefined && setAmount(formatTokenAmount(props.walletBalance, 6))} disabled={props.walletBalance === undefined}>Max</button><span>Balance: {props.walletBalance === undefined ? "sealed" : `${formatTokenAmount(props.walletBalance)} ${props.activeMarket.tokenSymbol}`}</span></div>
          {error && <p className="earn-error" role="alert">{error}</p>}
          {status === "confirmed" && <p className="earn-success" role="status"><Check size={14} /> Deposit confirmed in the Liquidity Hunt vault.</p>}
          {hash && status === "pending" && <p className="earn-progress" role="status">Confirming your encrypted deposit…</p>}
          <button className="button button-lime earn-deposit-submit" type="submit" disabled={busy || !amount}>{busy ? status === "approving" ? "Approve vault access" : status === "encrypting" ? "Encrypting deposit" : "Confirming deposit" : "Deposit in Earn"}<ArrowRight size={16} /></button>
        </>}
      </form>
      <details className="earn-docs">
        <summary><BookOpen size={16} /> <span>Read about the Liquidity Hunt program</span><ArrowUpRight size={14} /></summary>
        <div className="earn-docs-body">
          <p className="eyebrow">Testnet reward program</p>
          <h3>Liquidity Hunt</h3>
          <p>Liquidity Hunt is a 90-day vault program that uses encrypted Earn TVL to calculate a <strong>12% APY</strong> target. On testnet, rewards come from a funded reserve instead of an audited external strategy.</p>
          <div className="earn-doc-steps">
            <div><span>01</span><strong>Deposit</strong><p>Choose the Liquidity Hunt vault and deposit your {props.activeMarket.tokenSymbol}.</p></div>
            <div><span>02</span><strong>Source rewards</strong><p>The vault computes the 90-day APY slice from encrypted TVL.</p></div>
            <div><span>03</span><strong>Fund prizes</strong><p>The reward reserve contributes encrypted prize liquidity without touching principal.</p></div>
          </div>
          <div className="earn-doc-note"><strong>Need to leave early?</strong><p>You can withdraw principal during the hunt. The current reward source is a testnet simulation and should be replaced by an audited strategy before production custody.</p></div>
        </div>
      </details>
    </section>
  )
}
