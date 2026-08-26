const fs = require("node:fs")
const path = require("node:path")
const hre = require("hardhat")
const { createInstance, SepoliaConfig } = require("@zama-fhe/relayer-sdk/node")
const { TOKENS } = require("./token-config.cjs")
const { eventsNamed, readContractEvents } = require("./event-evidence.cjs")
const { incompleteTasks, nextExecutableTask, unrecoverableReason, nonzeroClaimRisk } = require("./live-cycle-plan.cjs")

const CHAIN_ID = 11155111
const EXECUTE = process.env.LIVE_CYCLE_EXECUTE === "1"
const POOL_PRINCIPAL = hre.ethers.parseUnits(process.env.LIVE_CYCLE_POOL_PRINCIPAL || "1000", 6)
const DIRECT_PRIZE = hre.ethers.parseUnits(process.env.LIVE_CYCLE_DIRECT_PRIZE || "29.5", 6)
const PUBLIC_RPC_URLS = Array.from(new Set([
  ...(process.env.PUBLIC_SEPOLIA_RPC_URLS || "").split(",").map((url) => url.trim()).filter(Boolean),
  "https://eth-sepolia.api.onfinality.io/public",
  "https://ethereum-sepolia-rpc.publicnode.com",
  "https://api.zan.top/eth-sepolia",
  "https://1rpc.io/sepolia",
  "https://sepolia.gateway.tenderly.co",
]))
const MARKET_SYMBOLS = (process.env.LIVE_CYCLE_MARKETS || "cUSDT,cUSDC")
  .split(",")
  .map((symbol) => symbol.trim())
  .filter(Boolean)

let fhevmPromise
let activePublicRpcUrls = PUBLIC_RPC_URLS

class LiveCycleStateError extends Error {}

async function main() {
  validateConfiguration()
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY || process.env.DEPLOYER_PRIVAKE_KEY
  if (EXECUTE && !privateKey) throw new Error("DEPLOYER_PRIVATE_KEY is required when LIVE_CYCLE_EXECUTE=1")
  const providers = await connectPublicProviders()
  const failures = []

  console.log(JSON.stringify({
    stage: "live-cycle-start",
    execute: EXECUTE,
    signer: privateKey ? new hre.ethers.Wallet(privateKey).address : null,
    markets: MARKET_SYMBOLS,
    rpcOrigins: providers.map((provider) => provider.rpcOrigin),
  }))

  for (const symbol of MARKET_SYMBOLS) {
    const providerErrors = []
    let complete = false
    for (const provider of providers) {
      const signer = privateKey ? new hre.ethers.Wallet(privateKey, provider) : null
      try {
        await runMarket(symbol, provider, signer)
        complete = true
        break
      } catch (error) {
        if (error instanceof LiveCycleStateError) {
          providerErrors.push({ rpcOrigin: provider.rpcOrigin, error: messageOf(error) })
          break
        }
        providerErrors.push({ rpcOrigin: provider.rpcOrigin, error: messageOf(error) })
        console.error(JSON.stringify({ stage: "market-rpc-retry", market: symbol, rpcOrigin: provider.rpcOrigin, error: messageOf(error) }))
      }
    }
    if (!complete) {
      failures.push({ market: symbol, providers: providerErrors })
      console.error(JSON.stringify({ stage: "market-failed", market: symbol, providers: providerErrors }))
    }
  }

  if (failures.length > 0) throw new Error(`Live-cycle failures: ${JSON.stringify(failures)}`)
}

