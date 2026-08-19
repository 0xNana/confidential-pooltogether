require("dotenv").config({ path: "../.env.local" })
require("@fhevm/hardhat-plugin")
require("@nomicfoundation/hardhat-ethers")
require("@nomicfoundation/hardhat-verify")

const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY || process.env.DEPLOYER_PRIVAKE_KEY

/** @type {import('hardhat/config').HardhatUserConfig} */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      evmVersion: "cancun",
      optimizer: { enabled: true, runs: 200 },
    },
  },
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || process.env.RPC_URL || "http://127.0.0.1:8545",
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
      chainId: 11155111,
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },
}
