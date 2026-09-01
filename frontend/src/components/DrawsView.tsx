import { TicketCheck } from "lucide-react"
import type { ConfidentialPoolTogetherModel } from "../hooks/useConfidentialPoolTogether"
import { DrawStatus } from "./DrawStatus"
import { HistoricalDraws } from "./HistoricalDraws"
import { PrizeCard } from "./PrizeCard"

type DrawsViewProps = Pick<
  ConfidentialPoolTogetherModel,
  "account" | "activeMarket" | "correctChain" | "permitReady" | "prize" | "prizeDrawId" | "poolState" | "loading" | "readError" | "operation" | "connect" | "switchNetwork" | "authorizeReads" | "previewPrize" | "claimPrize" | "advanceDraw" | "advanceSelection" | "sweepPrize" | "setHistoricalOffset"
>

export function DrawsView(props: DrawsViewProps) {
  return (
    <section className="draws-view" id="workspace" aria-labelledby="draws-title">
      <header className="draws-page-header">
        <div><p className="eyebrow"><TicketCheck size={14} /> Prize draws</p><h1 id="draws-title">Draws</h1></div>
        <p>Follow the live draw, check your private result, and help advance any permissionless action when one becomes available.</p>
      </header>

      <DrawStatus {...props} />

      <div className="draws-prize-card">
        <PrizeCard {...props} />
      </div>

      <HistoricalDraws {...props} />
    </section>
  )
}