async function runMarket(symbol, provider, signer) {
  const token = TOKENS[symbol]
  if (!token) throw new Error(`Unsupported market ${symbol}`)
  const poolDeployment = loadDeployment(token.deploymentFile)
  const vaultDeployment = loadDeployment(token.vaultDeploymentFile)
  const runner = signer || provider
  const pool = await hre.ethers.getContractAt("ConfidentialPrizePool", poolDeployment.pool, runner)
  const participantAddress = await withTimeout(pool.owner(), 15_000, `${symbol} pool owner`)
  if (EXECUTE && !sameAddress(participantAddress, signer.address)) {
    throw new LiveCycleStateError(`Configured signer is not the onchain ${symbol} pool owner`)
  }
  const underlying = new hre.ethers.Contract(token.underlying, [
    "function mint(address,uint256) returns (bool)",
    "function approve(address,uint256) returns (bool)",
    "function allowance(address,address) view returns (uint256)",
  ], runner)
  const wrapper = new hre.ethers.Contract(token.asset, [
    "function wrap(address,uint256) returns (bytes32)",
    "function isOperator(address,address) view returns (bool)",
    "function setOperator(address,uint48)",
  ], runner)
  const submitted = []

  for (let iteration = 0; iteration < 12; iteration += 1) {
    const state = await readState({ pool, poolDeployment, provider, participantAddress })
    const terminalFailure = unrecoverableReason(state)
    if (terminalFailure) throw new LiveCycleStateError(terminalFailure)
    const claimRisk = nonzeroClaimRisk(state)
    if (claimRisk) throw new LiveCycleStateError(claimRisk)
    const tasks = incompleteTasks(state)
    await writeEvidence({ symbol, token, poolDeployment, vaultDeployment, state, tasks, submitted, provider })

    console.log(JSON.stringify({
      stage: "market-plan",
      market: symbol,
      execute: EXECUTE,
      drawId: state.currentDrawId,
      targetDrawId: state.targetDrawId,
      phase: state.phase,
      participantCount: state.participantCount,
      incompleteTasks: tasks,
    }, null, 2))

    if (tasks.length === 0) {
      console.log(JSON.stringify({ stage: "market-complete", market: symbol, targetDrawId: state.targetDrawId }))
      return
    }
    const nextTask = nextExecutableTask(tasks)
    if (!EXECUTE || !nextTask) {
      console.log(JSON.stringify({
        stage: nextTask ? "dry-run" : "waiting",
        market: symbol,
        nextTask: nextTask?.id || tasks[0].id,
        blockedBy: nextTask ? "set LIVE_CYCLE_EXECUTE=1" : tasks[0].blockedBy,
      }))
      return
    }

    await executeTask({
      taskId: nextTask.id,
      state,
      pool,
      underlying,
      wrapper,
      token,
      provider,
      signer,
      submitted,
    })
    await sleep(1_500)
  }
  throw new Error(`${symbol} exceeded the bounded live-cycle action count`)
}

async function executeTask(context) {
  const { taskId, state, pool, underlying, wrapper, token, provider, signer, submitted } = context
  if (taskId === "deposit") {
    await acquireConfidentialFunds({ amount: POOL_PRINCIPAL, operator: await pool.getAddress(), underlying, wrapper, token, provider, signer, submitted })
    const encrypted = await encrypt64(await getFhevm(), await pool.getAddress(), signer.address, POOL_PRINCIPAL)
    submitted.push(await send("pool-deposit", pool.deposit(encrypted.handle, encrypted.proof), provider))
    return
  }
  if (taskId === "fund-prize") {
    await acquireConfidentialFunds({ amount: DIRECT_PRIZE, operator: await pool.getAddress(), underlying, wrapper, token, provider, signer, submitted })
    const encrypted = await encrypt64(await getFhevm(), await pool.getAddress(), signer.address, DIRECT_PRIZE)
    submitted.push(await send("direct-prize-funding", pool.fundPrize(encrypted.handle, encrypted.proof), provider))
    return
  }
  if (taskId === "close-draw") {
    submitted.push(await send("close-draw", pool.closeDraw(), provider))
    return
  }
  if (taskId === "select-winner") {
    const maxBatch = await pool.MAX_SCAN_BATCH()
    submitted.push(await send("continue-selection", pool.continueSelection(maxBatch), provider))
    return
  }
  if (taskId === "claim-prize") {
    submitted.push(await send("preview-prize", pool.previewPrize(state.targetDrawId), provider))
    submitted.push(await send("claim-prize", pool.claimPrize(state.targetDrawId), provider))
    return
  }
  if (taskId === "withdraw-principal") {
    const encrypted = await encrypt64(await getFhevm(), await pool.getAddress(), signer.address, POOL_PRINCIPAL)
    submitted.push(await send("withdraw-principal", pool.withdraw(encrypted.handle, encrypted.proof), provider))
    return
  }
  if (taskId === "open-next-draw") {
    submitted.push(await send("open-next-draw", pool.openNextDraw(), provider))
    return
  }
  throw new Error(`Unknown live-cycle task ${taskId}`)
}

