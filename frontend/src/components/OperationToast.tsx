import { AlertTriangle, Check, ExternalLink, LoaderCircle, X } from "lucide-react"
import type { OperationState } from "../hooks/useConfidentialPoolTogether"

export function OperationToast({ operation, onClose }: { operation: OperationState; onClose: () => void }) {
  if (operation.stage === "idle") return null
  const busy = ["preparing", "encrypting", "signature", "pending"].includes(operation.stage)
  return (
    <div className={`operation-toast ${operation.stage}`} role={operation.stage === "error" ? "alert" : "status"} aria-live="polite">
      <span className="operation-icon">
        {busy ? <LoaderCircle className="spin" size={18} /> : operation.stage === "error" ? <AlertTriangle size={18} /> : <Check size={18} />}
      </span>
      <div>
        <small>{stageLabel(operation.stage)}</small>
        <strong>{operation.error ?? operation.title ?? "Working"}</strong>
        {operation.hash && <a href={`https://sepolia.etherscan.io/tx/${operation.hash}`} target="_blank" rel="noreferrer">View transaction <ExternalLink size={12} /></a>}
      </div>
      {!busy && <button type="button" onClick={onClose} aria-label="Dismiss"><X size={16} /></button>}
    </div>
  )
}

function stageLabel(stage: OperationState["stage"]) {
  if (stage === "signature") return "Wallet action"
  if (stage === "pending") return "Sepolia pending"
  if (stage === "confirmed") return "Confirmed"
  if (stage === "error") return "Action needed"
  if (stage === "encrypting") return "Local encryption"
  return "Preparing"
}
