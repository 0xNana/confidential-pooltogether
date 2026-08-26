const assert = require("node:assert/strict")
const hre = require("hardhat")
const { FhevmType } = require("@fhevm/hardhat-plugin")

const DAY = 24 * 60 * 60
const YEAR = 365n * BigInt(DAY)

describe("ConfidentialLiquidityVault", function () {
  it("accepts encrypted cUSDT and allows principal-only withdrawals", async function () {
    const [owner, alice] = await hre.ethers.getSigners()
    const token = await hre.ethers.deployContract("ConfidentialTokenFixture", [owner.address])
    await token.waitForDeployment()
    const vault = await hre.ethers.deployContract("ConfidentialLiquidityVault", [owner.address, await token.getAddress()])
    await vault.waitForDeployment()
    const tokenAddress = await token.getAddress()
    const vaultAddress = await vault.getAddress()

    await hre.fhevm.assertCoprocessorInitialized(vault, "ConfidentialLiquidityVault")
    await mint(tokenAddress, owner.address, alice.address, 500_000_000n)
    await (await token.connect(alice).setOperator(vaultAddress, 4_102_444_800)).wait()
    await deposit(vaultAddress, alice, 250_000_000n)

    assert.equal(await decryptPrincipal(vaultAddress, alice), 250_000_000n)
    assert.equal(await decryptTotal(vaultAddress, alice), 250_000_000n)
    assert.equal((await vault.maturityOf(alice.address)) > BigInt(Math.floor(Date.now() / 1000)), true)

    await withdraw(vaultAddress, alice, 50_000_000n)
    assert.equal(await decryptPrincipal(vaultAddress, alice), 200_000_000n)
    assert.equal(await decryptTotal(vaultAddress, alice), 200_000_000n)
  })

  it("accrues the simulated APY by elapsed time and cannot replay a 90-day slice daily", async function () {
    const { owner, alice, prizePoolAddress, vault, vaultAddress } = await deployRewardFixture()
    const principal = 1_000_000_000n
    const reserve = 100_000_000n

    await deposit(vaultAddress, alice, principal)
    await fundRewards(vaultAddress, owner, reserve)
    await assert.rejects(vault.connect(alice).fundPrizePool(prizePoolAddress))

    const accrualStartedAt = await vault.lastAccruedAt()
    await advanceBy(90 * DAY)
    const firstReceipt = await (await vault.fundPrizePool(prizePoolAddress)).wait()
    const firstFundedAt = await blockTimestamp(firstReceipt)
    const firstReward = rewardFor(principal, firstFundedAt - accrualStartedAt)
    assert.equal(await decryptRewardReserve(vaultAddress, owner), reserve - firstReward)
    assert.equal(await decryptAccruedReward(vaultAddress, owner), 0n)

    await assert.rejects(vault.fundPrizePool(prizePoolAddress))
    await advanceBy(DAY)
    const secondReceipt = await (await vault.fundPrizePool(prizePoolAddress)).wait()
    const secondFundedAt = await blockTimestamp(secondReceipt)
    const secondReward = rewardFor(principal, secondFundedAt - firstFundedAt)
    assert.equal(await decryptRewardReserve(vaultAddress, owner), reserve - firstReward - secondReward)
    assert.equal(await decryptAccruedReward(vaultAddress, owner), 0n)
  })

  it("carries accrued rewards across reserve exhaustion and pays them after a top-up", async function () {
    const { owner, alice, prizePoolAddress, vault, vaultAddress } = await deployRewardFixture()
    const principal = 1_000_000_000n
    const initialReserve = 10_000_000n

    await deposit(vaultAddress, alice, principal)
    await fundRewards(vaultAddress, owner, initialReserve)
    const accrualStartedAt = await vault.lastAccruedAt()
    await advanceBy(90 * DAY)
    const firstReceipt = await (await vault.fundPrizePool(prizePoolAddress)).wait()
    const firstFundedAt = await blockTimestamp(firstReceipt)
    const accruedAtFirstFunding = rewardFor(principal, firstFundedAt - accrualStartedAt)

    assert.equal(await decryptRewardReserve(vaultAddress, owner), 0n)
    assert.equal(await decryptAccruedReward(vaultAddress, owner), accruedAtFirstFunding - initialReserve)

    const topUp = 100_000_000n
    await fundRewards(vaultAddress, owner, topUp)
    await advanceBy(DAY)
    const secondReceipt = await (await vault.fundPrizePool(prizePoolAddress)).wait()
    const secondFundedAt = await blockTimestamp(secondReceipt)
    const newlyAccrued = rewardFor(principal, secondFundedAt - firstFundedAt)
    const carriedAndNew = accruedAtFirstFunding - initialReserve + newlyAccrued

    assert.equal(await decryptRewardReserve(vaultAddress, owner), topUp - carriedAndNew)
    assert.equal(await decryptAccruedReward(vaultAddress, owner), 0n)
  })

  it("checkpoints encrypted accrual before deposits and withdrawals change principal", async function () {
    const { owner, alice, prizePoolAddress, vault, vaultAddress } = await deployRewardFixture()
    await deposit(vaultAddress, alice, 1_000_000_000n)
    await fundRewards(vaultAddress, owner, 100_000_000n)
    const firstPrincipalAt = await vault.lastAccruedAt()

    await advanceBy(30 * DAY)
    await deposit(vaultAddress, alice, 1_000_000_000n)
    const secondPrincipalAt = await vault.lastAccruedAt()

    await advanceBy(30 * DAY)
    await withdraw(vaultAddress, alice, 500_000_000n)
    const thirdPrincipalAt = await vault.lastAccruedAt()

    await advanceBy(30 * DAY)
    const receipt = await (await vault.fundPrizePool(prizePoolAddress)).wait()
    const fundedAt = await blockTimestamp(receipt)
    const expectedReward = rewardFor(1_000_000_000n, secondPrincipalAt - firstPrincipalAt) +
      rewardFor(2_000_000_000n, thirdPrincipalAt - secondPrincipalAt) +
      rewardFor(1_500_000_000n, fundedAt - thirdPrincipalAt)

    assert.equal(await decryptRewardReserve(vaultAddress, owner), 100_000_000n - expectedReward)
    assert.equal(await decryptAccruedReward(vaultAddress, owner), 0n)
  })
})