async function acquireConfidentialFunds(context) {
  const { amount, operator, underlying, wrapper, token, provider, signer, submitted } = context
  submitted.push(await send("mint-underlying", underlying.mint(signer.address, amount), provider))
  const allowance = await underlying.allowance(signer.address, token.asset)
  if (allowance < amount) {
    submitted.push(await send("approve-wrapper", underlying.approve(token.asset, amount), provider))
  }
  submitted.push(await send("wrap-confidential", wrapper.wrap(signer.address, amount), provider))
  if (!await wrapper.isOperator(signer.address, operator)) {
    const operatorUntil = Math.floor(Date.now() / 1000) + 365 * 86_400
    submitted.push(await send("approve-pool-operator", wrapper.setOperator(operator, operatorUntil), provider))
  }
}

async function readState(context) {
  const { pool, poolDeployment, provider, participantAddress } = context
  const latestBlock = await withTimeout(provider.getBlockNumber(), 15_000, "latest block")
  const latestBlockData = await withTimeout(provider.getBlock(latestBlock), 15_000, "latest block data")
  if (!latestBlockData) throw new Error("Latest Sepolia block is unavailable")
  const startBlock = poolDeployment.deploymentBlock ?? Math.max(0, latestBlock - 50_000)
  const [contractState, events] = await Promise.all([
    withTimeout(Promise.all([
      pool.drawId(),
      pool.phase(),
      pool.drawClosesAt(),
      pool.participantCount(),
    ]), 20_000, "pool state reads"),
    readContractEvents(pool, startBlock, latestBlock),
  ])
  const [currentDrawIdValue, phaseValue, drawClosesAtValue, participantCountValue] = contractState
  const currentDrawId = Number(currentDrawIdValue)
  const deposits = eventsNamed(events, "DepositRecorded").filter((event) => sameAddress(event.args.account, participantAddress))
  const targetDrawId = deposits.length > 0 ? Number(deposits[0].args.drawId) : currentDrawId
  const drawEvents = (name) => eventsNamed(events, name).filter((event) => eventDrawId(event) === targetDrawId)
  const claimClosesAt = Number(await withTimeout(pool.drawClaimClosesAt(targetDrawId), 15_000, "claim deadline"))
  const nextDraws = eventsNamed(events, "DrawOpened").filter((event) => Number(event.args.drawId) > targetDrawId)

  return {
    phase: Number(phaseValue),
    currentDrawId,
    targetDrawId,
    now: latestBlockData.timestamp,
    drawClosesAt: Number(drawClosesAtValue),
    claimClosesAt,
    participantCount: Number(participantCountValue),
    hasDeposit: deposits.length > 0,
    hasPrizeFunding: drawEvents("PrizeFunded").length > 0,
    hasClaim: drawEvents("PrizeClaimAttempted").some((event) => sameAddress(event.args.account, participantAddress)),
    hasWithdrawal: drawEvents("WithdrawalRecorded").some((event) => sameAddress(event.args.account, participantAddress)),
    hasNextDraw: nextDraws.length > 0,
    events,
  }
}

