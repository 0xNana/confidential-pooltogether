const hre = require("hardhat")
const { selectedToken } = require("./token-config.cjs")
const { eventsNamed, readContractEvents } = require("./event-evidence.cjs")

const token = selectedToken()
const poolDeployment = require(`../deployments/${token.deploymentFile}`)
const vaultDeployment = require(`../deployments/${token.vaultDeploymentFile}`)

async function main() {
  const pool = await hre.ethers.getContractAt("ConfidentialPrizePool", poolDeployment.pool)
  const vault = await hre.ethers.getContractAt("ConfidentialLiquidityVault", vaultDeployment.vault)
  const [poolReceipt, vaultReceipt] = await Promise.all([
    hre.ethers.provider.getTransactionReceipt(poolDeployment.transactionHash),
    hre.ethers.provider.getTransactionReceipt(vaultDeployment.transactionHash),
  ])
  if (!poolReceipt || !vaultReceipt) throw new Error("Deployment receipt is unavailable")

  const latestBlock = await hre.ethers.provider.getBlockNumber()
  const [drawId, phase, drawClosesAt, participantCount, scanCursor, rewardSource, poolEvents, vaultEvents] = await Promise.all([
    pool.drawId(),
    pool.phase(),
    pool.drawClosesAt(),
    pool.participantCount(),
    pool.scanCursor(),
    pool.rewardSource(),
    readContractEvents(pool, poolReceipt.blockNumber, latestBlock),
    readContractEvents(vault, vaultReceipt.blockNumber, latestBlock),
  ])
  if (rewardSource.toLowerCase() !== vaultDeployment.vault.toLowerCase()) throw new Error("Configured reward source does not match the deployed vault")
  const poolDeposits = eventsNamed(poolEvents, "DepositRecorded")
  const poolWithdrawals = eventsNamed(poolEvents, "WithdrawalRecorded")
  const prizeFunding = eventsNamed(poolEvents, "PrizeFunded")
  const selectionStarts = eventsNamed(poolEvents, "DrawSelectionStarted")
  const selectionProgress = eventsNamed(poolEvents, "DrawSelectionProgress")
  const claimableEvents = eventsNamed(poolEvents, "DrawClaimable")
  const claimAttempts = eventsNamed(poolEvents, "PrizeClaimAttempted")
  const nextDraws = eventsNamed(poolEvents, "DrawOpened")
  const vaultDeposits = eventsNamed(vaultEvents, "Deposited")
  const rewardsFunded = eventsNamed(vaultEvents, "RewardsFunded")
  const vaultPrizeFunding = eventsNamed(vaultEvents, "PrizePoolFunded")
    .filter((event) => event.args.prizePool.toLowerCase() === poolDeployment.pool.toLowerCase())

  const evidence = {
    checkedAt: new Date().toISOString(),
    chainId: 11155111,
    token: token.symbol,
    addresses: {
      pool: poolDeployment.pool,
      vault: vaultDeployment.vault,
      asset: token.asset,
      underlying: token.underlying,
    },
    draw: {
      drawId: drawId.toString(),
      phase: Number(phase),
      drawClosesAt: new Date(Number(drawClosesAt) * 1000).toISOString(),
      participantCount: participantCount.toString(),
      scanCursor: scanCursor.toString(),
    },
    checks: {
      hasPoolPrincipal: poolDeposits.length > 0,
      hasVaultPrincipal: vaultDeposits.length > 0,
      hasRewardReserveFunding: rewardsFunded.length > 0,
      hasPrizeFunding: prizeFunding.length > 0,
      hasSelectionStarted: selectionStarts.length > 0,
      hasClaimableDraw: claimableEvents.length > 0,
      hasClaimAttempt: claimAttempts.length > 0,
      hasPrincipalWithdrawal: poolWithdrawals.length > 0,
      hasNextDraw: nextDraws.length > 1,
    },
    transactions: {
      poolDeposits: links(poolDeposits),
      vaultDeposits: links(vaultDeposits),
      rewardsFunded: links(rewardsFunded),
      prizeFunded: links(prizeFunding),
      vaultPrizeFunded: links(vaultPrizeFunding),
      prizeFundingRoute: vaultPrizeFunding.length > 0 ? "reward-vault" : prizeFunding.length > 0 ? "direct-testnet" : null,
      selectionStarted: links(selectionStarts),
      selectionProgress: links(selectionProgress),
      claimable: links(claimableEvents),
      claims: links(claimAttempts),
      withdrawals: links(poolWithdrawals),
      drawsOpened: links(nextDraws),
    },
  }
  console.log(JSON.stringify(evidence, null, 2))

  if (process.env.LIVE_EVIDENCE_REQUIRE_READY === "1") {
    const missing = Object.entries(evidence.checks).filter(([, ready]) => !ready).map(([name]) => name)
    if (missing.length > 0) throw new Error(`Live evidence is incomplete: ${missing.join(", ")}`)
  }
}

function links(events) {
  return events.map((event) => ({
    hash: event.transactionHash,
    url: `https://sepolia.etherscan.io/tx/${event.transactionHash}`,
    blockNumber: event.blockNumber,
  }))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
