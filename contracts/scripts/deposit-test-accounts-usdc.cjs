const fs = require("node:fs")
const path = require("node:path")
const hre = require("hardhat")
const { createInstance, SepoliaConfig } = require("@zama-fhe/relayer-sdk/node")
const { TOKENS } = require("./token-config.cjs")
const { retryOperation } = require("./retry-operation.cjs")
const {
  EXPECTED_ACCOUNT_COUNT,
  buildWeightedDepositPlan,
  nextDelaySeconds,
  remainingDelayMilliseconds,
  validateDepositWindow,
} = require("./test-account-deposit-plan.cjs")

const token = TOKENS.cUSDC
const deployment = require(`../deployments/${token.deploymentFile}`)
const EXECUTE = process.env.TEST_ACCOUNT_DEPOSITS_EXECUTE === "1"
const MIN_INTERVAL_SECONDS = integerSetting("TEST_ACCOUNT_DEPOSIT_MIN_INTERVAL_SECONDS", 60, 0, 300)
const MAX_INTERVAL_SECONDS = integerSetting("TEST_ACCOUNT_DEPOSIT_MAX_INTERVAL_SECONDS", 180, MIN_INTERVAL_SECONDS, 300)
const CUTOFF_BUFFER_SECONDS = integerSetting("TEST_ACCOUNT_DEPOSIT_CUTOFF_BUFFER_SECONDS", 1_800, 1_800, 86_400)
const workspaceDirectory = path.resolve(__dirname, "..", "..")
const accountsPath = path.join(workspaceDirectory, "internal-docs", "test-accounts.json")
const evidencePath = path.join(workspaceDirectory, "internal-docs", "test-account-usdc-deposit-evidence.json")

let fhevmPromise

async function main() {
  const network = await rpcRead(() => hre.ethers.provider.getNetwork())
  if (network.chainId !== 11155111n) throw new Error(`Expected Sepolia, received chain ${network.chainId}`)

  const privateAccounts = loadAndValidateAccounts()
  const pool = await hre.ethers.getContractAt("ConfidentialPrizePool", deployment.pool, hre.ethers.provider)
  const wrapper = new hre.ethers.Contract(token.asset, [
    "function underlying() view returns (address)",
    "function isOperator(address,address) view returns (bool)",
    "function setOperator(address,uint48)",
    "function wrap(address,uint256) returns (bytes32)",
  ], hre.ethers.provider)
  const underlying = new hre.ethers.Contract(token.underlying, [
    "function allowance(address,address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)",
    "function balanceOf(address) view returns (uint256)",
  ], hre.ethers.provider)

  const configuredUnderlying = await rpcRead(() => wrapper.underlying())
  if (!sameAddress(configuredUnderlying, token.underlying)) throw new Error("Official cUSDC wrapper/underlying mismatch")

  const evidence = loadEvidence()
  await reconcileEvidenceReceipts(evidence)
  const state = await readDrawState(pool)
  if (evidence.drawId !== null && evidence.drawId !== state.currentDrawId) {
    throw new Error(`Evidence is scoped to draw ${evidence.drawId}, but current draw is ${state.currentDrawId}`)
  }
  evidence.drawId = state.currentDrawId

  const completedAddresses = await completedDepositAddresses(pool, state.currentDrawId)
  const plan = buildWeightedDepositPlan(privateAccounts, { completedAddresses: [...completedAddresses] })
  validateDepositWindow({
    expectedDrawId: evidence.drawId,
    ...state,
    cutoffBufferSeconds: CUTOFF_BUFFER_SECONDS,
    pendingAccounts: plan.entries.length,
  })

  persistEvidence(evidence, plan.entries.length === 0 && evidence.verified?.allDepositsRecorded ? "complete" : "planned")
  console.log(JSON.stringify({
    stage: "deposit-plan",
    execute: EXECUTE,
    market: token.symbol,
    pool: deployment.pool,
    drawId: evidence.drawId,
    scheduledClose: new Date(state.scheduledClose * 1_000).toISOString(),
    participantCount: state.participantCount,
    pendingAccounts: plan.entries.length,
    completedAccounts: EXPECTED_ACCOUNT_COUNT - plan.entries.length,
    amountRange: "50-1000 USDC",
    pendingAmount: hre.ethers.formatUnits(plan.totalAmount, 6),
    intervalSeconds: [MIN_INTERVAL_SECONDS, MAX_INTERVAL_SECONDS],
    cutoffBufferSeconds: CUTOFF_BUFFER_SECONDS,
  }, null, 2))

  if (!EXECUTE) {
    console.log("Dry run only. Set TEST_ACCOUNT_DEPOSITS_EXECUTE=1 to submit the planned Sepolia transactions.")
    return
  }

  const resumeDelay = evidence.accounts.reduce((remaining, account) => (
    Math.max(remaining, remainingDelayMilliseconds(account.nextEligibleAt))
  ), 0)
  if (resumeDelay > 0) {
    console.log(JSON.stringify({
      stage: "resume-deposit-interval",
      delaySeconds: Math.ceil(resumeDelay / 1_000),
      nextEligibleAt: new Date(Date.now() + resumeDelay).toISOString(),
    }))
    await sleepInObservableChunks(resumeDelay)
  }

  for (let offset = 0; offset < plan.entries.length; offset += 1) {
    const entry = plan.entries[offset]
    const signer = privateAccounts.find((account) => sameAddress(account.address, entry.address)).signer.connect(hre.ethers.provider)
    const accountEvidence = accountRecord(evidence, entry)
    const refreshed = await readDrawState(pool)
    validateDepositWindow({
      expectedDrawId: evidence.drawId,
      ...refreshed,
      cutoffBufferSeconds: CUTOFF_BUFFER_SECONDS,
      pendingAccounts: plan.entries.length - offset,
    })

    console.log(JSON.stringify({
      stage: "account-start",
      index: entry.index,
      address: entry.address,
      amount: hre.ethers.formatUnits(entry.amount, 6),
      remaining: plan.entries.length - offset,
    }))
    await prepareAndDeposit({ accountEvidence, entry, evidence, pool, signer, underlying, wrapper })

    if (offset < plan.entries.length - 1) {
      const delaySeconds = nextDelaySeconds(MIN_INTERVAL_SECONDS, MAX_INTERVAL_SECONDS)
      accountEvidence.delayAfterSeconds = delaySeconds
      accountEvidence.nextEligibleAt = new Date(Date.now() + delaySeconds * 1_000).toISOString()
      persistEvidence(evidence, "waiting-between-deposits")
      console.log(JSON.stringify({ stage: "deposit-interval", afterIndex: entry.index, delaySeconds, nextEligibleAt: accountEvidence.nextEligibleAt }))
      await sleepInObservableChunks(delaySeconds * 1_000)
    }
  }

  const finalState = await readDrawState(pool)
  const finalCompleted = await completedDepositAddresses(pool, evidence.drawId)
  const allDeposited = privateAccounts.every((account) => finalCompleted.has(account.address.toLowerCase()))
  if (!allDeposited) throw new Error("Post-deposit event verification did not find all 20 accounts")

  evidence.completedAt = new Date().toISOString()
  evidence.verified = {
    accountCount: EXPECTED_ACCOUNT_COUNT,
    allDepositsRecorded: true,
    drawId: evidence.drawId,
    participantCount: finalState.participantCount,
  }
  persistEvidence(evidence, "complete")
  console.log(JSON.stringify({ stage: "complete", ...evidence.verified }))
}

