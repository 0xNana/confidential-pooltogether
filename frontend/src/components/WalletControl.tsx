import { ChevronDown, CircleAlert, LogOut, Network, ShieldCheck, Wallet } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { ConfidentialPoolTogetherModel } from "../hooks/useConfidentialPoolTogether"

type WalletControlProps = Pick<
  ConfidentialPoolTogetherModel,
  "account" | "correctChain" | "walletAvailable" | "permitReady" | "relayerStatus" | "connect" | "disconnect" | "switchNetwork"
>

export function WalletControl(props: WalletControlProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [open])

  if (!props.account) {
    return (
      <button className="button button-ink wallet-trigger" type="button" onClick={() => void props.connect()} data-testid="connect-wallet">
        <Wallet size={16} /> {props.walletAvailable ? "Connect wallet" : "Wallet required"}
      </button>
    )
  }

  if (!props.correctChain) {
    return (
      <button className="button button-warning" type="button" onClick={() => void props.switchNetwork()}>
        <CircleAlert size={16} /> Switch to Sepolia
      </button>
    )
  }

  return (
    <div className="wallet-menu" ref={menuRef}>
      <button className="button button-ink wallet-trigger" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} data-testid="wallet-menu-trigger">
        <span className="wallet-identicon" aria-hidden="true" />
        {shortAddress(props.account)} <ChevronDown size={14} />
      </button>
      {open && (
        <div className="wallet-popover">
          <div className="wallet-popover-address">
            <small>Connected account</small>
            <strong className="mono">{props.account}</strong>
          </div>
          <dl>
            <div><dt><Network size={14} /> Network</dt><dd>Sepolia</dd></div>
            <div><dt><ShieldCheck size={14} /> Private session</dt><dd>{props.permitReady ? "Authorized" : "Locked"}</dd></div>
            <div><dt>Relayer</dt><dd className={`status-text ${props.relayerStatus}`}>{relayerLabel(props.relayerStatus)}</dd></div>
          </dl>
          <button type="button" className="wallet-disconnect" onClick={() => { props.disconnect(); setOpen(false) }}>
            <LogOut size={14} /> Forget session
          </button>
        </div>
      )}
    </div>
  )
}

function relayerLabel(status: WalletControlProps["relayerStatus"]) {
  if (status === "ready") return "Ready"
  return "Standby"
}

function shortAddress(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}
