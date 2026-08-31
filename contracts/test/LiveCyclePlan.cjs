const assert = require("node:assert/strict")
const { incompleteTasks, nextExecutableTask, unrecoverableReason, nonzeroClaimRisk } = require("../scripts/live-cycle-plan.cjs")

describe("live-cycle planner", function () {
  it("plans seeding and funding before the entry cutoff", function () {
    const tasks = incompleteTasks(state())
    assert.deepEqual(tasks.map((task) => task.id), ["deposit", "fund-prize", "close-draw", "claim-prize", "withdraw-principal"])
    assert.equal(nextExecutableTask(tasks).id, "deposit")
  })

  it("waits for the fixed cutoff after seeding", function () {
    const tasks = incompleteTasks(state({ hasDeposit: true, hasPrizeFunding: true, participantCount: 1 }))
    assert.equal(tasks[0].id, "close-draw")
    assert.equal(tasks[0].ready, false)
  })

  it("selects and claims a historical draw while the next draw is open", function () {
    const selecting = incompleteTasks(state({
      currentDrawId: 2,
      targetStatus: 1,
      hasDeposit: true,
      hasPrizeFunding: true,
      participantCount: 1,
    }))
    assert.equal(nextExecutableTask(selecting).id, "select-winner")

    const claimable = incompleteTasks(state({
      currentDrawId: 2,
      targetStatus: 2,
      claimExpiresAt: 2_000,
      hasDeposit: true,
      hasPrizeFunding: true,
      participantCount: 1,
    }))
    assert.equal(nextExecutableTask(claimable).id, "claim-prize")
  })

  it("completes without waiting for the claim deadline or opening another draw", function () {
    const tasks = incompleteTasks(state({
      currentDrawId: 2,
      targetStatus: 2,
      hasDeposit: true,
      hasPrizeFunding: true,
      participantCount: 1,
      hasClaim: true,
      hasWithdrawal: true,
    }))
    assert.deepEqual(tasks, [])
  })

  it("reports an expired unclaimed cycle as unrecoverable", function () {
    assert.match(unrecoverableReason(state({ targetStatus: 3, claimExpiresAt: 2_000 })), /claim window expired/)
    assert.equal(unrecoverableReason(state({ targetStatus: 3, claimExpiresAt: 2_000, hasClaim: true, hasPrizeFunding: true })), null)
  })

  it("rejects late funding repair after finalization", function () {
    assert.match(unrecoverableReason(state({ targetStatus: 1, hasDeposit: true, participantCount: 1 })), /finalized before its prize/)
  })

  it("rejects a target that cannot guarantee a nonzero single-entrant claim", function () {
    assert.match(nonzeroClaimRisk(state({ targetStatus: 2, currentDrawId: 2, participantCount: 1 })), /no recorded deposit/)
    assert.match(nonzeroClaimRisk(state({ targetStatus: 2, currentDrawId: 2, hasDeposit: true, participantCount: 2 })), /expected one entrant/)
    assert.equal(nonzeroClaimRisk(state({ targetStatus: 2, currentDrawId: 2, hasDeposit: true, hasPrizeFunding: true, participantCount: 1 })), null)
  })
})

function state(overrides = {}) {
  return {
    targetStatus: 0,
    currentDrawId: 1,
    targetDrawId: 1,
    now: 1_000,
    scheduledClose: 1_500,
    claimExpiresAt: 0,
    participantCount: 0,
    hasDeposit: false,
    hasPrizeFunding: false,
    hasClaim: false,
    hasWithdrawal: false,
    ...overrides,
  }
}
