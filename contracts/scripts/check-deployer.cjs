const hre = require("hardhat")

const SEPOLIA_CUSDT = "0x4E7B06D78965594eB5EF5414c357ca21E1554491"
const SEPOLIA_TEST_USDT = "0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0"

async function main() {
  const [deployer] = await hre.ethers.getSigners()
  if (!deployer) throw new Error("No deployer configured")

  const network = await hre.ethers.provider.getNetwork()
  const balance = await hre.ethers.provider.getBalance(deployer.address)
  const asset = SEPOLIA_CUSDT
  const assetCode = await hre.ethers.provider.getCode(asset)
  const wrapper = new hre.ethers.Contract(asset, ["function underlying() view returns (address)"], hre.ethers.provider)
  const underlying = assetCode === "0x" ? null : await wrapper.underlying()

  console.log(JSON.stringify({
    network: hre.network.name,
    chainId: network.chainId.toString(),
    deployer: deployer.address,
    balanceEth: hre.ethers.formatEther(balance),
    asset,
    assetHasCode: assetCode !== "0x",
    officialCUsdt: asset.toLowerCase() === SEPOLIA_CUSDT.toLowerCase() && underlying?.toLowerCase() === SEPOLIA_TEST_USDT.toLowerCase(),
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
