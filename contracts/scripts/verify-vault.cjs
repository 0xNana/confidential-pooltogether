const hre = require("hardhat")
const { selectedToken } = require("./token-config.cjs")

const token = selectedToken()
const deployment = require(`../deployments/${token.vaultDeploymentFile}`)

async function main() {
  if (deployment.apyAccounting !== true) throw new Error("Deployment manifest says APY accounting is not active")
  if (deployment.rewardAccrualModel !== "encrypted-time-weighted-v2") throw new Error("Deployment manifest does not use time-weighted APY accounting")
  if (!deployment.prizePool) throw new Error("Deployment manifest has no prizePool address")

  const code = await hre.ethers.provider.getCode(deployment.vault)
  if (code === "0x") throw new Error(`No bytecode at ${deployment.vault}`)

  const vault = await hre.ethers.getContractAt("ConfidentialLiquidityVault", deployment.vault)
  const pool = await hre.ethers.getContractAt("ConfidentialPrizePool", deployment.prizePool)
  const [asset, maturityPeriod, rewardFundingCooldown, rewardAccrualPeriod, targetApyBps, lastAccruedAt, rewardSource] = await Promise.all([
    vault.asset(),
    vault.MATURITY_PERIOD(),
    vault.REWARD_FUNDING_COOLDOWN(),
    vault.REWARD_ACCRUAL_PERIOD(),
    vault.TARGET_APY_BPS(),
    vault.lastAccruedAt(),
    pool.rewardSource(),
  ])
  if (!vault.interface.hasFunction("totalPrincipal")) throw new Error("Vault has no encrypted TVL getter")
  if (!vault.interface.hasFunction("rewardReserve")) throw new Error("Vault has no encrypted reward reserve getter")
  if (!vault.interface.hasFunction("accruedReward")) throw new Error("Vault has no encrypted accrued reward getter")
  if (!vault.interface.hasFunction("fundRewards")) throw new Error("Vault has no encrypted reward funding function")
  if (!vault.interface.hasFunction("fundPrizePool")) throw new Error("Vault has no prize-pool funding function")
  if (asset.toLowerCase() !== deployment.asset.toLowerCase()) throw new Error("Vault asset mismatch")
  if (asset.toLowerCase() !== token.asset.toLowerCase()) throw new Error(`Vault is not bound to official Zama ${token.confidentialSymbol}`)
  if (rewardSource.toLowerCase() !== deployment.vault.toLowerCase()) throw new Error("Prize pool reward source is not the Liquidity Hunt vault")
  if (maturityPeriod !== 7_776_000n) throw new Error("Unexpected maturity period")
  if (rewardFundingCooldown !== 86_400n) throw new Error("Unexpected reward funding cooldown")
  if (rewardAccrualPeriod !== 31_536_000n) throw new Error("Unexpected reward accrual period")
  if (targetApyBps !== 1_200n) throw new Error("Unexpected APY target")
  if (lastAccruedAt === 0n) throw new Error("Reward accrual checkpoint is not initialized")

  console.log(JSON.stringify({
    vault: deployment.vault,
    prizePool: deployment.prizePool,
    tokenSymbol: token.symbol,
    bytecodeBytes: (code.length - 2) / 2,
    asset,
    maturityPeriod: `${maturityPeriod / 86_400n} days`,
    rewardFundingCooldown: `${rewardFundingCooldown / 86_400n} day`,
    rewardAccrualPeriod: `${rewardAccrualPeriod / 86_400n} days`,
    targetApyBps: Number(targetApyBps),
    rewardAccrualModel: deployment.rewardAccrualModel,
    lastAccruedAt: lastAccruedAt.toString(),
    apyAccounting: true,
    rewardSourceConfigured: true,
    encryptedTvl: true,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
