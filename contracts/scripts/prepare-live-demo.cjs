const hre = require("hardhat")
const { createInstance, SepoliaConfig } = require("@zama-fhe/relayer-sdk/node")
const { selectedToken } = require("./token-config.cjs")
const { eventsNamed, readContractEvents } = require("./event-evidence.cjs")

const token = selectedToken()
const poolDeployment = require(`../deployments/${token.deploymentFile}`)
const vaultDeployment = require(`../deployments/${token.vaultDeploymentFile}`)
const POOL_PRINCIPAL = hre.ethers.parseUnits(process.env.LIVE_DEMO_POOL_PRINCIPAL || "1000", 6)
const VAULT_PRINCIPAL = hre.ethers.parseUnits(process.env.LIVE_DEMO_VAULT_PRINCIPAL || "1000", 6)
const REWARD_RESERVE = hre.ethers.parseUnits(process.env.LIVE_DEMO_REWARD_RESERVE || "1000", 6)
const DIRECT_PRIZE = hre.ethers.parseUnits(process.env.LIVE_DEMO_DIRECT_PRIZE || "29.5", 6)
const execute = process.env.LIVE_DEMO_EXECUTE === "1"

async function main() {
  const [deployer] = await hre.ethers.getSigners()
  if (!deployer) throw new Error("No deployer configured")
  if (deployer.address.toLowerCase() !== poolDeployment.deployer.toLowerCase()) throw new Error("Configured signer is not the deployed pool owner")

  const pool = await hre.ethers.getContractAt("ConfidentialPrizePool", poolDeployment.pool, deployer)
  const vault = await hre.ethers.getContractAt("ConfidentialLiquidityVault", vaultDeployment.vault, deployer)
  const underlying = new hre.ethers.Contract(token.underlying, [
    "function mint(address,uint256) returns (bool)",
    "function approve(address,uint256) returns (bool)",
    "function allowance(address,address) view returns (uint256)",
  ], deployer)
  const wrapper = new hre.ethers.Contract(token.asset, [
    "function wrap(address,uint256) returns (bytes32)",
    "function setOperator(address,uint48)",
  ], deployer)

  const [poolReceipt, vaultReceipt] = await Promise.all([
    hre.ethers.provider.getTransactionReceipt(poolDeployment.transactionHash),
    hre.ethers.provider.getTransactionReceipt(vaultDeployment.transactionHash),
  ])

  const latestBlock = await hre.ethers.provider.getBlockNumber()
  const recentFallbackBlock = Math.max(0, latestBlock - 50_000)
  const poolStartBlock = poolDeployment.deploymentBlock ?? poolReceipt?.blockNumber ?? recentFallbackBlock
  const vaultStartBlock = vaultDeployment.deploymentBlock ?? vaultReceipt?.blockNumber ?? recentFallbackBlock
  const [poolEvents, vaultEvents] = await Promise.all([
    readContractEvents(pool, poolStartBlock, latestBlock),
    readContractEvents(vault, vaultStartBlock, latestBlock),
  ])
  const poolDeposits = eventsNamed(poolEvents, "DepositRecorded").filter((event) => event.args.account.toLowerCase() === deployer.address.toLowerCase())
  const vaultDeposits = eventsNamed(vaultEvents, "Deposited").filter((event) => event.args.account.toLowerCase() === deployer.address.toLowerCase())
  const rewardsFunded = eventsNamed(vaultEvents, "RewardsFunded")
  const prizesFunded = eventsNamed(poolEvents, "PrizeFunded")
  const needsPoolPrincipal = poolDeposits.length === 0
  const needsVaultPrincipal = vaultDeposits.length === 0
  const needsRewardReserve = rewardsFunded.length === 0
  const needsPrizeFunding = prizesFunded.length === 0
  const currentPhase = Number(await pool.phase())
  if (needsPoolPrincipal && currentPhase !== 0) throw new Error("Pool principal is missing, but the current draw is not open")

  const [lastRewardFundedAt, rewardFundingCooldown, latestBlockData] = await Promise.all([
    vault.lastRewardFundedAt(),
    vault.REWARD_FUNDING_COOLDOWN(),
    hre.ethers.provider.getBlock(latestBlock),
  ])
  if (!latestBlockData) throw new Error("Latest Sepolia block is unavailable")
  const vaultFundingReadyAt = lastRewardFundedAt + rewardFundingCooldown
  const isFreshTimeWeightedVault = vaultDeployment.rewardAccrualModel === "encrypted-time-weighted-v2" && lastRewardFundedAt === 0n
  const useDirectPrize = needsPrizeFunding && (isFreshTimeWeightedVault || BigInt(latestBlockData.timestamp) < vaultFundingReadyAt)

  const wrapAmount = (needsPoolPrincipal ? POOL_PRINCIPAL : 0n) +
    (needsVaultPrincipal ? VAULT_PRINCIPAL : 0n) +
    (needsRewardReserve ? REWARD_RESERVE : 0n) +
    (useDirectPrize ? DIRECT_PRIZE : 0n)
  const plan = {
    token: token.symbol,
    execute,
    deployer: deployer.address,
    pool: poolDeployment.pool,
    vault: vaultDeployment.vault,
    drawId: (await pool.drawId()).toString(),
    phase: currentPhase,
    actions: {
      wrapAmount: hre.ethers.formatUnits(wrapAmount, 6),
      depositPoolPrincipal: needsPoolPrincipal ? hre.ethers.formatUnits(POOL_PRINCIPAL, 6) : "skip: event exists",
      depositVaultPrincipal: needsVaultPrincipal ? hre.ethers.formatUnits(VAULT_PRINCIPAL, 6) : "skip: event exists",
      fundRewardReserve: needsRewardReserve ? hre.ethers.formatUnits(REWARD_RESERVE, 6) : "skip: event exists",
      fundPrizePool: !needsPrizeFunding
        ? "skip: event exists"
        : useDirectPrize
          ? `${hre.ethers.formatUnits(DIRECT_PRIZE, 6)} direct testnet prize`
          : "from configured reward vault",
      vaultFundingReadyAt: vaultFundingReadyAt.toString(),
      prizeFundingReason: !useDirectPrize
        ? "time-weighted vault accrual is ready"
        : isFreshTimeWeightedVault
          ? "fresh vault has no meaningful accrued reward; use explicit testnet prize"
          : "vault funding cooldown is active; use explicit testnet prize",
    },
    existingTransactions: {
      poolDeposit: latestHash(poolDeposits),
      vaultDeposit: latestHash(vaultDeposits),
      rewardsFunded: latestHash(rewardsFunded),
      prizeFunded: latestHash(prizesFunded),
    },
  }
  if (!execute) {
    console.log(JSON.stringify(plan, null, 2))
    console.log("Dry run only. Set LIVE_DEMO_EXECUTE=1 to submit the planned Sepolia transactions.")
    return
  }

  const transactionHashes = {}
  const needsFheInput = needsPoolPrincipal || needsVaultPrincipal || needsRewardReserve || useDirectPrize
  const fhevm = needsFheInput ? await createFheInstance() : null
  if (wrapAmount > 0n) {
    transactionHashes.mint = await send("mint", underlying.mint(deployer.address, wrapAmount))
    const allowance = await underlying.allowance(deployer.address, token.asset)
    if (allowance < wrapAmount) transactionHashes.approveWrapper = await send("approve-wrapper", underlying.approve(token.asset, wrapAmount))
    transactionHashes.wrap = await send("wrap", wrapper.wrap(deployer.address, wrapAmount))
  }

  const operatorUntil = Math.floor(Date.now() / 1000) + 365 * 86_400
  if (needsPoolPrincipal || useDirectPrize) {
    transactionHashes.approvePoolOperator = await send("approve-pool-operator", wrapper.setOperator(poolDeployment.pool, operatorUntil))
  }
  if (needsPoolPrincipal) {
    const encrypted = await encrypt64(fhevm, poolDeployment.pool, deployer.address, POOL_PRINCIPAL)
    transactionHashes.poolDeposit = await send("pool-deposit", pool.deposit(encrypted.handle, encrypted.proof))
  }
  if (needsVaultPrincipal || needsRewardReserve) {
    transactionHashes.approveVaultOperator = await send("approve-vault-operator", wrapper.setOperator(vaultDeployment.vault, operatorUntil))
  }
  if (needsVaultPrincipal) {
    const encrypted = await encrypt64(fhevm, vaultDeployment.vault, deployer.address, VAULT_PRINCIPAL)
    transactionHashes.vaultDeposit = await send("vault-deposit", vault.deposit(encrypted.handle, encrypted.proof))
  }
  if (needsRewardReserve) {
    const encrypted = await encrypt64(fhevm, vaultDeployment.vault, deployer.address, REWARD_RESERVE)
    transactionHashes.rewardsFunded = await send("reward-reserve", vault.fundRewards(encrypted.handle, encrypted.proof))
  }
  if (useDirectPrize) {
    const encrypted = await encrypt64(fhevm, poolDeployment.pool, deployer.address, DIRECT_PRIZE)
    transactionHashes.prizeFunded = await send("direct-prize-funding", pool.fundPrize(encrypted.handle, encrypted.proof))
  } else if (needsPrizeFunding) {
    transactionHashes.prizeFunded = await send("vault-prize-funding", vault.fundPrizePool(poolDeployment.pool))
  }

  console.log(JSON.stringify({ ...plan, execute: true, transactionHashes }, null, 2))
}