async function prepareAndDeposit(context) {
  const { accountEvidence, entry, evidence, pool, signer, underlying, wrapper } = context
  const publicBalance = await rpcRead(() => underlying.balanceOf(entry.address))
  const wrapConfirmed = await recoverRecordedStage(accountEvidence, "wrap")
  if (!wrapConfirmed && publicBalance < entry.amount) {
    throw new Error(`Account ${entry.index} has insufficient public USDC for its planned deposit`)
  }

  if (!wrapConfirmed) {
    const allowance = await rpcRead(() => underlying.allowance(entry.address, token.asset))
    if (allowance < entry.amount) {
      await submitStage(evidence, accountEvidence, "approve-wrapper", () => underlying.connect(signer).approve(token.asset, entry.amount))
    }
    await submitStage(evidence, accountEvidence, "wrap", () => wrapper.connect(signer).wrap(entry.address, entry.amount))
  }

  const poolIsOperator = await rpcRead(() => wrapper.isOperator(entry.address, deployment.pool))
  if (!poolIsOperator) {
    const operatorUntil = BigInt(Math.floor(Date.now() / 1_000) + 365 * 86_400)
    await submitStage(evidence, accountEvidence, "approve-pool-operator", () => wrapper.connect(signer).setOperator(deployment.pool, operatorUntil))
  }

  if (await pool.isEntered(evidence.drawId, entry.address)) {
    accountEvidence.depositObservedAt = new Date().toISOString()
    persistEvidence(evidence, "deposit-observed")
    return
  }

  const encrypted = await encrypt64(deployment.pool, entry.address, entry.amount)
  await submitStage(evidence, accountEvidence, "deposit", () => pool.connect(signer).deposit(encrypted.handle, encrypted.proof))
  if (!await rpcRead(() => pool.isEntered(evidence.drawId, entry.address))) {
    throw new Error(`Deposit confirmation for account ${entry.index} did not enroll it in draw ${evidence.drawId}`)
  }
  accountEvidence.depositObservedAt = new Date().toISOString()
  persistEvidence(evidence, "deposit-confirmed")
}

