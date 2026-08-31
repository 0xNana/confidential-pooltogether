const assert = require("node:assert/strict")
const { buildTopUpPlan } = require("../scripts/test-account-funding-plan.cjs")

describe("test-account funding planner", function () {
  it("tops accounts up to targets without overfunding existing balances", function () {
    const plan = buildTopUpPlan([
      { address: "0x1111111111111111111111111111111111111111", eth: 0n, usdt: 250n, usdc: 1_000n },
      { address: "0x2222222222222222222222222222222222222222", eth: 100n, usdt: 1_500n, usdc: 0n },
    ], { eth: 100n, usdt: 1_000n, usdc: 1_000n })

    assert.deepEqual(plan.accounts, [
      { address: "0x1111111111111111111111111111111111111111", eth: 100n, usdt: 750n, usdc: 0n },
      { address: "0x2222222222222222222222222222222222222222", eth: 0n, usdt: 0n, usdc: 1_000n },
    ])
    assert.deepEqual(plan.totals, { eth: 100n, usdt: 750n, usdc: 1_000n })
  })

  it("rejects duplicate account addresses", function () {
    const duplicate = "0x3333333333333333333333333333333333333333"
    assert.throws(() => buildTopUpPlan([
      { address: duplicate, eth: 0n, usdt: 0n, usdc: 0n },
      { address: duplicate.toUpperCase(), eth: 0n, usdt: 0n, usdc: 0n },
    ], { eth: 1n, usdt: 1n, usdc: 1n }), /duplicate/i)
  })
})
