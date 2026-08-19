const hre = require("hardhat")
const fs = require("node:fs")
const path = require("node:path")

const SEPOLIA_CUSDT = "0x4E7B06D78965594eB5EF5414c357ca21E1554491"
const SEPOLIA_TEST_USDT = "0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0"

async function main() {
  const [deployer] = await hre.ethers.getSigners()
  if (!deployer) throw new Error("No deployer configured")

  const network = await hre.ethers.provider.getNetwork()
  if (network.chainId !== 11155111n) throw new Error(`Expected Sepolia, received chain ${network.chainId}`)

  const asset = SEPOLIA_CUSDT
  const assetCode = await hre.ethers.provider.getCode(asset)
  if (assetCode === "0x") throw new Error(`No ERC-7984 token deployed at ${asset}`)
  const wrapper = new hre.ethers.Contract(asset, ["function underlying() view returns (address)"], hre.ethers.provider)
  const underlying = await wrapper.underlying()
  if (underlying.toLowerCase() !== SEPOLIA_TEST_USDT.toLowerCase()) {
    throw new Error("Configured asset is not Zama's official Sepolia cUSDTMock wrapper")
  }

  const pool = await hre.ethers.deployContract("ConfidentialPrizePool", [deployer.address, asset])
  await pool.waitForDeployment()

  const deployment = {
    network: hre.network.name,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    asset,
    pool: await pool.getAddress(),
    privacyModel: "private-aggregate-v3-claim-rollover",
    transactionHash: pool.deploymentTransaction()?.hash || null,
    deployedAt: new Date().toISOString(),
  }

  const frontendGeneratedPath = path.join(process.cwd(), "..", "frontend", "src", "generated")
  fs.mkdirSync(path.join(process.cwd(), "deployments"), { recursive: true })
  fs.mkdirSync(frontendGeneratedPath, { recursive: true })
  fs.writeFileSync(path.join(process.cwd(), "deployments", "sepolia.json"), `${JSON.stringify(deployment, null, 2)}\n`)
  fs.writeFileSync(path.join(frontendGeneratedPath, "deployment.json"), `${JSON.stringify(deployment, null, 2)}\n`)
  console.log(JSON.stringify(deployment, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
