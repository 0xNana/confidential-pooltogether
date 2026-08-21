const assert = require("node:assert/strict")
const hre = require("hardhat")
const { FhevmType } = require("@fhevm/hardhat-plugin")

describe("ConfidentialPrizePool", function () {
  it("preserves ACL across deposits and withdraws only available principal", async function () {
    const [owner, alice] = await hre.ethers.getSigners()

    const token = await hre.ethers.deployContract("ConfidentialTokenFixture", [owner.address])
    await token.waitForDeployment()
    const tokenAddress = await token.getAddress()

    const pool = await hre.ethers.deployContract("ConfidentialPrizePool", [owner.address, tokenAddress])
    await pool.waitForDeployment()
    const poolAddress = await pool.getAddress()

    await hre.fhevm.assertCoprocessorInitialized(token, "ConfidentialTokenFixture")
    await hre.fhevm.assertCoprocessorInitialized(pool, "ConfidentialPrizePool")

    const mintInput = hre.fhevm.createEncryptedInput(tokenAddress, owner.address)
    mintInput.add64(1_000_000_000n)
    const encryptedMint = await mintInput.encrypt()
    await (await token.mint(alice.address, encryptedMint.handles[0], encryptedMint.inputProof)).wait()

    await (await token.connect(alice).setOperator(poolAddress, 4_102_444_800)).wait()

    await deposit(pool, poolAddress, alice, 250_000_000n)
    await deposit(pool, poolAddress, alice, 100_000_000n)
    assert.equal(await decryptPrincipal(pool, poolAddress, alice), 350_000_000n)

    await withdraw(pool, poolAddress, alice, 50_000_000n)
    assert.equal(await decryptPrincipal(pool, poolAddress, alice), 300_000_000n)

    await withdraw(pool, poolAddress, alice, 900_000_000n)
    assert.equal(await decryptPrincipal(pool, poolAddress, alice), 300_000_000n)
  })

  it("keeps the aggregate private and starts selection after the scheduled close", async function () {
    const { owner, token, pool, poolAddress, alice } = await deployFixture()
    await mint(token, await token.getAddress(), owner, alice.address, 500_000_000n)
    await (await token.connect(alice).setOperator(poolAddress, 4_102_444_800)).wait()
    await deposit(pool, poolAddress, alice, 250_000_000n)

    assert.equal(pool.interface.hasFunction("snapshotTotal"), false)
    assert.equal(pool.interface.hasFunction("finalizeSnapshot"), false)

    await assert.rejects(pool.connect(alice).closeDraw())
    await advanceTo(await pool.drawClosesAt())
    await (await pool.connect(alice).closeDraw()).wait()

    assert.equal(await pool.phase(), 1n)
    assert.equal(await pool.scanCursor(), 0n)
  })

  it("selects exactly one private winner without publishing the pool total", async function () {
    const { owner, alice, bob, token, pool, poolAddress } = await deployFixture()
    await mint(token, await token.getAddress(), owner, alice.address, 500_000_000n)
    await mint(token, await token.getAddress(), owner, bob.address, 500_000_000n)
    await mint(token, await token.getAddress(), owner, owner.address, 100_000_000n)
    await (await token.connect(alice).setOperator(poolAddress, 4_102_444_800)).wait()
    await (await token.connect(bob).setOperator(poolAddress, 4_102_444_800)).wait()
    await (await token.connect(owner).setOperator(poolAddress, 4_102_444_800)).wait()

    await deposit(pool, poolAddress, alice, 100_000_000n)
    await deposit(pool, poolAddress, bob, 300_000_000n)
    await fundPrize(pool, poolAddress, owner, 50_000_000n)
    await advanceTo(await pool.drawClosesAt())
    await (await pool.closeDraw()).wait()
    await (await pool.continueSelection(12)).wait()

    assert.equal(await pool.drawClaimable(1), true)
    const alicePrize = await previewAndDecryptPrize(pool, poolAddress, alice, 1)
    const bobPrize = await previewAndDecryptPrize(pool, poolAddress, bob, 1)
    assert.deepEqual([alicePrize, bobPrize].sort(), [0n, 50_000_000n])
  })

  it("rolls an unclaimed encrypted reserve into the next draw after the claim window", async function () {
    const { owner, alice, bob, token, pool, poolAddress } = await deployFixture()
    await mint(token, await token.getAddress(), owner, alice.address, 500_000_000n)
    await mint(token, await token.getAddress(), owner, bob.address, 500_000_000n)
    await mint(token, await token.getAddress(), owner, owner.address, 100_000_000n)
    await (await token.connect(alice).setOperator(poolAddress, 4_102_444_800)).wait()
    await (await token.connect(bob).setOperator(poolAddress, 4_102_444_800)).wait()
    await (await token.connect(owner).setOperator(poolAddress, 4_102_444_800)).wait()

    await deposit(pool, poolAddress, alice, 100_000_000n)
    await withdraw(pool, poolAddress, alice, 100_000_000n)
    await fundPrize(pool, poolAddress, owner, 50_000_000n)
    await advanceTo(await pool.drawClosesAt())
    await (await pool.closeDraw()).wait()
    await (await pool.continueSelection(12)).wait()

    const claimClosesAt = await pool.drawClaimClosesAt(1)
    await assert.rejects(pool.connect(alice).openNextDraw())
    await advanceTo(claimClosesAt)
    await assert.rejects(pool.connect(alice).claimPrize(1))
    await (await pool.connect(alice).openNextDraw()).wait()
    assert.equal(await pool.drawId(), 2n)
    assert.equal(await pool.drawClaimable(1), false)

    await deposit(pool, poolAddress, bob, 100_000_000n)
    await advanceTo(await pool.drawClosesAt())
    await (await pool.closeDraw()).wait()
    await (await pool.continueSelection(12)).wait()
    const bobPrize = await previewAndDecryptPrize(pool, poolAddress, bob, 2)
    assert.equal(bobPrize, 50_000_000n)
  })
})

