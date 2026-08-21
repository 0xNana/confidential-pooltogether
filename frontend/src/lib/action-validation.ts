import { parseTokenAmount } from "./fhevm"

export type VaultActionKind = "deposit" | "withdraw"

export function validateActionAmount(kind: VaultActionKind, value: string, available?: bigint) {
  if (!value.trim()) return "Enter an amount"

  let amount: bigint
  try {
    amount = parseTokenAmount(value)
  } catch {
    return "Enter a valid token amount"
  }

  if (available === undefined) {
    return kind === "deposit"
      ? "Reveal your private wallet balance first"
      : "Reveal your deposited principal first"
  }

  if (amount > available) {
    return kind === "deposit"
      ? "Amount exceeds your private wallet balance"
      : "Amount exceeds your deposited principal"
  }

  return undefined
}
