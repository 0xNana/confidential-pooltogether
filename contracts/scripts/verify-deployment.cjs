const hre = require("hardhat")
const { selectedToken } = require("./token-config.cjs")

const token = selectedToken()
const deployment = require(`../deployments/${token.deploymentFile}`)

async function main() {
  const code = await hre.ethers.provider.getCode(deployment.pool)
  if (code === "0x") throw new Error(`No bytecode at ${deployment.pool}`)

  const pool = await hre.ethers.getContractAt("ConfidentialPrizePool", deployment.pool)
  const [asset, owner, drawId, phase, drawClosesAt, drawPeriod, claimPeriod, protocolId, participantCount, maxParticipants, rewardSource] = await Promise.all([
    pool.asset(),
    pool.owner(),
    pool.drawId(),
    pool.phase(),
    pool.drawClosesAt(),
    pool.DRAW_PERIOD(),
    pool.CLAIM_PERIOD(),
    pool.confidentialProtocolId(),
    pool.participantCount(),
    pool.MAX_PARTICIPANTS(),
    pool.rewardSource(),
  ])

  if (asset.toLowerCase() !== deployment.asset.toLowerCase()) throw new Error("Asset address mismatch")
  if (asset.toLowerCase() !== token.asset.toLowerCase()) throw new Error(`Pool is not bound to official Zama ${token.confidentialSymbol}`)
  if (owner.toLowerCase() !== deployment.deployer.toLowerCase()) throw new Error("Owner address mismatch")
  if (pool.interface.hasFunction("snapshotTotal") || pool.interface.hasFunction("finalizeSnapshot")) {
    throw new Error("Deployment exposes the retired public aggregate flow")
  }
  if (deployment.privacyModel === "private-aggregate-v4-draw-scoped") {
    if (!pool.interface.hasFunction("enterDraw") || !pool.interface.hasFunction("isEntered")) {
      throw new Error("V4 deployment is missing draw-scoped enrollment")
    }
    if (maxParticipants !== 256n) throw new Error("Unexpected per-draw participant bound")
    if (participantCount > maxParticipants) throw new Error("Participant count exceeds the per-draw bound")
    if (!deployment.rewardSource || rewardSource.toLowerCase() !== deployment.rewardSource.toLowerCase()) {
      throw new Error("Reward source mismatch")
    }
  }

  const wrapper = new hre.ethers.Contract(asset, [
    "function underlying() view returns (address)",
    "function symbol() view returns (string)",
  ], hre.ethers.provider)
  const [underlying, symbol] = await Promise.all([wrapper.underlying(), wrapper.symbol()])
  if (underlying.toLowerCase() !== token.underlying.toLowerCase()) throw new Error(`Official ${token.symbol} underlying mismatch`)

  console.log(JSON.stringify({
    pool: deployment.pool,
    tokenSymbol: token.symbol,
    bytecodeBytes: (code.length - 2) / 2,
    asset,
    assetSymbol: symbol,
    underlying,
    owner,
    drawId: drawId.toString(),
    phase: phase.toString(),
    drawClosesAt: drawClosesAt.toString(),
    drawPeriod: drawPeriod.toString(),
    claimPeriod: claimPeriod.toString(),
    participantCount: participantCount.toString(),
    maxParticipants: maxParticipants.toString(),
    drawScopedEnrollment: deployment.privacyModel === "private-aggregate-v4-draw-scoped",
    rewardSource,
    aggregateDisclosure: "none",
    encryptedRollover: true,
    confidentialProtocolId: protocolId.toString(),
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
