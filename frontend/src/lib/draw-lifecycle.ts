export const MAX_SCAN_BATCH = 12

export type DrawLifecycleState = {
  drawId: number
  status: number
  scheduledClose: number
  claimExpiresAt: number
  participantCount: number
  scanCursor: number
}

export type DrawLifecycleAction = {
  kind: "close" | "continue" | "sweep" | "none"
  drawId?: number
  label: string
  ready: boolean
  reason: string
  availableAt?: number
  batchSize?: number
  remaining?: number
  completed?: number
  total?: number
}

export function deriveDrawLifecycle(
  currentDraw: DrawLifecycleState,
  historicalDraws: DrawLifecycleState[],
  now: number,
): DrawLifecycleAction {
  if (currentDraw.status === 0 && currentDraw.scheduledClose > 0 && now >= currentDraw.scheduledClose) {
    return {
      kind: "close",
      drawId: currentDraw.drawId,
      label: "Finalize entry draw",
      ready: true,
      reason: "Freeze this period and open the currently aligned entry draw.",
      availableAt: currentDraw.scheduledClose,
    }
  }

  const selecting = [...historicalDraws]
    .filter((draw) => draw.status === 1)
    .sort((a, b) => a.drawId - b.drawId)[0]
  if (selecting) {
    const total = Math.max(0, selecting.participantCount)
    const completed = Math.min(Math.max(0, selecting.scanCursor), total)
    const remaining = Math.max(0, total - completed)
    return {
      kind: "continue",
      drawId: selecting.drawId,
      label: `Continue draw #${selecting.drawId}`,
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

  const expired = [...historicalDraws]
    .filter((draw) => draw.status === 3 || (draw.status === 2 && draw.claimExpiresAt > 0 && now >= draw.claimExpiresAt))
    .sort((a, b) => a.drawId - b.drawId)[0]
  if (expired) {
    return {
      kind: "sweep",
      drawId: expired.drawId,
      label: `Sweep draw #${expired.drawId}`,
      ready: true,
      reason: "Move its encrypted remainder into the current open draw.",
      availableAt: expired.claimExpiresAt,
    }
  }

  const nextClaimExpiry = historicalDraws
    .filter((draw) => draw.status === 2 && draw.claimExpiresAt > now)
    .reduce<number | undefined>((soonest, draw) => soonest === undefined ? draw.claimExpiresAt : Math.min(soonest, draw.claimExpiresAt), undefined)
  return {
    kind: "none",
    label: "Draws are progressing",
    ready: false,
    reason: currentDraw.scheduledClose > now
      ? "The current draw is accepting entries; historical claims remain independent."
      : "Refresh to discover the next permissionless action.",
    availableAt: (nextClaimExpiry ?? currentDraw.scheduledClose) || undefined,
  }
}