async function connectPublicProviders() {
  const poolRanges = MARKET_SYMBOLS.map((symbol) => {
    const deployment = loadDeployment(TOKENS[symbol].deploymentFile)
    return { address: deployment.pool, fromBlock: deployment.deploymentBlock }
  })
  const probes = await Promise.all(PUBLIC_RPC_URLS.map((rpcUrl) => probePublicProvider(rpcUrl, poolRanges)))
  const healthy = probes.filter((result) => result.provider).sort((left, right) => left.latencyMs - right.latencyMs)
  if (healthy.length === 0) {
    const errors = probes.map((result) => `${result.rpcOrigin}: ${result.error}`).join("; ")
    throw new Error(`No public Sepolia RPC passed chain and deployment-log checks: ${errors}`)
  }

  console.log(JSON.stringify({
    stage: "public-rpc-pool-ready",
    rpcOrigins: healthy.map((result) => result.rpcOrigin),
    latestBlock: Math.max(...healthy.map((result) => result.latestBlock)),
  }))
  activePublicRpcUrls = healthy.map((result) => result.rpcUrl)
  return healthy.map((result) => result.provider)
}

async function probePublicProvider(rpcUrl, poolRanges) {
  const rpcOrigin = originOf(rpcUrl)
  const startedAt = Date.now()
  try {
    const provider = new hre.ethers.JsonRpcProvider(rpcUrl, CHAIN_ID, { staticNetwork: true })
    const network = await withTimeout(provider.getNetwork(), 10_000, "network check")
    if (Number(network.chainId) !== CHAIN_ID) throw new Error(`unexpected chain ${network.chainId}`)
    const latestBlock = await withTimeout(provider.getBlockNumber(), 10_000, "block check")
    for (const range of poolRanges) {
      const fromBlock = range.fromBlock ?? Math.max(0, latestBlock - 10_000)
      await withTimeout(provider.getLogs({ address: range.address, fromBlock, toBlock: latestBlock }), 15_000, "deployment log check")
    }
    provider.rpcOrigin = rpcOrigin
    console.log(JSON.stringify({ stage: "public-rpc-ready", rpcOrigin, latestBlock }))
    return { provider, rpcUrl, rpcOrigin, latestBlock, latencyMs: Date.now() - startedAt, error: null }
  } catch (error) {
    console.error(JSON.stringify({ stage: "public-rpc-rejected", rpcOrigin, error: messageOf(error) }))
    return { provider: null, rpcUrl, rpcOrigin, latestBlock: 0, latencyMs: Number.MAX_SAFE_INTEGER, error: messageOf(error) }
  }
}

async function getFhevm() {
  if (!fhevmPromise) fhevmPromise = createPublicFheInstance()
  return fhevmPromise
}

async function createPublicFheInstance() {
  let lastError
  for (const network of activePublicRpcUrls) {
    try {
      console.log(JSON.stringify({ stage: "initialize-fhe", rpcOrigin: originOf(network) }))
      return await withTimeout(createInstance({ ...SepoliaConfig, network }), 45_000, "FHE initialization")
    } catch (error) {
      lastError = error
      console.error(JSON.stringify({ stage: "initialize-fhe-retry", rpcOrigin: originOf(network), error: messageOf(error) }))
    }
  }
  throw new Error(`No public Sepolia RPC initialized the FHE client: ${messageOf(lastError)}`)
}

async function encrypt64(fhevm, contractAddress, userAddress, amount) {
  const input = fhevm.createEncryptedInput(contractAddress, userAddress)
  input.add64(amount)
  const encrypted = await input.encrypt()
  return { handle: encrypted.handles[0], proof: encrypted.inputProof }
}

async function send(label, transactionPromise, provider) {
  const transaction = await transactionPromise
  console.log(JSON.stringify({ stage: `${label}-submitted`, transactionHash: transaction.hash }))
  try {
    const receipt = await withTimeout(transaction.wait(), 180_000, `${label} receipt`)
    if (!receipt || receipt.status !== 1) throw new Error(`Transaction failed: ${transaction.hash}`)
    console.log(JSON.stringify({ stage: label, transactionHash: transaction.hash, blockNumber: receipt.blockNumber }))
    return { label, hash: transaction.hash, blockNumber: receipt.blockNumber, url: txUrl(transaction.hash) }
  } catch (error) {
    const recovered = await recoverReceipt(provider, transaction.hash)
    if (recovered?.status === 1) {
      return { label, hash: transaction.hash, blockNumber: recovered.blockNumber, url: txUrl(transaction.hash), recovered: true }
    }
    throw new Error(`${label} was submitted as ${transaction.hash}, but confirmation is uncertain: ${messageOf(error)}`)
  }
}

