const assert = require("node:assert/strict")
const hre = require("hardhat")
const { FhevmType } = require("@fhevm/hardhat-plugin")

const DAY = 86_400n

describe("ConfidentialPrizePool continuous draws", function () {
  it("uses a fixed daily epoch and jumps over elapsed empty periods without deadline drift", async function () {
    const { alice, pool } = await deployFixture()
    const epoch = await pool.drawEpoch()

    assert.equal(await pool.DRAW_PERIOD(), DAY)
    assert.equal(await pool.currentDrawId(), 1n)
    assertMetadata(await pool.drawMetadata(1), {
      scheduledOpen: epoch,
      scheduledClose: epoch + DAY,
      status: 0n,
    })

    await setNextTimestamp(epoch + DAY + 6n * 60n * 60n)
    await (await pool.closeDraw()).wait()

    assert.equal(await pool.currentDrawId(), 2n)
    assertMetadata(await pool.drawMetadata(2), {
      scheduledOpen: epoch + DAY,
      scheduledClose: epoch + 2n * DAY,
      status: 0n,
    })

    await setNextTimestamp(epoch + 4n * DAY + 1n)
    await (await pool.connect(alice).enterDraw()).wait()

    assert.equal(await pool.currentDrawId(), 5n)
    assertMetadata(await pool.drawMetadata(5), {
      scheduledOpen: epoch + 4n * DAY,
      scheduledClose: epoch + 5n * DAY,
      participantCount: 1n,
      status: 0n,
    })
    assert.equal((await pool.drawMetadata(3)).scheduledOpen, 0n)
    assert.equal((await pool.drawMetadata(4)).scheduledOpen, 0n)
  })

  it("routes mutations at the exact cutoff to the new draw and freezes the old draw", async function () {
    const { owner, alice, bob, token, pool, poolAddress } = await deployFixture()
    const tokenAddress = await token.getAddress()
    await mint(token, tokenAddress, owner, alice.address, 500n)
    await mint(token, tokenAddress, owner, bob.address, 500n)
    await mint(token, tokenAddress, owner, owner.address, 10n)
    await (await token.connect(alice).setOperator(poolAddress, 4_102_444_800)).wait()
    await (await token.connect(bob).setOperator(poolAddress, 4_102_444_800)).wait()
    await (await token.connect(owner).setOperator(poolAddress, 4_102_444_800)).wait()
    await fundPrize(pool, poolAddress, owner, 10n)

    const cutoff = (await pool.drawMetadata(1)).scheduledClose
    await setNextTimestamp(cutoff - 1n)
    await deposit(pool, poolAddress, alice, 100n)
    assert.equal(await pool.isEntered(1, alice.address), true)

    await setNextTimestamp(cutoff)
    await deposit(pool, poolAddress, bob, 200n)

    assert.equal(await pool.currentDrawId(), 2n)
    assertMetadata(await pool.drawMetadata(1), { participantCount: 1n, status: 1n })
    assertMetadata(await pool.drawMetadata(2), { participantCount: 1n, status: 0n })
    assert.equal(await pool.isEntered(1, bob.address), false)
    assert.equal(await pool.isEntered(2, bob.address), true)

    await withdraw(pool, poolAddress, alice, 40n)
    assert.equal(await decryptPrincipal(pool, poolAddress, alice), 60n)
    assertMetadata(await pool.drawMetadata(1), { participantCount: 1n, status: 1n })

    await (await pool.continueSelection(1, 12)).wait()
    assert.equal(await previewAndDecryptPrize(pool, poolAddress, alice, 1), 10n)
  })

  it("keeps historical selection and claims independent from the open entry draw", async function () {
    const { owner, alice, bob, token, pool, poolAddress } = await deployFixture()
    const tokenAddress = await token.getAddress()
    await mint(token, tokenAddress, owner, alice.address, 500n)
    await mint(token, tokenAddress, owner, bob.address, 500n)
    await mint(token, tokenAddress, owner, owner.address, 100n)
    await (await token.connect(alice).setOperator(poolAddress, 4_102_444_800)).wait()
    await (await token.connect(bob).setOperator(poolAddress, 4_102_444_800)).wait()
    await (await token.connect(owner).setOperator(poolAddress, 4_102_444_800)).wait()

    await deposit(pool, poolAddress, alice, 100n)
    await deposit(pool, poolAddress, bob, 300n)
    await fundPrize(pool, poolAddress, owner, 50n)

    const cutoff = (await pool.drawMetadata(1)).scheduledClose
    await setNextTimestamp(cutoff)
    await (await pool.closeDraw()).wait()
    await (await pool.connect(alice).enterDraw()).wait()

    assert.equal(await pool.currentDrawId(), 2n)
    assertMetadata(await pool.drawMetadata(1), { status: 1n })
    assertMetadata(await pool.drawMetadata(2), { participantCount: 1n, status: 0n })

    await (await pool.continueSelection(1, 1)).wait()
    assertMetadata(await pool.drawMetadata(1), { scanCursor: 1n, status: 1n })
    await (await pool.continueSelection(1, 1)).wait()
    assertMetadata(await pool.drawMetadata(1), { scanCursor: 2n, status: 2n })

    const alicePrize = await previewAndDecryptPrize(pool, poolAddress, alice, 1)
    const bobPrize = await previewAndDecryptPrize(pool, poolAddress, bob, 1)
    assert.deepEqual([alicePrize, bobPrize].sort(), [0n, 50n])

    const winner = alicePrize === 50n ? alice : bob
    const before = await decryptTokenBalance(token, tokenAddress, winner)
    await (await pool.connect(winner).claimPrize(1)).wait()
    assert.equal(await decryptTokenBalance(token, tokenAddress, winner), before + 50n)
    assert.equal(await pool.currentDrawId(), 2n)
    assertMetadata(await pool.drawMetadata(2), { status: 0n })
  })

  it("supports interleaved scans for two historical draws", async function () {
    const { owner, alice, bob, token, pool, poolAddress } = await deployFixture()
    const tokenAddress = await token.getAddress()
    await mint(token, tokenAddress, owner, alice.address, 500n)
    await mint(token, tokenAddress, owner, bob.address, 500n)
    await (await token.connect(alice).setOperator(poolAddress, 4_102_444_800)).wait()
    await (await token.connect(bob).setOperator(poolAddress, 4_102_444_800)).wait()

    await deposit(pool, poolAddress, alice, 100n)
    await deposit(pool, poolAddress, bob, 200n)
    await setNextTimestamp((await pool.drawMetadata(1)).scheduledClose)
    await (await pool.closeDraw()).wait()

    await (await pool.connect(alice).enterDraw()).wait()
    await (await pool.connect(bob).enterDraw()).wait()
    await setNextTimestamp((await pool.drawMetadata(2)).scheduledClose)
    await (await pool.closeDraw()).wait()

    await (await pool.continueSelection(1, 1)).wait()
    await (await pool.continueSelection(2, 1)).wait()
    await (await pool.continueSelection(1, 1)).wait()
    await (await pool.continueSelection(2, 1)).wait()

    assertMetadata(await pool.drawMetadata(1), { scanCursor: 2n, status: 2n })
    assertMetadata(await pool.drawMetadata(2), { scanCursor: 2n, status: 2n })
    assert.equal(await pool.currentDrawId(), 3n)
    assertMetadata(await pool.drawMetadata(3), { status: 0n })
  })

  it("routes prize funding at the cutoff to the new draw without mutating the frozen reserve", async function () {
    const { owner, alice, token, pool, poolAddress } = await deployFixture()
    const tokenAddress = await token.getAddress()
    await mint(token, tokenAddress, owner, alice.address, 100n)
    await mint(token, tokenAddress, owner, owner.address, 30n)
    await (await token.connect(alice).setOperator(poolAddress, 4_102_444_800)).wait()
    await (await token.connect(owner).setOperator(poolAddress, 4_102_444_800)).wait()

    await deposit(pool, poolAddress, alice, 100n)
    await fundPrize(pool, poolAddress, owner, 10n)
    await setNextTimestamp((await pool.drawMetadata(1)).scheduledClose)
    await fundPrize(pool, poolAddress, owner, 20n)

    assert.equal(await pool.currentDrawId(), 2n)
    await (await pool.continueSelection(1, 12)).wait()
    assert.equal(await previewAndDecryptPrize(pool, poolAddress, alice, 1), 10n)

    await (await pool.connect(alice).enterDraw()).wait()
    await setNextTimestamp((await pool.drawMetadata(2)).scheduledClose)
    await (await pool.closeDraw()).wait()
    await (await pool.continueSelection(2, 12)).wait()
    assert.equal(await previewAndDecryptPrize(pool, poolAddress, alice, 2), 20n)
  })

  it("clamps principal before transfer and reuses only released encrypted headroom", async function () {
    const { owner, alice, token, pool, poolAddress } = await deployFixture()
    const tokenAddress = await token.getAddress()
    const cap = await pool.MAX_POOL_PRINCIPAL()
    await mint(token, tokenAddress, owner, alice.address, cap + 100n)
    await (await token.connect(alice).setOperator(poolAddress, 4_102_444_800)).wait()

    await deposit(pool, poolAddress, alice, cap + 100n)
    assert.equal(await decryptPrincipal(pool, poolAddress, alice), cap)
    assert.equal(await decryptTokenBalance(token, tokenAddress, alice), 100n)

    await withdraw(pool, poolAddress, alice, 1n)
    await deposit(pool, poolAddress, alice, 100n)
    assert.equal(await decryptPrincipal(pool, poolAddress, alice), cap)
    assert.equal(await decryptTokenBalance(token, tokenAddress, alice), 100n)
  })

  it("clamps aggregate prize custody before ERC-7984 transfer recipient addition", async function () {
    const { owner, token, pool, poolAddress } = await deployFixture()
    const tokenAddress = await token.getAddress()
    const cap = await pool.MAX_PRIZE_RESERVES()
    await mint(token, tokenAddress, owner, owner.address, cap + 100n)
    await (await token.connect(owner).setOperator(poolAddress, 4_102_444_800)).wait()

    await fundPrize(pool, poolAddress, owner, cap)
    assert.equal(await decryptTokenBalance(token, tokenAddress, owner), 100n)

    await fundPrize(pool, poolAddress, owner, 100n)
    assert.equal(await decryptTokenBalance(token, tokenAddress, owner), 100n)
  })

  it("completes an all-zero-weight draw without inventing a winner or revealing the total", async function () {
    const { owner, alice, token, pool, poolAddress } = await deployFixture()
    const tokenAddress = await token.getAddress()
    await mint(token, tokenAddress, owner, owner.address, 10n)
    await (await token.connect(alice).setOperator(poolAddress, 4_102_444_800)).wait()
    await (await token.connect(owner).setOperator(poolAddress, 4_102_444_800)).wait()

    await deposit(pool, poolAddress, alice, 0n)
    await fundPrize(pool, poolAddress, owner, 10n)
    await setNextTimestamp((await pool.drawMetadata(1)).scheduledClose)
    await (await pool.closeDraw()).wait()
    await (await pool.continueSelection(1, 12)).wait()

    assertMetadata(await pool.drawMetadata(1), { participantCount: 1n, scanCursor: 1n, status: 2n })
    assert.equal(await previewAndDecryptPrize(pool, poolAddress, alice, 1), 0n)

    await setNextTimestamp((await pool.drawMetadata(1)).claimExpiresAt)
    await (await pool.sweepExpiredPrize(1)).wait()
    assertMetadata(await pool.drawMetadata(1), { status: 4n })
  })

  it("sweeps a claimed zero remainder through the same public path and rejects a second sweep", async function () {
    const { owner, alice, token, pool, poolAddress } = await deployFixture()
    const tokenAddress = await token.getAddress()
    await mint(token, tokenAddress, owner, alice.address, 100n)
    await mint(token, tokenAddress, owner, owner.address, 10n)
    await (await token.connect(alice).setOperator(poolAddress, 4_102_444_800)).wait()
    await (await token.connect(owner).setOperator(poolAddress, 4_102_444_800)).wait()
    await deposit(pool, poolAddress, alice, 100n)
    await fundPrize(pool, poolAddress, owner, 10n)
    await setNextTimestamp((await pool.drawMetadata(1)).scheduledClose)
    await (await pool.closeDraw()).wait()
    await (await pool.continueSelection(1, 12)).wait()
    await (await pool.connect(alice).claimPrize(1)).wait()

    await setNextTimestamp((await pool.drawMetadata(1)).claimExpiresAt)
    await (await pool.sweepExpiredPrize(1)).wait()
    assertMetadata(await pool.drawMetadata(1), { status: 4n })
    await assert.rejects(pool.sweepExpiredPrize(1))
  })
})

function assertMetadata(actual, expected) {
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(actual[key], value, `metadata.${key}`)
  }
}

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

async function decryptPrincipal(pool, poolAddress, signer) {
  const handle = await pool.principalOf(signer.address)
  return hre.fhevm.userDecryptEuint(FhevmType.euint64, handle, poolAddress, signer)
}

async function decryptTokenBalance(token, tokenAddress, signer) {
  const handle = await token.confidentialBalanceOf(signer.address)
  return hre.fhevm.userDecryptEuint(FhevmType.euint64, handle, tokenAddress, signer)
}

async function setNextTimestamp(timestamp) {
  await hre.network.provider.send("evm_setNextBlockTimestamp", [Number(timestamp)])
}
