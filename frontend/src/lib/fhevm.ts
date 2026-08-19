import { formatUnits, parseUnits } from "ethers"
import { ASSET_ADDRESS, TOKEN_DECIMALS, type Address } from "./contracts"

export type ConfidentialActionKind = "deposit" | "withdraw" | "previewPrize"
export const SEPOLIA_CUSDT: Address = ASSET_ADDRESS

export type ConfidentialActionPlan = {
  kind: ConfidentialActionKind
  amount: bigint
  account: Address
  encryptionTarget: Address
  stages: readonly ["encrypt", "prove", "submit", "confirm"]
}

export function buildConfidentialAction(input: {
  kind: ConfidentialActionKind
  amount: bigint
  poolAddress: Address
  account: Address
}): ConfidentialActionPlan {
  if (input.amount < 0n) throw new RangeError("Confidential amount cannot be negative")
  return {
    kind: input.kind,
    amount: input.amount,
    account: input.account,
    encryptionTarget: input.poolAddress,
    stages: ["encrypt", "prove", "submit", "confirm"],
  }
}

export function parseTokenAmount(value: string) {
  const normalized = value.trim()
  if (!normalized) throw new RangeError("Enter an amount.")
  const amount = parseUnits(normalized, TOKEN_DECIMALS)
  if (amount <= 0n) throw new RangeError("Amount must be greater than zero.")
  if (amount > 18_446_744_073_709_551_615n) throw new RangeError("Amount exceeds euint64 capacity.")
  return amount
}

export function formatTokenAmount(value: bigint, maximumFractionDigits = 2) {
  const numeric = Number(formatUnits(value, TOKEN_DECIMALS))
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(numeric)
}
