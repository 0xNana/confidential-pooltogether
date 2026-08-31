import { describe, expect, it } from "vitest"
import { deriveDrawLifecycle, type DrawLifecycleState } from "./draw-lifecycle"

const current: DrawLifecycleState = {
  drawId: 4,
  status: 0,
  scheduledClose: 2_000,
  claimExpiresAt: 0,
  participantCount: 0,
  scanCursor: 0,
}

describe("deriveDrawLifecycle", () => {
  it("finalizes an expired current draw even when the period is empty", () => {
    expect(deriveDrawLifecycle(current, [], 1_999)).toMatchObject({ kind: "none", ready: false })
    expect(deriveDrawLifecycle(current, [], 2_000)).toMatchObject({
      kind: "close",
      drawId: 4,
      ready: true,
      label: "Finalize entry draw",
    })
  })

  it("targets a historical selecting draw explicitly", () => {
    const selecting = { ...current, drawId: 2, status: 1, participantCount: 25, scanCursor: 12 }
    expect(deriveDrawLifecycle(current, [selecting], 1_500)).toMatchObject({
      kind: "continue",
      drawId: 2,
      batchSize: 12,
      remaining: 13,
      completed: 12,
      total: 25,
    })
  })

  it("prioritizes opening the aligned entry period over historical scan work", () => {
    const selecting = { ...current, drawId: 2, status: 1, participantCount: 2 }
    expect(deriveDrawLifecycle(current, [selecting], 2_000)).toMatchObject({ kind: "close", drawId: 4 })
  })

  it("sweeps an expired historical prize into the already-open current draw", () => {
    const expired = { ...current, drawId: 1, status: 2, claimExpiresAt: 1_900 }
    expect(deriveDrawLifecycle(current, [expired], 1_900)).toMatchObject({
      kind: "sweep",
      drawId: 1,
      ready: true,
      label: "Sweep draw #1",
    })
  })
})