async function deployRewardFixture() {
  const [owner, alice] = await hre.ethers.getSigners()
  const token = await hre.ethers.deployContract("ConfidentialTokenFixture", [owner.address])
  await token.waitForDeployment()
  const tokenAddress = await token.getAddress()
  const prizePool = await hre.ethers.deployContract("ConfidentialPrizePool", [owner.address, tokenAddress])
  await prizePool.waitForDeployment()
  const prizePoolAddress = await prizePool.getAddress()
  const vault = await hre.ethers.deployContract("ConfidentialLiquidityVault", [owner.address, tokenAddress])
  await vault.waitForDeployment()
  const vaultAddress = await vault.getAddress()

  await hre.fhevm.assertCoprocessorInitialized(token, "ConfidentialTokenFixture")
  await hre.fhevm.assertCoprocessorInitialized(prizePool, "ConfidentialPrizePool")
  await hre.fhevm.assertCoprocessorInitialized(vault, "ConfidentialLiquidityVault")
  await mint(tokenAddress, owner.address, alice.address, 2_500_000_000n)
  await mint(tokenAddress, owner.address, owner.address, 500_000_000n)
  await (await token.connect(alice).setOperator(vaultAddress, 4_102_444_800)).wait()
  await (await token.connect(owner).setOperator(vaultAddress, 4_102_444_800)).wait()
  await (await prizePool.setRewardSource(vaultAddress)).wait()

  return { owner, alice, prizePoolAddress, vault, vaultAddress }
}

function rewardFor(principal, elapsed) {
  return (principal * 1_200n / 10_000n) * elapsed / YEAR
}

async function blockTimestamp(receipt) {
  const block = await hre.ethers.provider.getBlock(receipt.blockNumber)
  return BigInt(block.timestamp)
}

async function mint(tokenAddress, ownerAddress, recipient, amount) {
  const input = hre.fhevm.createEncryptedInput(tokenAddress, ownerAddress)
  input.add64(amount)
  const encrypted = await input.encrypt()
  const token = await hre.ethers.getContractAt("ConfidentialTokenFixture", tokenAddress)
  await (await token.mint(recipient, encrypted.handles[0], encrypted.inputProof)).wait()
}

async function deposit(vaultAddress, signer, amount) {
  const input = hre.fhevm.createEncryptedInput(vaultAddress, signer.address)
  input.add64(amount)
  const encrypted = await input.encrypt()
  const vault = await hre.ethers.getContractAt("ConfidentialLiquidityVault", vaultAddress)
  await (await vault.connect(signer).deposit(encrypted.handles[0], encrypted.inputProof)).wait()
}

async function withdraw(vaultAddress, signer, amount) {
  const input = hre.fhevm.createEncryptedInput(vaultAddress, signer.address)
  input.add64(amount)
  const encrypted = await input.encrypt()
  const vault = await hre.ethers.getContractAt("ConfidentialLiquidityVault", vaultAddress)
  await (await vault.connect(signer).withdraw(encrypted.handles[0], encrypted.inputProof)).wait()
}

async function fundRewards(vaultAddress, signer, amount) {
  const input = hre.fhevm.createEncryptedInput(vaultAddress, signer.address)
  input.add64(amount)
  const encrypted = await input.encrypt()
  const vault = await hre.ethers.getContractAt("ConfidentialLiquidityVault", vaultAddress)
  await (await vault.connect(signer).fundRewards(encrypted.handles[0], encrypted.inputProof)).wait()
}

async function decryptPrincipal(vaultAddress, signer) {
  const vault = await hre.ethers.getContractAt("ConfidentialLiquidityVault", vaultAddress)
  const handle = await vault.principalOf(signer.address)
  return hre.fhevm.userDecryptEuint(FhevmType.euint64, handle, vaultAddress, signer)
}

async function decryptTotal(vaultAddress, signer) {
  const vault = await hre.ethers.getContractAt("ConfidentialLiquidityVault", vaultAddress)
  const handle = await vault.totalPrincipal()
  return hre.fhevm.userDecryptEuint(FhevmType.euint64, handle, vaultAddress, signer)
}

async function decryptRewardReserve(vaultAddress, signer) {
  const vault = await hre.ethers.getContractAt("ConfidentialLiquidityVault", vaultAddress)
  const handle = await vault.rewardReserve()
  return hre.fhevm.userDecryptEuint(FhevmType.euint64, handle, vaultAddress, signer)
}

async function decryptAccruedReward(vaultAddress, signer) {
  const vault = await hre.ethers.getContractAt("ConfidentialLiquidityVault", vaultAddress)
  const handle = await vault.accruedReward()
  return hre.fhevm.userDecryptEuint(FhevmType.euint128, handle, vaultAddress, signer)
}

async function advanceBy(seconds) {
  await hre.network.provider.send("evm_increaseTime", [seconds])
  await hre.network.provider.send("evm_mine")
}
