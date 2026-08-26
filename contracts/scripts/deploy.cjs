const hre = require("hardhat")
const fs = require("node:fs")
const path = require("node:path")
const { selectedToken } = require("./token-config.cjs")

async function main() {
  const token = selectedToken()
  const [deployer] = await hre.ethers.getSigners()
  if (!deployer) throw new Error("No deployer configured")

  const network = await hre.ethers.provider.getNetwork()
  if (network.chainId !== 11155111n) throw new Error(`Expected Sepolia, received chain ${network.chainId}`)

  const asset = token.asset
  const assetCode = await hre.ethers.provider.getCode(asset)
  if (assetCode === "0x") throw new Error(`No ERC-7984 token deployed at ${asset}`)
  const wrapper = new hre.ethers.Contract(asset, ["function underlying() view returns (address)"], hre.ethers.provider)
  const underlying = await wrapper.underlying()
  if (underlying.toLowerCase() !== token.underlying.toLowerCase()) {
    throw new Error(`Configured asset is not Zama's official Sepolia ${token.confidentialSymbol} wrapper`)
  }

  const pool = await hre.ethers.deployContract("ConfidentialPrizePool", [deployer.address, asset])
  await pool.waitForDeployment()
  const poolAddress = await pool.getAddress()
  const deploymentTransaction = pool.deploymentTransaction()
  const deploymentReceipt = deploymentTransaction ? await deploymentTransaction.wait() : null

  const vaultDeploymentPath = path.join(process.cwd(), "deployments", token.vaultDeploymentFile)
  const frontendGeneratedPath = path.join(process.cwd(), "..", "frontend", "src", "generated")
  let vaultDeployment = null
  let rewardSource = null
  let rewardSourceTransactionHash = null
  if (fs.existsSync(vaultDeploymentPath)) {
    vaultDeployment = JSON.parse(fs.readFileSync(vaultDeploymentPath, "utf8"))
    const vaultCode = await hre.ethers.provider.getCode(vaultDeployment.vault)
    if (vaultCode === "0x") throw new Error(`No liquidity vault deployed at ${vaultDeployment.vault}`)
    const vault = new hre.ethers.Contract(vaultDeployment.vault, ["function asset() view returns (address)"], hre.ethers.provider)
    const vaultAsset = await vault.asset()
    if (vaultAsset.toLowerCase() !== asset.toLowerCase()) throw new Error("Liquidity vault asset mismatch")
    const rewardSourceTx = await pool.setRewardSource(vaultDeployment.vault)
    await rewardSourceTx.wait()
    rewardSource = vaultDeployment.vault
    rewardSourceTransactionHash = rewardSourceTx.hash
  }

  const deployment = {
    network: hre.network.name,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    tokenSymbol: token.symbol,
    underlyingSymbol: token.underlyingSymbol,
    asset,
    underlying,
    pool: poolAddress,
    privacyModel: "private-aggregate-v4-draw-scoped",
    drawScopedEnrollment: true,
    rewardSource,
    rewardSourceConfigured: Boolean(rewardSource),
    rewardSourceTransactionHash,
    transactionHash: deploymentTransaction?.hash || null,
    deploymentBlock: deploymentReceipt?.blockNumber ?? null,
    deployedAt: new Date().toISOString(),
  }

  fs.mkdirSync(path.join(process.cwd(), "deployments"), { recursive: true })
  fs.mkdirSync(frontendGeneratedPath, { recursive: true })
  fs.writeFileSync(path.join(process.cwd(), "deployments", token.deploymentFile), `${JSON.stringify(deployment, null, 2)}\n`)
  fs.writeFileSync(path.join(frontendGeneratedPath, token.frontendDeploymentFile), `${JSON.stringify(deployment, null, 2)}\n`)
  if (vaultDeployment) {
    const updatedVaultDeployment = {
      ...vaultDeployment,
      prizePool: poolAddress,
      rewardSourceConfigured: true,
      rewardSourceTransactionHash,
    }
    fs.writeFileSync(vaultDeploymentPath, `${JSON.stringify(updatedVaultDeployment, null, 2)}\n`)
    fs.writeFileSync(path.join(frontendGeneratedPath, token.frontendVaultFile), `${JSON.stringify(updatedVaultDeployment, null, 2)}\n`)
  }
  console.log(JSON.stringify(deployment, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
