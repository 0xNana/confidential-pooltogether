const { expect } = require("chai")
const {
  buildWeightedDepositPlan,
  validateDepositWindow,
  nextDelaySeconds,
  remainingDelayMilliseconds,
} = require("../scripts/test-account-deposit-plan.cjs")

describe("test-account deposit planner", function () {
  const accounts = Array.from({ length: 20 }, (_, offset) => ({
    index: offset + 1,
    address: `0x${String(offset + 1).padStart(40, "0")}`,
  }))

  it("assigns deterministic 50-to-1000 USDC weights and skips completed accounts", function () {
    const plan = buildWeightedDepositPlan(accounts, {
      completedAddresses: [accounts[1].address],
      unitAmount: 50_000_000n,
    })

    expect(plan.entries).to.have.length(19)
    expect(plan.entries[0]).to.deep.include({ index: 1, amount: 50_000_000n })
    expect(plan.entries[1]).to.deep.include({ index: 3, amount: 150_000_000n })
    expect(plan.entries.at(-1)).to.deep.include({ index: 20, amount: 1_000_000_000n })
    expect(plan.totalAmount).to.equal(10_400_000_000n)
  })

  it("rejects duplicate or malformed account sets", function () {
    const duplicate = accounts.map((account) => ({ ...account }))
    duplicate[19].address = duplicate[0].address
    expect(() => buildWeightedDepositPlan(duplicate)).to.throw("duplicate")
    expect(() => buildWeightedDepositPlan(accounts.slice(0, 19))).to.throw("exactly 20")
  })

  it("refuses closed, near-cutoff, changed, or over-capacity draws", function () {
    const safe = {
      expectedDrawId: 1,
      currentDrawId: 1,
      status: 0,
      now: 1_000,
      scheduledClose: 5_000,
      cutoffBufferSeconds: 1_800,
      participantCount: 1,
      pendingAccounts: 20,
      maxParticipants: 256,
    }
    expect(() => validateDepositWindow(safe)).not.to.throw()
    expect(() => validateDepositWindow({ ...safe, status: 1 })).to.throw("not open")
    expect(() => validateDepositWindow({ ...safe, scheduledClose: 2_799 })).to.throw("cutoff buffer")
    expect(() => validateDepositWindow({ ...safe, currentDrawId: 2 })).to.throw("changed")
    expect(() => validateDepositWindow({ ...safe, participantCount: 240 })).to.throw("capacity")
  })

  it("chooses an inclusive delay from a supplied random value", function () {
    expect(nextDelaySeconds(60, 180, () => 0)).to.equal(60)
    expect(nextDelaySeconds(60, 180, () => 1)).to.equal(180)
    expect(nextDelaySeconds(60, 180, () => 0.5)).to.equal(120)
  })

  it("preserves a checkpointed inter-account delay across process restarts", function () {
    expect(remainingDelayMilliseconds("2026-08-31T19:37:46.000Z", Date.parse("2026-08-31T19:36:46.000Z"))).to.equal(60_000)
    expect(remainingDelayMilliseconds("2026-08-31T19:37:46.000Z", Date.parse("2026-08-31T19:38:00.000Z"))).to.equal(0)
    expect(remainingDelayMilliseconds(null, Date.now())).to.equal(0)
  })
})
