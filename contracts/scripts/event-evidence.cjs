async function readContractEvents(contract, fromBlock, toBlock, chunkSize = 9_000) {
  const address = await contract.getAddress()
  const events = []
  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    const end = Math.min(toBlock, start + chunkSize - 1)
    const logs = await getLogsWithRetry(contract.runner.provider, { address, fromBlock: start, toBlock: end })
    for (const log of logs) {
      const parsed = contract.interface.parseLog(log)
      if (parsed) events.push({ ...log, name: parsed.name, args: parsed.args })
    }
  }
  return events
}

async function getLogsWithRetry(provider, filter) {
  let lastError
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await withTimeout(provider.getLogs(filter), 10_000, "event log request")
    } catch (error) {
      lastError = error
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, attempt * 750))
    }
  }
  throw lastError
}

function withTimeout(promise, milliseconds, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${milliseconds}ms`)), milliseconds)),
  ])
}

function eventsNamed(events, name) {
  return events.filter((event) => event.name === name)
}

module.exports = { eventsNamed, readContractEvents }
