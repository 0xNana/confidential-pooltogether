const assert = require("node:assert/strict")
const { retryOperation } = require("../scripts/retry-operation.cjs")

describe("retryOperation", function () {
  it("retries a transient operation in place until it succeeds", async function () {
    let calls = 0
    const retries = []

    const result = await retryOperation(async () => {
      calls += 1
      if (calls < 3) throw new Error(`transient-${calls}`)
      return "ok"
    }, {
      attempts: 3,
      delay: async () => {},
      onRetry: async (error, attempt) => retries.push({ message: error.message, attempt }),
    })

    assert.equal(result, "ok")
    assert.equal(calls, 3)
    assert.deepEqual(retries, [
      { message: "transient-1", attempt: 1 },
      { message: "transient-2", attempt: 2 },
    ])
  })

  it("rethrows the final error without retrying beyond the configured bound", async function () {
    let calls = 0
    const expected = new Error("still unavailable")

    await assert.rejects(retryOperation(async () => {
      calls += 1
      throw expected
    }, { attempts: 2, delay: async () => {} }), (error) => error === expected)

    assert.equal(calls, 2)
  })
})
