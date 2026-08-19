import { describe, expect, it } from "vitest"
import { fetchRecentLogs, recentBlockRanges } from "./rpc-logs"

describe("recentBlockRanges", () => {
  it("splits a bounded lookback into newest-first RPC ranges", () => {
    expect(recentBlockRanges(1_000, 12_000, { chunkSize: 2_000, maxLookback: 5_000 })).toEqual([
      { fromBlock: 10_001, toBlock: 12_000 },
      { fromBlock: 8_001, toBlock: 10_000 },
      { fromBlock: 7_001, toBlock: 8_000 },
    ])
  })

  it("never scans below the deployment block", () => {
    expect(recentBlockRanges(11_500, 12_000, { chunkSize: 2_000, maxLookback: 5_000 })).toEqual([
      { fromBlock: 11_500, toBlock: 12_000 },
    ])
  })

  it("returns no ranges when the deployment is ahead of the current block", () => {
    expect(recentBlockRanges(12_001, 12_000)).toEqual([])
  })

  it("returns partial activity instead of rejecting when an RPC range times out", async () => {
    let calls = 0
    const result = await fetchRecentLogs(async ({ fromBlock }) => {
      calls += 1
      if (calls === 2) throw new Error("request timed out")
      return [`event-${fromBlock}`]
    }, 1_000, 3_000, { chunkSize: 500, maxLookback: 2_000, limit: 7 })

    expect(result).toEqual({ logs: ["event-2501"], complete: false })
  })

  it("stops scanning once enough recent events have been found", async () => {
    const ranges: Array<{ fromBlock: number; toBlock: number }> = []
    const result = await fetchRecentLogs(async (range) => {
      ranges.push(range)
      return ["a", "b"]
    }, 1_000, 3_000, { chunkSize: 500, maxLookback: 2_000, limit: 2 })

    expect(ranges).toEqual([{ fromBlock: 2_501, toBlock: 3_000 }])
    expect(result.complete).toBe(true)
  })
})
