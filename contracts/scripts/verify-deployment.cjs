const hre = require("hardhat")
const deployment = require("../deployments/sepolia.json")

const OFFICIAL_CUSDT = "0x4E7B06D78965594eB5EF5414c357ca21E1554491"
const OFFICIAL_TEST_USDT = "0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0"

async function main() {
  const code = await hre.ethers.provider.getCode(deployment.pool)
  if (code === "0x") throw new Error(`No bytecode at ${deployment.pool}`)

  const pool = await hre.ethers.getContractAt("ConfidentialPrizePool", deployment.pool)
  const [asset, owner, drawId, phase, drawClosesAt, drawPeriod, claimPeriod, protocolId] = await Promise.all([
    pool.asset(),
    pool.owner(),
    pool.drawId(),
    pool.phase(),
    pool.drawClosesAt(),
    pool.DRAW_PERIOD(),
    pool.CLAIM_PERIOD(),
    pool.confidentialProtocolId(),
  ])

  if (asset.toLowerCase() !== deployment.asset.toLowerCase()) throw new Error("Asset address mismatch")
  if (asset.toLowerCase() !== OFFICIAL_CUSDT.toLowerCase()) throw new Error("Pool is not bound to official Zama cUSDTMock")
  if (owner.toLowerCase() !== deployment.deployer.toLowerCase()) throw new Error("Owner address mismatch")
  if (pool.interface.hasFunction("snapshotTotal") || pool.interface.hasFunction("finalizeSnapshot")) {
    throw new Error("Deployment exposes the retired public aggregate flow")
  }

  const wrapper = new hre.ethers.Contract(asset, [
    "function underlying() view returns (address)",
    "function symbol() view returns (string)",
  ], hre.ethers.provider)
  const [underlying, symbol] = await Promise.all([wrapper.underlying(), wrapper.symbol()])
  if (underlying.toLowerCase() !== OFFICIAL_TEST_USDT.toLowerCase()) throw new Error("Official cUSDT underlying mismatch")

  console.log(JSON.stringify({
    pool: deployment.pool,
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
    aggregateDisclosure: "none",
    encryptedRollover: true,
    confidentialProtocolId: protocolId.toString(),
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
