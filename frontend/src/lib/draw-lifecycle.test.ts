import { describe, expect, it } from "vitest"
import { deriveDrawLifecycle } from "./draw-lifecycle"

const baseState = {
  drawId: 4,
  phase: 0,
  phaseLabel: "Open",
  drawClosesAt: 2_000,
  claimClosesAt: 0,
  participantCount: 25,
  scanCursor: 0,
  claimable: false,
}

describe("deriveDrawLifecycle", () => {
  it("waits for the open draw deadline, then permits any wallet to close it", () => {
    expect(deriveDrawLifecycle(baseState, 1_999)).toMatchObject({
      kind: "close",
      ready: false,
      availableAt: 2_000,
    })
    expect(deriveDrawLifecycle(baseState, 2_000)).toMatchObject({
      kind: "close",
      ready: true,
      label: "Close draw",
    })
  })

  it("blocks an empty expired draw with an actionable reason", () => {
    expect(deriveDrawLifecycle({ ...baseState, participantCount: 0 }, 2_000)).toMatchObject({
      kind: "close",
      ready: false,
      reason: "A deposit is required before this draw can close.",
    })
  })

  it("advances selection in contract-sized batches and reports remaining work", () => {
    expect(deriveDrawLifecycle({ ...baseState, phase: 1, scanCursor: 12 }, 2_100)).toMatchObject({
      kind: "continue",
      ready: true,
      batchSize: 12,
      remaining: 13,
      completed: 12,
      total: 25,
    })
    expect(deriveDrawLifecycle({ ...baseState, phase: 1, scanCursor: 24 }, 2_100)).toMatchObject({
      batchSize: 1,
      remaining: 1,
    })
  })

  it("keeps the next draw gated until the claim deadline", () => {
    const claimable = { ...baseState, phase: 2, claimClosesAt: 3_000 }
    expect(deriveDrawLifecycle(claimable, 2_999)).toMatchObject({ kind: "open-next", ready: false, availableAt: 3_000 })
    expect(deriveDrawLifecycle(claimable, 3_000)).toMatchObject({
      kind: "open-next",
      ready: true,
      label: "Open next draw",
    })
  })
})
