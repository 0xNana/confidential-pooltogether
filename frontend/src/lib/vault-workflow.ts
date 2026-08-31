export type VaultWorkflowState = {
  account: boolean
  correctChain: boolean
  permitReady: boolean
  isOperator: boolean
  principal?: bigint
  prize?: bigint
  currentDrawExpired: boolean
  hasSelectingDraw: boolean
  claimable: boolean
}

export type VaultWorkflowStep =
  | "connect"
  | "switch-network"
  | "authorize-private-reads"
  | "reveal-position"
  | "approve-operator"
  | "deposit"
  | "wait-for-close"
  | "close-draw"
  | "continue-selection"
  | "preview-prize"
  | "claim-prize"
  | "withdraw"
  | "wait-for-next-action"

export function deriveVaultWorkflowStep(state: VaultWorkflowState): VaultWorkflowStep {
  if (!state.account) return "connect"
  if (!state.correctChain) return "switch-network"
  if (state.currentDrawExpired) return "close-draw"
  if (state.hasSelectingDraw) return "continue-selection"
  if (!state.permitReady) return "authorize-private-reads"
  if (state.principal === undefined) return "reveal-position"
  if (state.claimable) {
    if (state.prize === undefined) return "preview-prize"
    if (state.prize > 0n) return "claim-prize"
    return (state.principal ?? 0n) > 0n ? "withdraw" : "wait-for-next-action"
  }
  if (!state.isOperator) return "approve-operator"
  if ((state.principal ?? 0n) === 0n) return "deposit"
  return "wait-for-close"
}