async function submitStage(evidence, accountEvidence, stage, transactionFactory) {
  if (await recoverRecordedStage(accountEvidence, stage)) return accountEvidence.stages[stage]
  if (accountEvidence.stages[stage]?.transactionHash) {
    throw new Error(`${stage} has a submitted transaction with an uncertain receipt; refusing to resubmit`)
  }

  const transaction = await transactionFactory()
  accountEvidence.stages[stage] = {
    transactionHash: transaction.hash,
    submittedAt: new Date().toISOString(),
    url: `https://sepolia.etherscan.io/tx/${transaction.hash}`,
  }
  persistEvidence(evidence, `${stage}-submitted`)
  console.log(JSON.stringify({ stage: `${stage}-submitted`, index: accountEvidence.index, transactionHash: transaction.hash }))

  let receipt
  try {
    receipt = await withTimeout(transaction.wait(), 180_000, `${stage} receipt`)
  } catch {
    receipt = await recoverReceipt(transaction.hash)
  }
  if (!receipt || receipt.status !== 1) throw new Error(`${stage} transaction did not confirm successfully: ${transaction.hash}`)
  recordReceipt(accountEvidence.stages[stage], receipt)
  persistEvidence(evidence, `${stage}-confirmed`)
  console.log(JSON.stringify({ stage: `${stage}-confirmed`, index: accountEvidence.index, transactionHash: transaction.hash, blockNumber: receipt.blockNumber }))
  return accountEvidence.stages[stage]
}

async function recoverRecordedStage(accountEvidence, stage) {
  const recorded = accountEvidence.stages[stage]
  if (!recorded?.transactionHash) return false
  if (recorded.confirmedAt) return true
  const receipt = await rpcRead(() => hre.ethers.provider.getTransactionReceipt(recorded.transactionHash))
  if (!receipt) return false
  if (receipt.status !== 1) throw new Error(`Recorded ${stage} transaction failed: ${recorded.transactionHash}`)
  recordReceipt(recorded, receipt)
  return true
}

async function reconcileEvidenceReceipts(evidence) {
  let changed = false
  for (const account of evidence.accounts) {
    for (const [stage, record] of Object.entries(account.stages ?? {})) {
      if (!record?.transactionHash || record.confirmedAt) continue
      const receipt = await rpcRead(() => hre.ethers.provider.getTransactionReceipt(record.transactionHash))
      if (!receipt) continue
      if (receipt.status !== 1) throw new Error(`Recorded ${stage} transaction failed: ${record.transactionHash}`)
      recordReceipt(record, receipt)
      changed = true
    }
  }
  if (changed) persistEvidence(evidence, evidence.stage || "reconciled")
}

function recordReceipt(record, receipt) {
  record.confirmedAt = new Date().toISOString()
  record.blockNumber = receipt.blockNumber
  record.gasUsed = receipt.gasUsed.toString()
}

async function readDrawState(pool) {
  const latestBlockNumber = await rpcRead(() => hre.ethers.provider.getBlockNumber())
  const [latestBlock, currentDrawId, metadata, maxParticipants] = await Promise.all([
    rpcRead(() => hre.ethers.provider.getBlock(latestBlockNumber)),
    rpcRead(() => pool.currentDrawId()),
    rpcRead(() => pool.currentDrawMetadata()),
    rpcRead(() => pool.MAX_PARTICIPANTS()),
  ])
  if (!latestBlock) throw new Error("Latest Sepolia block is unavailable")
  return {
    currentDrawId: Number(currentDrawId),
    status: Number(metadata.status),
    now: latestBlock.timestamp,
    scheduledClose: Number(metadata.scheduledClose),
    participantCount: Number(metadata.participantCount),
    maxParticipants: Number(maxParticipants),
  }
}

async function completedDepositAddresses(pool, drawId) {
  const latestBlock = await rpcRead(() => hre.ethers.provider.getBlockNumber())
  const addresses = new Set()
  for (let start = deployment.deploymentBlock; start <= latestBlock; start += 9_000) {
    const end = Math.min(latestBlock, start + 8_999)
    const events = await rpcRead(() => pool.queryFilter(pool.filters.DepositRecorded(), start, end))
    for (const event of events) {
      if (Number(event.args.drawId) === drawId) addresses.add(event.args.account.toLowerCase())
    }
  }
  return addresses
}

