const fs = require("node:fs")
const path = require("node:path")
const hre = require("hardhat")
const { getAddress, isAddress } = require("ethers")
const { TOKENS } = require("./token-config.cjs")
const { buildTopUpPlan } = require("./test-account-funding-plan.cjs")
const { retryOperation } = require("./retry-operation.cjs")

const EXECUTE = process.env.TEST_ACCOUNTS_EXECUTE === "1"
const EXPECTED_ACCOUNT_COUNT = 20
const ETH_TARGET = hre.ethers.parseEther("0.1")
const TOKEN_TARGET = hre.ethers.parseUnits("1000", 6)
const TRANSFER_GAS_LIMIT = 21_000n
const CONSERVATIVE_MINT_GAS_LIMIT = 100_000n
const GAS_SAFETY_MULTIPLIER = 2n
const workspaceDirectory = path.resolve(__dirname, "..", "..")
const accountsPath = path.join(workspaceDirectory, "internal-docs", "test-accounts.json")
const evidencePath = path.join(workspaceDirectory, "internal-docs", "test-account-funding-evidence.json")

async function main() {
  const [deployer] = await hre.ethers.getSigners()
  if (!deployer) throw new Error("No deployer configured")
  const network = await hre.ethers.provider.getNetwork()
  if (network.chainId !== 11155111n) throw new Error(`Expected Sepolia, received chain ${network.chainId}`)

  const accounts = loadAndValidateAccounts()
  const usdt = faucetToken(TOKENS.cUSDT.underlying, deployer)
  const usdc = faucetToken(TOKENS.cUSDC.underlying, deployer)
  await validateOfficialWrappers()

  const balances = await readBalances(accounts, usdt, usdc)
  const plan = buildTopUpPlan(balances, { eth: ETH_TARGET, usdt: TOKEN_TARGET, usdc: TOKEN_TARGET })
  const ethTransfers = plan.accounts.filter((account) => account.eth > 0n)
  const usdtMints = plan.accounts.filter((account) => account.usdt > 0n)
  const usdcMints = plan.accounts.filter((account) => account.usdc > 0n)
  const feeData = await rpcRead(() => hre.ethers.provider.getFeeData())
  const feePerGas = feeData.maxFeePerGas ?? feeData.gasPrice
  if (!feePerGas) throw new Error("Sepolia provider returned no usable gas price")
  const gasUnits = BigInt(ethTransfers.length) * TRANSFER_GAS_LIMIT
    + BigInt(usdtMints.length + usdcMints.length) * CONSERVATIVE_MINT_GAS_LIMIT
  const gasReserve = gasUnits * feePerGas * GAS_SAFETY_MULTIPLIER
  const requiredBalance = plan.totals.eth + gasReserve
  const deployerBalance = await rpcRead(() => hre.ethers.provider.getBalance(deployer.address))

  const summary = {
    network: "sepolia",
    execute: EXECUTE,
    deployer: deployer.address,
    accountCount: accounts.length,
    targets: { eth: "0.1", usdt: "1000.0", usdc: "1000.0" },
    actions: { ethTransfers: ethTransfers.length, usdtMints: usdtMints.length, usdcMints: usdcMints.length },
    totals: {
      eth: hre.ethers.formatEther(plan.totals.eth),
      usdt: hre.ethers.formatUnits(plan.totals.usdt, 6),
      usdc: hre.ethers.formatUnits(plan.totals.usdc, 6),
    },
    deployerBalanceEth: hre.ethers.formatEther(deployerBalance),
    conservativeGasReserveEth: hre.ethers.formatEther(gasReserve),
    requiredBalanceEth: hre.ethers.formatEther(requiredBalance),
  }
  console.log(JSON.stringify(summary, null, 2))

  if (deployerBalance < requiredBalance) {
    throw new Error(`Insufficient deployer balance: need ${summary.requiredBalanceEth} ETH, have ${summary.deployerBalanceEth} ETH`)
  }
  if (!EXECUTE) {
    console.log("Dry run only. Set TEST_ACCOUNTS_EXECUTE=1 to submit the planned Sepolia transactions.")
    return
  }

  const evidence = loadExistingEvidence(summary)
  for (const account of ethTransfers) {
    evidence.submitted.push(await send(`fund-eth-${account.address}`, deployer.sendTransaction({ to: account.address, value: account.eth })))
    persistEvidence(evidence, "funding-eth")
  }
  for (const account of usdtMints) {
    evidence.submitted.push(await send(`mint-usdt-${account.address}`, usdt.mint(account.address, account.usdt)))
    persistEvidence(evidence, "minting-usdt")
  }
  for (const account of usdcMints) {
    evidence.submitted.push(await send(`mint-usdc-${account.address}`, usdc.mint(account.address, account.usdc)))
    persistEvidence(evidence, "minting-usdc")
  }

  const finalBalances = await readBalances(accounts, usdt, usdc)
  const complete = finalBalances.every((balances) => (
    balances.eth >= ETH_TARGET && balances.usdt >= TOKEN_TARGET && balances.usdc >= TOKEN_TARGET
  ))
  if (!complete) throw new Error("Post-funding balance verification failed")

  evidence.completedAt = new Date().toISOString()
  evidence.verified = { accountCount: accounts.length, allTargetsMet: true }
  persistEvidence(evidence, "complete")
  console.log(JSON.stringify({ stage: "complete", accountCount: accounts.length, allTargetsMet: true }))
}

