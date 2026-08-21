import { ArrowRight, Gift, LockKeyhole, ShieldQuestion, Sparkles, TicketCheck, Trophy, Wallet } from "lucide-react"
import type { ConfidentialPoolTogetherModel } from "../hooks/useConfidentialPoolTogether"
import { formatTokenAmount } from "../lib/fhevm"
import { BrandMark } from "./BrandMark"

type PrizeCardProps = Pick<
  ConfidentialPoolTogetherModel,
  "account" | "activeMarket" | "correctChain" | "permitReady" | "prize" | "poolState" | "operation" | "connect" | "authorizeReads" | "previewPrize" | "claimPrize"
>

export function PrizeCard(props: PrizeCardProps) {
  const prizeBusy = ["preview", "claim"].includes(props.operation.kind ?? "") && ["signature", "pending", "preparing"].includes(props.operation.stage)
  const claimWindowClosed = props.poolState.phase === 2 && !props.poolState.claimable
  return (
    <section className="prize-card" aria-labelledby="prize-title">
      <div className="prize-kicker"><span><Sparkles size={14} /> Draw #{String(props.poolState.drawId).padStart(3, "0")}</span><small>Yield only</small></div>
      <div className="prize-ticket" aria-hidden="true">
        <div className="ticket-shadow" />
        <div className="ticket-face"><BrandMark /><span>CONFIDENTIAL POOLTOGETHER</span><strong>PRIVATE<br />PRIZE</strong><small>ZAMA FHEVM</small></div>
      </div>
      <h2 id="prize-title">{props.poolState.claimable ? "Your result is ready." : claimWindowClosed ? "This claim window closed." : "The prize stays sealed."}</h2>
      <p>{props.poolState.claimable ? "Every participant computes prize-or-zero through the same public contract path. Only your wallet can decrypt the result." : claimWindowClosed ? "Any encrypted remainder will move into the next draw without revealing whether a prize was claimed." : "Winner selection runs over encrypted snapshot weights. The winner address and prize amount are never published."}</p>

      <div className="prize-action">
        {claimWindowClosed ? (
          <div className="prize-state"><LockKeyhole size={17} /><span><strong>Claim window closed</strong><small>Encrypted remainder rolls into the next draw</small></span></div>
        ) : !props.poolState.claimable ? (
          null
        ) : !props.account ? (
          <button className="button prize-button" type="button" onClick={() => void props.connect()}><Wallet size={16} /> Connect to check</button>
        ) : !props.correctChain ? (
          <div className="prize-state"><ShieldQuestion size={17} /><span><strong>Wrong network</strong><small>Switch your wallet to Sepolia</small></span></div>
        ) : !props.permitReady ? (
          <button className="button prize-button" type="button" onClick={() => void props.authorizeReads()}><LockKeyhole size={16} /> Authorize private result</button>
        ) : props.prize === undefined ? (
          <button className="button prize-button" type="button" onClick={() => void props.previewPrize()} disabled={prizeBusy} data-testid="preview-prize"><Gift size={16} /> {prizeBusy ? props.operation.title : "Generate private result"}</button>
        ) : props.prize === 0n ? (
          <div className="not-winner"><TicketCheck size={18} /><div><strong>No prize this draw</strong><p>Your balance and odds remain private. Principal stays available.</p></div></div>
        ) : (
          <div className="winner-result">
            <span><Trophy size={15} /> Winner result decrypted</span>
            <strong>{formatTokenAmount(props.prize)} {props.activeMarket.tokenSymbol}</strong>
            <button className="button prize-button" type="button" onClick={() => void props.claimPrize()} disabled={prizeBusy}>Claim confidentially <ArrowRight size={15} /></button>
          </div>
        )}
      </div>
    </section>
  )
}
