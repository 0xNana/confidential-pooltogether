function buildTopUpPlan(accounts, targets) {
  if (!Array.isArray(accounts) || accounts.length === 0) throw new Error("at least one account is required")
  for (const [symbol, target] of Object.entries(targets)) assertAmount(`${symbol} target`, target)

  const seen = new Set()
  const plannedAccounts = accounts.map((account) => {
    const normalized = String(account.address).toLowerCase()
    if (seen.has(normalized)) throw new Error(`duplicate account address: ${account.address}`)
    seen.add(normalized)
    assertAmount("ETH balance", account.eth)
    assertAmount("USDT balance", account.usdt)
    assertAmount("USDC balance", account.usdc)
    return {
      address: account.address,
      eth: deficit(targets.eth, account.eth),
      usdt: deficit(targets.usdt, account.usdt),
      usdc: deficit(targets.usdc, account.usdc),
    }
  })

  return {
    accounts: plannedAccounts,
    totals: plannedAccounts.reduce((totals, account) => ({
      eth: totals.eth + account.eth,
      usdt: totals.usdt + account.usdt,
      usdc: totals.usdc + account.usdc,
    }), { eth: 0n, usdt: 0n, usdc: 0n }),
  }
}

function deficit(target, current) {
  return current >= target ? 0n : target - current
}

function assertAmount(label, value) {
  if (typeof value !== "bigint" || value < 0n) throw new Error(`${label} must be a non-negative bigint`)
}

module.exports = { buildTopUpPlan }