function loadAndValidateAccounts() {
  if (!fs.existsSync(accountsPath)) throw new Error("internal-docs/test-accounts.json is missing")
  const document = JSON.parse(fs.readFileSync(accountsPath, "utf8"))
  if (document.network !== "sepolia") throw new Error("Test-account file is not scoped to Sepolia")
  if (!Array.isArray(document.accounts) || document.accounts.length !== EXPECTED_ACCOUNT_COUNT) {
    throw new Error(`Expected exactly ${EXPECTED_ACCOUNT_COUNT} test accounts`)
  }
  const accounts = document.accounts.map((account, offset) => {
    if (account.index !== offset + 1 || !isAddress(account.address)) throw new Error(`Invalid test account at index ${offset + 1}`)
    return { index: account.index, address: getAddress(account.address) }
  })
  if (new Set(accounts.map((account) => account.address.toLowerCase())).size !== accounts.length) {
    throw new Error("Test-account file contains duplicate addresses")
  }
  return accounts
}

async function validateOfficialWrappers() {
  for (const token of [TOKENS.cUSDT, TOKENS.cUSDC]) {
    const wrapper = new hre.ethers.Contract(token.asset, ["function underlying() view returns (address)"], hre.ethers.provider)
    const underlying = await rpcRead(() => wrapper.underlying())
    if (underlying.toLowerCase() !== token.underlying.toLowerCase()) {
      throw new Error(`${token.symbol} wrapper/underlying mismatch`)
    }
  }
}

function faucetToken(address, signer) {
  return new hre.ethers.Contract(address, [
    "function balanceOf(address) view returns (uint256)",
    "function mint(address,uint256) returns (bool)",
  ], signer)
}

async function send(label, transactionPromise) {
  const transaction = await transactionPromise
  console.log(JSON.stringify({ stage: "submitted", label, transactionHash: transaction.hash }))
  let receipt
  try {
    receipt = await transaction.wait()
  } catch (error) {
    console.error(JSON.stringify({ stage: "receipt-recovery", label, transactionHash: transaction.hash, error: error instanceof Error ? error.message : String(error) }))
    receipt = await recoverReceipt(transaction.hash)
  }
  if (!receipt || receipt.status !== 1) throw new Error(`Transaction failed: ${transaction.hash}`)
  console.log(JSON.stringify({ stage: "confirmed", label, transactionHash: transaction.hash, blockNumber: receipt.blockNumber }))
  return {
    label,
    transactionHash: transaction.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    url: `https://sepolia.etherscan.io/tx/${transaction.hash}`,
  }
}

async function readBalances(accounts, usdt, usdc) {
  const balances = []
  for (const account of accounts) {
    const eth = await rpcRead(() => hre.ethers.provider.getBalance(account.address))
    const usdtBalance = await rpcRead(() => usdt.balanceOf(account.address))
    const usdcBalance = await rpcRead(() => usdc.balanceOf(account.address))
    balances.push({ address: account.address, eth, usdt: usdtBalance, usdc: usdcBalance })
  }
  return balances
}

async function rpcRead(operation) {
  return retryOperation(operation, {
    attempts: 5,
    delay: async (attempt) => new Promise((resolve) => setTimeout(resolve, attempt * 1_500)),
  })
}

async function recoverReceipt(hash) {
  return retryOperation(async () => {
    const receipt = await hre.ethers.provider.getTransactionReceipt(hash)
    if (!receipt) throw new Error(`Receipt not yet available for ${hash}`)
    return receipt
  }, {
    attempts: 20,
    delay: async () => new Promise((resolve) => setTimeout(resolve, 3_000)),
  })
}

function loadExistingEvidence(summary) {
  let submitted = []
  if (fs.existsSync(evidencePath)) {
    const previous = JSON.parse(fs.readFileSync(evidencePath, "utf8"))
    if (Array.isArray(previous.submitted)) submitted = previous.submitted
  }
  return { startedAt: new Date().toISOString(), ...summary, submitted }
}

function persistEvidence(evidence, stage) {
  const updated = { ...evidence, stage, updatedAt: new Date().toISOString() }
  fs.writeFileSync(evidencePath, `${JSON.stringify(updated, null, 2)}\n`, { encoding: "utf8", mode: 0o600 })
  fs.chmodSync(evidencePath, 0o600)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
