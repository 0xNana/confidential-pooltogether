import { Eye, EyeOff, LoaderCircle, LockKeyhole } from "lucide-react"

type ConfidentialValueProps = {
  label: string
  value: string
  revealed: boolean
  loading?: boolean
  onReveal: () => void
  compact?: boolean
}

export function ConfidentialValue({
  label,
  value,
  revealed,
  loading = false,
  onReveal,
  compact = false,
}: ConfidentialValueProps) {
  return (
    <div className={`confidential-value${compact ? " compact" : ""}`}>
      <div>
        <span className="value-label"><LockKeyhole size={13} /> {label}</span>
        <div className="private-figure" aria-live="polite">
          {revealed ? (
            <strong>{value}</strong>
          ) : (
            <span className="cipher-bars" aria-label={`${label} is encrypted`}>
              <i /><i /><i /><i /><i />
            </span>
          )}
        </div>
      </div>
      <button
        className="reveal-button"
        type="button"
        onClick={onReveal}
        disabled={loading || revealed}
        aria-label={revealed ? `${label} revealed` : `Reveal ${label}`}
      >
        {loading ? <LoaderCircle className="spin" size={15} /> : revealed ? <EyeOff size={15} /> : <Eye size={15} />}
        <span>{loading ? "Decrypting" : revealed ? "Revealed" : "Reveal"}</span>
      </button>
    </div>
  )
}
