const hre = require("hardhat")
const fs = require("node:fs")
const path = require("node:path")
const { selectedToken } = require("./token-config.cjs")

const token = selectedToken()
const poolDeployment = require(`../deployments/${token.deploymentFile}`)

async function main() {
  const [deployer] = await hre.ethers.getSigners()
  if (!deployer) throw new Error("No deployer configured")

  const network = await hre.ethers.provider.getNetwork()
  if (network.chainId !== 11155111n) throw new Error(`Expected Sepolia, received chain ${network.chainId}`)

  const wrapper = new hre.ethers.Contract(token.asset, ["function underlying() view returns (address)"], hre.ethers.provider)
  const underlying = await wrapper.underlying()
  if (underlying.toLowerCase() !== token.underlying.toLowerCase()) throw new Error(`Configured asset is not Zama's official Sepolia ${token.confidentialSymbol} wrapper`)

  const vault = await hre.ethers.deployContract("ConfidentialLiquidityVault", [deployer.address, token.asset])
  await vault.waitForDeployment()
  const vaultAddress = await vault.getAddress()
  const deploymentReceipt = await vault.deploymentTransaction()?.wait()
  const pool = await hre.ethers.getContractAt("ConfidentialPrizePool", poolDeployment.pool, deployer)
  const currentRewardSource = await pool.rewardSource()
  let rewardSourceTransactionHash = null
  if (currentRewardSource.toLowerCase() !== vaultAddress.toLowerCase()) {
    const rewardSourceTx = await pool.setRewardSource(vaultAddress)
    await rewardSourceTx.wait()
    rewardSourceTransactionHash = rewardSourceTx.hash
  }

  const deployment = {
    network: hre.network.name,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    tokenSymbol: token.symbol,
    underlyingSymbol: token.underlyingSymbol,
    asset: token.asset,
    underlying,
    vault: vaultAddress,
    prizePool: poolDeployment.pool,
    maturityPeriod: "90 days",
    rewardFundingCooldown: "1 day",
    rewardAccrualPeriod: "365 days",
    targetApyBps: 1200,
    rewardAccrualModel: "encrypted-time-weighted-v2",
    prizeCapacityModel: "encrypted-pool-capacity-handshake-v1",
    apyAccounting: true,
    rewardSourceConfigured: true,
    transactionHash: vault.deploymentTransaction()?.hash || null,
    deploymentBlock: deploymentReceipt?.blockNumber ?? null,
    rewardSourceTransactionHash,
    deployedAt: new Date().toISOString(),
  }

  const frontendGeneratedPath = path.join(process.cwd(), "..", "frontend", "src", "generated")
  const updatedPoolDeployment = {
    ...poolDeployment,
    rewardSource: vaultAddress,
    rewardSourceConfigured: true,
    rewardSourceTransactionHash,
  }
  fs.writeFileSync(path.join(process.cwd(), "deployments", token.deploymentFile), `${JSON.stringify(updatedPoolDeployment, null, 2)}\n`)
  fs.writeFileSync(path.join(frontendGeneratedPath, token.frontendDeploymentFile), `${JSON.stringify(updatedPoolDeployment, null, 2)}\n`)
  fs.writeFileSync(path.join(process.cwd(), "deployments", token.vaultDeploymentFile), `${JSON.stringify(deployment, null, 2)}\n`)
  fs.writeFileSync(path.join(frontendGeneratedPath, token.frontendVaultFile), `${JSON.stringify(deployment, null, 2)}\n`)
  console.log(JSON.stringify(deployment, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