async function deployFixture() {
  const [owner, alice, bob] = await hre.ethers.getSigners()
  const token = await hre.ethers.deployContract("ConfidentialTokenFixture", [owner.address])
  await token.waitForDeployment()
  const pool = await hre.ethers.deployContract("ConfidentialPrizePool", [owner.address, await token.getAddress()])
  await pool.waitForDeployment()
  await hre.fhevm.assertCoprocessorInitialized(token, "ConfidentialTokenFixture")
  await hre.fhevm.assertCoprocessorInitialized(pool, "ConfidentialPrizePool")
  return { owner, alice, bob, token, pool, poolAddress: await pool.getAddress() }
}

async function mint(token, tokenAddress, owner, to, amount) {
  const input = hre.fhevm.createEncryptedInput(tokenAddress, owner.address)
  input.add64(amount)
  const encrypted = await input.encrypt()
  await (await token.mint(to, encrypted.handles[0], encrypted.inputProof)).wait()
}

async function deposit(pool, poolAddress, signer, amount) {
  const input = hre.fhevm.createEncryptedInput(poolAddress, signer.address)
  input.add64(amount)
  const encrypted = await input.encrypt()
  await (await pool.connect(signer).deposit(encrypted.handles[0], encrypted.inputProof)).wait()
}

async function withdraw(pool, poolAddress, signer, amount) {
  const input = hre.fhevm.createEncryptedInput(poolAddress, signer.address)
  input.add64(amount)
  const encrypted = await input.encrypt()
  await (await pool.connect(signer).withdraw(encrypted.handles[0], encrypted.inputProof)).wait()
}

async function fundPrize(pool, poolAddress, signer, amount) {
  const input = hre.fhevm.createEncryptedInput(poolAddress, signer.address)
  input.add64(amount)
  const encrypted = await input.encrypt()
  await (await pool.connect(signer).fundPrize(encrypted.handles[0], encrypted.inputProof)).wait()
}

async function previewAndDecryptPrize(pool, poolAddress, signer, drawId) {
  await (await pool.connect(signer).previewPrize(drawId)).wait()
  const handle = await pool.prizePreviewOf(drawId, signer.address)
  return hre.fhevm.userDecryptEuint(FhevmType.euint64, handle, poolAddress, signer)
}

async function advanceTo(timestamp) {
  await hre.network.provider.send("evm_setNextBlockTimestamp", [Number(timestamp)])
  await hre.network.provider.send("evm_mine")
}

async function decryptPrincipal(pool, poolAddress, signer) {
  const encryptedPrincipal = await pool.principalOf(signer.address)
  return hre.fhevm.userDecryptEuint(
    FhevmType.euint64,
    encryptedPrincipal,
    poolAddress,
    signer,
  )
}
