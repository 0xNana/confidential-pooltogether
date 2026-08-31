const fs = require("node:fs")
const path = require("node:path")
const { Wallet } = require("ethers")

const accountCount = 20
const outputPath = path.resolve(__dirname, "..", "..", "internal-docs", "test-accounts.json")
const outputDirectory = path.dirname(outputPath)

fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 })

const accounts = Array.from({ length: accountCount }, (_, offset) => {
  const wallet = Wallet.createRandom()
  return {
    index: offset + 1,
    address: wallet.address,
    privateKey: wallet.privateKey,
  }
})

const document = {
  version: 1,
  network: "sepolia",
  createdAt: new Date().toISOString(),
  generation: "independent-cryptographically-random-wallets",
  warning: "TESTNET KEYS ONLY. Never fund these addresses on a production network.",
  accounts,
}

let descriptor
try {
  descriptor = fs.openSync(outputPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600)
  fs.writeFileSync(descriptor, `${JSON.stringify(document, null, 2)}\n`, "utf8")
} finally {
  if (descriptor !== undefined) fs.closeSync(descriptor)
}

fs.chmodSync(outputPath, 0o600)
console.log(JSON.stringify({
  created: accounts.length,
  network: document.network,
  output: path.relative(path.resolve(__dirname, "..", ".."), outputPath),
  privateKeysPrinted: false,
}))
