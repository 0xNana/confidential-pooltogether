const { getAddress, isAddress } = require("ethers")

const EXPECTED_ACCOUNT_COUNT = 20
const DEFAULT_UNIT_AMOUNT = 50_000_000n

function buildWeightedDepositPlan(accounts, options = {}) {
  if (!Array.isArray(accounts) || accounts.length !== EXPECTED_ACCOUNT_COUNT) {
    throw new Error(`Expected exactly ${EXPECTED_ACCOUNT_COUNT} test accounts`)
  }

  const normalized = accounts.map((account, offset) => {
    if (account.index !== offset + 1 || !isAddress(account.address)) {
      throw new Error(`Invalid test account at index ${offset + 1}`)
    }
    return { index: account.index, address: getAddress(account.address) }
  })
  if (new Set(normalized.map((account) => account.address.toLowerCase())).size !== normalized.length) {
    throw new Error("Test-account file contains duplicate addresses")
  }

  const unitAmount = options.unitAmount ?? DEFAULT_UNIT_AMOUNT
  if (typeof unitAmount !== "bigint" || unitAmount <= 0n) throw new Error("unitAmount must be a positive bigint")
  const completed = new Set((options.completedAddresses ?? []).map((address) => getAddress(address).toLowerCase()))
  const entries = normalized
    .filter((account) => !completed.has(account.address.toLowerCase()))
    .map((account) => ({ ...account, amount: unitAmount * BigInt(account.index) }))

  return {
    entries,
    totalAmount: entries.reduce((total, entry) => total + entry.amount, 0n),
  }
}

function validateDepositWindow(context) {
  if (context.currentDrawId !== context.expectedDrawId) throw new Error("Current draw changed during the deposit run")
  if (context.status !== 0) throw new Error("Current draw is not open")
  if (context.scheduledClose - context.now < context.cutoffBufferSeconds) {
    throw new Error("Current draw is inside the configured cutoff buffer")
  }
  if (context.participantCount + context.pendingAccounts > context.maxParticipants) {
    throw new Error("Pending deposits would exceed draw participant capacity")
  }
}

function nextDelaySeconds(minimum, maximum, random = Math.random) {
  if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum < 0 || maximum < minimum) {
    throw new Error("Invalid delay range")
  }
  const sample = Math.min(1, Math.max(0, Number(random())))
  return minimum + Math.floor(sample * (maximum - minimum))
}

function remainingDelayMilliseconds(nextEligibleAt, nowMilliseconds = Date.now()) {
  if (!nextEligibleAt) return 0
  const eligibleAt = Date.parse(nextEligibleAt)
  if (!Number.isFinite(eligibleAt)) throw new Error("Invalid checkpointed nextEligibleAt timestamp")
  return Math.max(0, eligibleAt - nowMilliseconds)
}

module.exports = {
  DEFAULT_UNIT_AMOUNT,
  EXPECTED_ACCOUNT_COUNT,
  buildWeightedDepositPlan,
  nextDelaySeconds,
  remainingDelayMilliseconds,
  validateDepositWindow,
}