async function encrypt64(fhevm, contractAddress, userAddress, amount) {
  if (!fhevm) throw new Error("FHE client is not initialized")
  const input = fhevm.createEncryptedInput(contractAddress, userAddress)
  input.add64(amount)
  const encrypted = await input.encrypt()
  return { handle: encrypted.handles[0], proof: encrypted.inputProof }
}

async function createFheInstance() {
  const rpcUrls = Array.from(new Set([
    process.env.SEPOLIA_FHE_RPC_URL,
    "https://ethereum-sepolia-rpc.publicnode.com",
    "https://1rpc.io/sepolia",
    "https://sepolia.gateway.tenderly.co",
  ].filter(Boolean)))
  let lastError
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const network = rpcUrls[attempt % rpcUrls.length]
    try {
      console.log(JSON.stringify({ stage: "initialize-fhe", attempt: attempt + 1, rpcOrigin: new URL(network).origin }))
      return await createInstance({ ...SepoliaConfig, network })
    } catch (error) {
      lastError = error
      console.error(JSON.stringify({ stage: "initialize-fhe-retry", attempt: attempt + 1, error: error instanceof Error ? error.message : String(error) }))
      await new Promise((resolve) => setTimeout(resolve, 3_000 * (attempt + 1)))
    }
  }
  throw lastError
}

async function send(label, transactionPromise) {
  const transaction = await transactionPromise
  const receipt = await transaction.wait()
  if (!receipt || receipt.status !== 1) throw new Error(`Transaction failed: ${transaction.hash}`)
  console.log(JSON.stringify({ stage: label, transactionHash: transaction.hash, blockNumber: receipt.blockNumber }))
  return transaction.hash
}

function latestHash(events) {
  return events.at(-1)?.transactionHash || null
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
