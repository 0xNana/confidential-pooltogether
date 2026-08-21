const hre = require("hardhat")
const { createInstance, SepoliaConfig } = require("@zama-fhe/relayer-sdk/node")
const { selectedToken } = require("./token-config.cjs")

const token = selectedToken()
const deployment = require(`../deployments/${token.vaultDeploymentFile}`)
const poolDeployment = require(`../deployments/${token.deploymentFile}`)
const UNDERLYING = token.underlying
const ASSET = deployment.asset
const AMOUNT = 1_000_000n * 1_000_000n

async function main() {
  const [deployer] = await hre.ethers.getSigners()
  if (!deployer) throw new Error("No deployer configured")
  const underlying = new hre.ethers.Contract(UNDERLYING, [
    "function mint(address,uint256) returns (bool)",
    "function approve(address,uint256) returns (bool)",
    "function allowance(address,address) view returns (uint256)",
  ], deployer)
  const wrapper = new hre.ethers.Contract(ASSET, [
    "function wrap(address,uint256) returns (bytes32)",
    "function setOperator(address,uint48)",
  ], deployer)
  const vault = await hre.ethers.getContractAt("ConfidentialLiquidityVault", deployment.vault, deployer)

  if (process.env.ONLY_DEPOSIT !== "1") {
    const mintTx = await underlying.mint(deployer.address, AMOUNT)
    await mintTx.wait()
    if (process.env.MINT_ONLY === "1") {
      console.log(JSON.stringify({
        token: UNDERLYING,
        recipient: deployer.address,
        amount: `1000000 ${token.underlyingSymbol}`,
        transactionHash: mintTx.hash,
      }, null, 2))
      return
    }
    if ((await underlying.allowance(deployer.address, ASSET)) < AMOUNT) await (await underlying.approve(ASSET, AMOUNT)).wait()
    await (await wrapper.wrap(deployer.address, AMOUNT)).wait()
    await (await wrapper.setOperator(deployment.vault, Math.floor(Date.now() / 1000) + 365 * 86_400)).wait()
  }

  const fhevm = await createInstance({ ...SepoliaConfig, network: hre.network.config.url })
  const encrypted = fhevm.createEncryptedInput(deployment.vault, deployer.address)
  encrypted.add64(AMOUNT)
  const input = await encrypted.encrypt()
  const tx = process.env.REWARD_RESERVE === "1"
    ? await vault.fundRewards(input.handles[0], input.inputProof)
    : await vault.deposit(input.handles[0], input.inputProof)
  await tx.wait()

  let prizePoolFundingHash = null
  if (process.env.FUND_PRIZE_POOL === "1") {
    const prizePool = deployment.prizePool || poolDeployment.pool
    const fundPrizePoolTx = await vault.fundPrizePool(prizePool)
    await fundPrizePoolTx.wait()
    prizePoolFundingHash = fundPrizePoolTx.hash
  }

  console.log(JSON.stringify({
    vault: deployment.vault,
    depositor: deployer.address,
    rewardReserve: process.env.REWARD_RESERVE === "1",
    amount: `1000000 ${token.symbol}`,
    transactionHash: tx.hash,
    prizePoolFundingHash,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
