export type BlockRange = {
  fromBlock: number
  toBlock: number
}

type RangeOptions = {
  chunkSize?: number
  maxLookback?: number
}

type FetchOptions = RangeOptions & {
  limit?: number
}

export function activityScanStartBlock(
  deploymentBlock: number | undefined,
  currentBlock: number,
  maxLookback = 5_000,
) {
  const recentStart = Math.max(0, currentBlock - Math.max(1, maxLookback) + 1)
  return deploymentBlock === undefined ? recentStart : Math.max(deploymentBlock, recentStart)
}

export function recentBlockRanges(
  deploymentBlock: number,
  currentBlock: number,
  options: RangeOptions = {},
): BlockRange[] {
  if (deploymentBlock > currentBlock) return []

  const chunkSize = Math.max(1, options.chunkSize ?? 500)
  const maxLookback = Math.max(1, options.maxLookback ?? 5_000)
  const oldestBlock = Math.max(deploymentBlock, currentBlock - maxLookback + 1)
  const ranges: BlockRange[] = []

  for (let toBlock = currentBlock; toBlock >= oldestBlock;) {
    const fromBlock = Math.max(oldestBlock, toBlock - chunkSize + 1)
    ranges.push({ fromBlock, toBlock })
    toBlock = fromBlock - 1
  }

  return ranges
}

export async function fetchRecentLogs<T>(
  getLogs: (range: BlockRange) => Promise<T[]>,
  deploymentBlock: number,
  currentBlock: number,
  options: FetchOptions = {},
) {
  const logs: T[] = []
  const limit = Math.max(1, options.limit ?? 7)

  for (const range of recentBlockRanges(deploymentBlock, currentBlock, options)) {
    try {
      logs.push(...await getLogs(range))
    } catch {
      return { logs, complete: false }
    }
    if (logs.length >= limit) break
  }

  return { logs, complete: true }
}