function loadAndValidateAccounts() {
  if (!fs.existsSync(accountsPath)) throw new Error("internal-docs/test-accounts.json is missing")
  const document = JSON.parse(fs.readFileSync(accountsPath, "utf8"))
  if (document.network !== "sepolia" || !Array.isArray(document.accounts) || document.accounts.length !== EXPECTED_ACCOUNT_COUNT) {
    throw new Error("Expected exactly 20 Sepolia test accounts")
  }
  const accounts = document.accounts.map((account, offset) => {
    if (account.index !== offset + 1 || !/^0x[0-9a-fA-F]{64}$/.test(account.privateKey)) {
      throw new Error(`Invalid private test account at index ${offset + 1}`)
    }
    const signer = new hre.ethers.Wallet(account.privateKey)
    if (!sameAddress(signer.address, account.address)) throw new Error(`Private key/address mismatch at index ${offset + 1}`)
    return { index: account.index, address: signer.address, signer }
  })
  buildWeightedDepositPlan(accounts)
  return accounts
}

function loadEvidence() {
  if (!fs.existsSync(evidencePath)) {
    return {
      startedAt: new Date().toISOString(),
      network: "sepolia",
      market: token.symbol,
      pool: deployment.pool,
      drawId: null,
      accounts: [],
    }
  }
  const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"))
  if (evidence.network !== "sepolia" || evidence.market !== token.symbol || !sameAddress(evidence.pool, deployment.pool)) {
    throw new Error("Existing deposit evidence does not match this Sepolia cUSDC deployment")
  }
  if (!Array.isArray(evidence.accounts)) throw new Error("Existing deposit evidence has an invalid account list")
  return evidence
}

function accountRecord(evidence, entry) {
  let record = evidence.accounts.find((candidate) => sameAddress(candidate.address, entry.address))
  if (!record) {
    record = {
      index: entry.index,
      address: entry.address,
      amount: hre.ethers.formatUnits(entry.amount, 6),
      stages: {},
    }
    evidence.accounts.push(record)
  }
  record.stages ||= {}
  return record
}

function persistEvidence(evidence, stage) {
  evidence.stage = stage
  evidence.updatedAt = new Date().toISOString()
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", mode: 0o600 })
  fs.chmodSync(evidencePath, 0o600)
}

async function encrypt64(contractAddress, userAddress, amount) {
  return retryOperation(async () => {
    const input = (await getFhevm()).createEncryptedInput(contractAddress, userAddress)
    input.add64(amount)
    const encrypted = await withTimeout(input.encrypt(), 60_000, "FHE input proof")
    return { handle: encrypted.handles[0], proof: encrypted.inputProof }
  }, {
    attempts: 4,
    onRetry: async (error, attempt) => {
      fhevmPromise = undefined
      console.error(JSON.stringify({ stage: "encrypt-input-retry", attempt, error: messageOf(error) }))
    },
    delay: async (attempt) => sleepInObservableChunks(attempt * 3_000),
  })
}

function getFhevm() {
  if (!fhevmPromise) fhevmPromise = createFheInstance()
  return fhevmPromise
}

async function createFheInstance() {
  const rpcUrls = Array.from(new Set([
    process.env.SEPOLIA_FHE_RPC_URL,
    process.env.SEPOLIA_RPC_URL,
    "https://sepolia.gateway.tenderly.co",
    "https://eth-sepolia.api.onfinality.io/public",
  ].filter(Boolean)))
  let lastError
  for (const network of rpcUrls) {
    try {
      return await withTimeout(createInstance({ ...SepoliaConfig, network }), 45_000, "FHE initialization")
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(`Unable to initialize the Sepolia FHE client: ${messageOf(lastError)}`)
}

async function recoverReceipt(hash) {
  return retryOperation(async () => {
    const receipt = await hre.ethers.provider.getTransactionReceipt(hash)
    if (!receipt) throw new Error(`Receipt not yet available for ${hash}`)
    return receipt
  }, {
    attempts: 20,
    delay: async () => sleepInObservableChunks(3_000),
  })
}

async function rpcRead(operation) {
  return retryOperation(operation, {
    attempts: 5,
    delay: async (attempt) => sleepInObservableChunks(attempt * 1_500),
  })
}

async function sleepInObservableChunks(milliseconds) {
  let remaining = milliseconds
  while (remaining > 0) {
    const chunk = Math.min(30_000, remaining)
    await new Promise((resolve) => setTimeout(resolve, chunk))
    remaining -= chunk
  }
}

function integerSetting(name, fallback, minimum, maximum) {
  const value = process.env[name] === undefined ? fallback : Number(process.env[name])
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`)
  }
  return value
}

function sameAddress(left, right) {
  return String(left).toLowerCase() === String(right).toLowerCase()
}

function withTimeout(promise, milliseconds, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${milliseconds}ms`)), milliseconds)),
  ])
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

main().catch((error) => {
  console.error(messageOf(error))
  process.exitCode = 1
})