async function recoverReceipt(provider, hash) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const receipt = await withTimeout(provider.getTransactionReceipt(hash), 10_000, "receipt recovery")
      if (receipt) return receipt
    } catch {}
    await sleep(3_000)
  }
  return null
}

async function writeEvidence(context) {
  const { symbol, token, poolDeployment, vaultDeployment, state, tasks, submitted } = context
  const relevantEvents = state.events.filter((event) => eventDrawId(event) === state.targetDrawId || event.name === "DrawOpened")
  const evidence = {
    checkedAt: new Date().toISOString(),
    network: "sepolia",
    rpcPolicy: "public-only",
    market: symbol,
    addresses: { pool: poolDeployment.pool, vault: vaultDeployment.vault, asset: token.asset },
    target: {
      drawId: state.targetDrawId,
      principal: hre.ethers.formatUnits(POOL_PRINCIPAL, 6),
      directPrize: hre.ethers.formatUnits(DIRECT_PRIZE, 6),
      deterministicSingleEntrant: state.hasDeposit && state.participantCount === 1,
    },
    state: {
      currentDrawId: state.currentDrawId,
      phase: state.phase,
      participantCount: state.participantCount,
      drawClosesAt: isoOrNull(state.drawClosesAt),
      claimClosesAt: isoOrNull(state.claimClosesAt),
      hasDeposit: state.hasDeposit,
      hasPrizeFunding: state.hasPrizeFunding,
      hasClaim: state.hasClaim,
      hasWithdrawal: state.hasWithdrawal,
      hasNextDraw: state.hasNextDraw,
    },
    incompleteTasks: tasks,
    submitted,
    eventTransactions: relevantEvents.map((event) => ({
      event: event.name,
      hash: event.transactionHash,
      blockNumber: event.blockNumber,
      url: txUrl(event.transactionHash),
    })),
    remainingHumanEvidence: [
      "Open the deployed UI with a real wallet and authorize the EIP-712 private session.",
      "Decrypt the prize preview and post-claim confidential balance for judge-visible proof.",
    ],
  }
  const evidencePath = path.join(process.cwd(), "deployments", `live-cycle-${symbol.toLowerCase()}.json`)
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`)
}

function loadDeployment(filename) {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), "deployments", filename), "utf8"))
}

function eventDrawId(event) {
  const value = event.args.drawId ?? event.args.toDrawId ?? event.args.fromDrawId
  return value === undefined ? null : Number(value)
}

function sameAddress(left, right) {
  return String(left).toLowerCase() === String(right).toLowerCase()
}

function validateConfiguration() {
  if (MARKET_SYMBOLS.length === 0) throw new Error("LIVE_CYCLE_MARKETS must include at least one market")
  for (const symbol of MARKET_SYMBOLS) {
    if (!TOKENS[symbol]) throw new Error(`Unsupported LIVE_CYCLE_MARKETS entry ${symbol}`)
  }
  if (POOL_PRINCIPAL <= 0n) throw new Error("LIVE_CYCLE_POOL_PRINCIPAL must be positive")
  if (DIRECT_PRIZE <= 0n) throw new Error("LIVE_CYCLE_DIRECT_PRIZE must be positive")
  for (const rpcUrl of PUBLIC_RPC_URLS) {
    const parsed = new URL(rpcUrl)
    if (parsed.protocol !== "https:") throw new Error(`Public RPC must use HTTPS: ${rpcUrl}`)
  }
}

function withTimeout(promise, milliseconds, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${milliseconds}ms`)), milliseconds)),
  ])
}

function txUrl(hash) {
  return `https://sepolia.etherscan.io/tx/${hash}`
}

function originOf(url) {
  try { return new URL(url).origin } catch { return "invalid-url" }
}

function isoOrNull(timestamp) {
  return timestamp ? new Date(Number(timestamp) * 1000).toISOString() : null
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
