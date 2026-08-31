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
    await advanceTo((await pool.currentDrawMetadata()).scheduledClose)
    await (await pool.connect(alice).closeDraw()).wait()

    const metadata = await pool.drawMetadata(1)
    assert.equal(metadata.status, 1n)
    assert.equal(metadata.scanCursor, 0n)
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
    await advanceTo((await pool.currentDrawMetadata()).scheduledClose)
    await (await pool.closeDraw()).wait()
    await (await pool.continueSelection(1, 12)).wait()

    assert.equal((await pool.drawMetadata(1)).status, 2n)
    const alicePrize = await previewAndDecryptPrize(pool, poolAddress, alice, 1)
    const bobPrize = await previewAndDecryptPrize(pool, poolAddress, bob, 1)
    assert.deepEqual([alicePrize, bobPrize].sort(), [0n, 50_000_000n])
  })

  it("conserves principal and prize value across winner, non-winner, repeat claim, and withdrawal paths", async function () {
    const { owner, alice, bob, token, pool, poolAddress } = await deployFixture()
    const tokenAddress = await token.getAddress()
    await mint(token, tokenAddress, owner, alice.address, 500_000_000n)
    await mint(token, tokenAddress, owner, bob.address, 500_000_000n)
    await mint(token, tokenAddress, owner, owner.address, 100_000_000n)
    await (await token.connect(alice).setOperator(poolAddress, 4_102_444_800)).wait()
    await (await token.connect(bob).setOperator(poolAddress, 4_102_444_800)).wait()
    await (await token.connect(owner).setOperator(poolAddress, 4_102_444_800)).wait()

    await deposit(pool, poolAddress, alice, 100_000_000n)
    await deposit(pool, poolAddress, bob, 300_000_000n)
    await fundPrize(pool, poolAddress, owner, 50_000_000n)
    await advanceTo((await pool.currentDrawMetadata()).scheduledClose)
    await (await pool.closeDraw()).wait()
    await (await pool.continueSelection(1, 12)).wait()

    const alicePrize = await previewAndDecryptPrize(pool, poolAddress, alice, 1)
    const bobPrize = await previewAndDecryptPrize(pool, poolAddress, bob, 1)
    const winner = alicePrize === 50_000_000n ? alice : bob
    const nonWinner = winner === alice ? bob : alice

    const winnerBefore = await decryptTokenBalance(token, tokenAddress, winner)
    const nonWinnerBefore = await decryptTokenBalance(token, tokenAddress, nonWinner)
    await (await pool.connect(nonWinner).claimPrize(1)).wait()
    assert.equal(await decryptTokenBalance(token, tokenAddress, nonWinner), nonWinnerBefore)

    await (await pool.connect(winner).claimPrize(1)).wait()
    assert.equal(await decryptTokenBalance(token, tokenAddress, winner), winnerBefore + 50_000_000n)
    await (await pool.connect(winner).claimPrize(1)).wait()
    assert.equal(await decryptTokenBalance(token, tokenAddress, winner), winnerBefore + 50_000_000n)

    assert.equal(await decryptPrincipal(pool, poolAddress, alice), 100_000_000n)
    assert.equal(await decryptPrincipal(pool, poolAddress, bob), 300_000_000n)
    await withdraw(pool, poolAddress, alice, 100_000_000n)
    await withdraw(pool, poolAddress, bob, 300_000_000n)
    assert.equal(await decryptPrincipal(pool, poolAddress, alice), 0n)
    assert.equal(await decryptPrincipal(pool, poolAddress, bob), 0n)
    assert.equal(await decryptTokenBalance(token, tokenAddress, alice), 500_000_000n + alicePrize)
    assert.equal(await decryptTokenBalance(token, tokenAddress, bob), 500_000_000n + bobPrize)
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
    await advanceTo((await pool.currentDrawMetadata()).scheduledClose)
    await (await pool.closeDraw()).wait()
    await (await pool.continueSelection(1, 12)).wait()

    const claimClosesAt = (await pool.drawMetadata(1)).claimExpiresAt
    assert.equal(await pool.actionableDrawCount(), 1n)
    assert.deepEqual(Array.from(await pool.actionableDrawIds(0, 32)), [1n])
    await assert.rejects(pool.actionableDrawIds(0, 33))
    await assert.rejects(pool.connect(alice).sweepExpiredPrize(1))
    await advanceTo(claimClosesAt)
    await assert.rejects(pool.connect(alice).claimPrize(1))
    await (await pool.connect(alice).sweepExpiredPrize(1)).wait()
    const rolloverDrawId = await pool.currentDrawId()
    assert.equal(rolloverDrawId > 1n, true)
    assert.equal((await pool.drawMetadata(1)).status, 4n)
    assert.equal(await pool.actionableDrawCount(), 1n)
    assert.deepEqual(Array.from(await pool.actionableDrawIds(0, 32)), [2n])

    await deposit(pool, poolAddress, bob, 100_000_000n)
    await advanceTo((await pool.currentDrawMetadata()).scheduledClose)
    await (await pool.closeDraw()).wait()
    await (await pool.continueSelection(rolloverDrawId, 12)).wait()
    const bobPrize = await previewAndDecryptPrize(pool, poolAddress, bob, rolloverDrawId)
    assert.equal(bobPrize, 50_000_000n)
  })

  it("reclaims zero-deposit and fully withdrawn enrollment slots on rollover", async function () {
    const { owner, alice, bob, token, pool, poolAddress } = await deployFixture()
    const tokenAddress = await token.getAddress()
    await mint(token, tokenAddress, owner, bob.address, 100_000_000n)
    await (await token.connect(alice).setOperator(poolAddress, 4_102_444_800)).wait()
    await (await token.connect(bob).setOperator(poolAddress, 4_102_444_800)).wait()

    await deposit(pool, poolAddress, alice, 0n)
    await deposit(pool, poolAddress, bob, 100_000_000n)
    await withdraw(pool, poolAddress, bob, 100_000_000n)
    assert.equal(await pool.participantCount(), 2n)
    assert.equal(await pool.isEnteredCurrent(alice.address), true)
    assert.equal(await pool.isEnteredCurrent(bob.address), true)

    await rollToNextDraw(pool)

    assert.equal(await pool.participantCount(), 0n)
    assert.equal(await pool.isEnteredCurrent(alice.address), false)
    assert.equal(await pool.isEnteredCurrent(bob.address), false)
  })

  it("lets carried principal opt into repeated draws without another transfer", async function () {
    const { owner, alice, token, pool, poolAddress } = await deployFixture()
    await mint(token, await token.getAddress(), owner, alice.address, 100_000_000n)
    await (await token.connect(alice).setOperator(poolAddress, 4_102_444_800)).wait()
    await deposit(pool, poolAddress, alice, 100_000_000n)

    await rollToNextDraw(pool)
    assert.equal(await decryptPrincipal(pool, poolAddress, alice), 100_000_000n)
    assert.equal(await pool.participantCount(), 0n)

    await (await pool.connect(alice).enterDraw()).wait()
    assert.equal(await pool.isEnteredCurrent(alice.address), true)
    assert.equal(await pool.participantCount(), 1n)

    await advanceTo((await pool.currentDrawMetadata()).scheduledClose)
    await (await pool.closeDraw()).wait()
    await (await pool.continueSelection(2, 12)).wait()
    assert.equal((await pool.drawMetadata(2)).status, 2n)
  })

  it("bounds enrollment per draw and rejects the 257th distinct address", async function () {
    const { pool } = await deployFixture()
    const maxParticipants = Number(await pool.MAX_PARTICIPANTS())
    const entrants = await impersonatedSigners(maxParticipants + 1)

    for (const entrant of entrants.slice(0, maxParticipants)) {
      await (await pool.connect(entrant).enterDraw()).wait()
    }

    assert.equal(await pool.participantCount(), BigInt(maxParticipants))
    await assert.rejects(pool.connect(entrants[maxParticipants]).enterDraw())
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

async function rollToNextDraw(pool) {
  const drawId = await pool.currentDrawId()
  await advanceTo((await pool.currentDrawMetadata()).scheduledClose)
  await (await pool.closeDraw()).wait()
  await (await pool.continueSelection(drawId, 12)).wait()
}

async function impersonatedSigners(count) {
  const signers = []
  for (let index = 0; index < count; index += 1) {
    const address = hre.ethers.getAddress(hre.ethers.zeroPadValue(hre.ethers.toBeHex(0x10000 + index), 20))
    await hre.network.provider.send("hardhat_setBalance", [address, "0x56BC75E2D63100000"])
    await hre.network.provider.send("hardhat_impersonateAccount", [address])
    signers.push(await hre.ethers.getSigner(address))
  }
  return signers
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

async function decryptTokenBalance(token, tokenAddress, signer) {
  const encryptedBalance = await token.confidentialBalanceOf(signer.address)
  return hre.fhevm.userDecryptEuint(
    FhevmType.euint64,
    encryptedBalance,
    tokenAddress,
    signer,
  )
}
