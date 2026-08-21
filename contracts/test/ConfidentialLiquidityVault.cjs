const assert = require("node:assert/strict")
const hre = require("hardhat")
const { FhevmType } = require("@fhevm/hardhat-plugin")

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

  it("uses a funded reward reserve as the 12 percent APY source for prize liquidity", async function () {
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

    await mint(tokenAddress, owner.address, alice.address, 2_000_000_000n)
    await mint(tokenAddress, owner.address, owner.address, 500_000_000n)
    await (await token.connect(alice).setOperator(vaultAddress, 4_102_444_800)).wait()
    await (await token.connect(owner).setOperator(vaultAddress, 4_102_444_800)).wait()
    await (await token.connect(alice).setOperator(prizePoolAddress, 4_102_444_800)).wait()
    await (await prizePool.setRewardSource(vaultAddress)).wait()

    await deposit(vaultAddress, alice, 1_000_000_000n)
    await fundRewards(vaultAddress, owner, 100_000_000n)
    await assert.rejects(vault.connect(alice).fundPrizePool(prizePoolAddress))

    await (await vault.fundPrizePool(prizePoolAddress)).wait()
    assert.equal(await decryptRewardReserve(vaultAddress, owner), 70_500_000n)
    await assert.rejects(vault.fundPrizePool(prizePoolAddress))

    await depositPrizePool(prizePool, prizePoolAddress, alice, 100_000_000n)
    await advanceBy(7 * 24 * 60 * 60)
    await (await prizePool.closeDraw()).wait()
    await (await prizePool.continueSelection(12)).wait()

    const prize = await previewAndDecryptPrize(prizePool, prizePoolAddress, alice, 1)
    assert.equal(prize, 29_500_000n)
  })
})

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

async function depositPrizePool(pool, poolAddress, signer, amount) {
  const input = hre.fhevm.createEncryptedInput(poolAddress, signer.address)
  input.add64(amount)
  const encrypted = await input.encrypt()
  await (await pool.connect(signer).deposit(encrypted.handles[0], encrypted.inputProof)).wait()
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

async function previewAndDecryptPrize(pool, poolAddress, signer, drawId) {
  await (await pool.connect(signer).previewPrize(drawId)).wait()
  const handle = await pool.prizePreviewOf(drawId, signer.address)
  return hre.fhevm.userDecryptEuint(FhevmType.euint64, handle, poolAddress, signer)
}

async function advanceBy(seconds) {
  await hre.network.provider.send("evm_increaseTime", [seconds])
  await hre.network.provider.send("evm_mine")
}
