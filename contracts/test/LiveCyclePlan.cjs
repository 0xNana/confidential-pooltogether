const assert = require("node:assert/strict")
const { incompleteTasks, nextExecutableTask, unrecoverableReason, nonzeroClaimRisk } = require("../scripts/live-cycle-plan.cjs")

describe("live-cycle planner", function () {
  it("plans seeding and direct funding before an open draw can progress", function () {
    const tasks = incompleteTasks(state({ hasDeposit: false, hasPrizeFunding: false }))
    assert.deepEqual(tasks.map((task) => task.id), ["deposit", "fund-prize", "close-draw", "select-winner", "claim-prize", "withdraw-principal", "open-next-draw"])
    assert.equal(nextExecutableTask(tasks).id, "deposit")
  })

  it("waits for the draw deadline after seeding", function () {
    const tasks = incompleteTasks(state({ hasDeposit: true, hasPrizeFunding: true }))
    assert.equal(tasks[0].id, "close-draw")
    assert.equal(tasks[0].ready, false)
    assert.equal(nextExecutableTask(tasks), undefined)
  })

  it("progresses selection and then claim, withdrawal, and rollover", function () {
    const selecting = incompleteTasks(state({ phase: 1, hasDeposit: true, hasPrizeFunding: true }))
    assert.equal(nextExecutableTask(selecting).id, "select-winner")

    const claimable = incompleteTasks(state({ phase: 2, hasDeposit: true, hasPrizeFunding: true, claimClosesAt: 2_000 }))
    assert.deepEqual(claimable.map((task) => task.id), ["claim-prize", "withdraw-principal", "open-next-draw"])
    assert.equal(nextExecutableTask(claimable).id, "claim-prize")

    const readyToRoll = incompleteTasks(state({
      phase: 2,
      now: 2_000,
      claimClosesAt: 2_000,
      hasDeposit: true,
      hasPrizeFunding: true,
      hasClaim: true,
      hasWithdrawal: true,
    }))
    assert.equal(nextExecutableTask(readyToRoll).id, "open-next-draw")
  })

  it("reports a completed target draw after rollover", function () {
    const tasks = incompleteTasks(state({
      currentDrawId: 2,
      targetDrawId: 1,
      hasDeposit: true,
      hasPrizeFunding: true,
      hasClaim: true,
      hasWithdrawal: true,
      hasNextDraw: true,
    }))
    assert.deepEqual(tasks, [])
  })

  it("reports an expired unclaimed cycle as unrecoverable", function () {
    const expired = state({ phase: 2, now: 2_000, claimClosesAt: 2_000 })
    assert.match(unrecoverableReason(expired), /claim window expired/)

    const claimed = state({ phase: 2, now: 2_000, claimClosesAt: 2_000, hasClaim: true })
    assert.equal(unrecoverableReason(claimed), null)
  })

  it("repairs missing prize funding before selection or claim", function () {
    const selecting = incompleteTasks(state({ phase: 1, hasDeposit: true, participantCount: 1 }))
    assert.equal(nextExecutableTask(selecting).id, "fund-prize")

    const claimable = incompleteTasks(state({ phase: 2, hasDeposit: true, participantCount: 1, claimClosesAt: 2_000 }))
    assert.equal(nextExecutableTask(claimable).id, "fund-prize")
  })

  it("rejects claimable state that cannot guarantee a nonzero target claim", function () {
    const missingTargetDeposit = state({ phase: 2, participantCount: 1, claimClosesAt: 2_000 })
    assert.match(nonzeroClaimRisk(missingTargetDeposit), /no recorded deposit/)

    const multipleEntrants = state({ phase: 2, hasDeposit: true, participantCount: 2, claimClosesAt: 2_000 })
    assert.match(nonzeroClaimRisk(multipleEntrants), /expected one entrant/)

    const deterministic = state({ phase: 2, hasDeposit: true, hasPrizeFunding: true, participantCount: 1, claimClosesAt: 2_000 })
    assert.equal(nonzeroClaimRisk(deterministic), null)
  })
})

function state(overrides = {}) {
  return {
    phase: 0,
    currentDrawId: 1,
    targetDrawId: 1,
    now: 1_000,
    drawClosesAt: 1_500,
    claimClosesAt: 0,
    participantCount: 0,
    hasDeposit: false,
    hasPrizeFunding: false,
    hasClaim: false,
    hasWithdrawal: false,
    hasNextDraw: false,
    ...overrides,
  }
}
