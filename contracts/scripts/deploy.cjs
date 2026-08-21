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

  const deployment = {
    network: hre.network.name,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    tokenSymbol: token.symbol,
    underlyingSymbol: token.underlyingSymbol,
    asset,
    underlying,
    pool: await pool.getAddress(),
    privacyModel: "private-aggregate-v3-claim-rollover",
    transactionHash: pool.deploymentTransaction()?.hash || null,
    deployedAt: new Date().toISOString(),
  }

  const frontendGeneratedPath = path.join(process.cwd(), "..", "frontend", "src", "generated")
  fs.mkdirSync(path.join(process.cwd(), "deployments"), { recursive: true })
  fs.mkdirSync(frontendGeneratedPath, { recursive: true })
  fs.writeFileSync(path.join(process.cwd(), "deployments", token.deploymentFile), `${JSON.stringify(deployment, null, 2)}\n`)
  fs.writeFileSync(path.join(frontendGeneratedPath, token.frontendDeploymentFile), `${JSON.stringify(deployment, null, 2)}\n`)
  console.log(JSON.stringify(deployment, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
