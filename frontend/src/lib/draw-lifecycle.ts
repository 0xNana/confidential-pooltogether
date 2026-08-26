export const MAX_SCAN_BATCH = 12

export type DrawLifecycleState = {
  drawId: number
  phase: number
  drawClosesAt: number
  claimClosesAt: number
  participantCount: number
  scanCursor: number
}

export type DrawLifecycleAction = {
  kind: "close" | "continue" | "open-next"
  label: string
  ready: boolean
  reason: string
  availableAt?: number
  batchSize?: number
  remaining?: number
  completed?: number
  total?: number
}

export function deriveDrawLifecycle(state: DrawLifecycleState, now: number): DrawLifecycleAction {
  if (state.phase === 1) {
    const total = Math.max(0, state.participantCount)
    const completed = Math.min(Math.max(0, state.scanCursor), total)
    const remaining = Math.max(0, total - completed)
    return {
      kind: "continue",
      label: "Continue selection",
      ready: remaining > 0,
      reason: remaining > 0
        ? `Process ${Math.min(MAX_SCAN_BATCH, remaining)} of ${remaining} remaining accounts.`
        : "Waiting for the completed selection state to confirm.",
      batchSize: Math.min(MAX_SCAN_BATCH, remaining),
      remaining,
      completed,
      total,
    }
  }

  if (state.phase === 2) {
    const ready = state.claimClosesAt > 0 && now >= state.claimClosesAt
    return {
      kind: "open-next",
      label: "Open next draw",
      ready,
      reason: ready ? "Roll any unclaimed prize forward and open the next draw." : "The claim window is still open.",
      availableAt: state.claimClosesAt || undefined,
    }
  }

  const deadlineReached = state.drawClosesAt > 0 && now >= state.drawClosesAt
  const hasParticipants = state.participantCount > 0
  return {
    kind: "close",
    label: "Close draw",
    ready: deadlineReached && hasParticipants,
    reason: !hasParticipants
      ? "A deposit is required before this draw can close."
      : deadlineReached
        ? "Freeze encrypted balances and start winner selection."
        : "The draw is still accepting deposits.",
    availableAt: state.drawClosesAt || undefined,
  }
}
