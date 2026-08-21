const TOKENS = {
  cUSDT: {
    symbol: "cUSDT",
    confidentialSymbol: "cUSDTMock",
    asset: "0x4E7B06D78965594eB5EF5414c357ca21E1554491",
    underlying: "0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0",
    underlyingSymbol: "USDT",
    deploymentFile: "sepolia.json",
    vaultDeploymentFile: "liquidity-hunt-sepolia.json",
    frontendDeploymentFile: "deployment.json",
    frontendVaultFile: "liquidity-vault.json",
  },
  cUSDC: {
    symbol: "cUSDC",
    confidentialSymbol: "cUSDCMock",
    asset: "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639",
    underlying: "0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF",
    underlyingSymbol: "USDC",
    deploymentFile: "sepolia-usdc.json",
    vaultDeploymentFile: "liquidity-hunt-sepolia-usdc.json",
    frontendDeploymentFile: "deployment-usdc.json",
    frontendVaultFile: "liquidity-vault-usdc.json",
  },
}

function selectedToken() {
  const symbol = process.env.TOKEN_SYMBOL || process.env.TOKEN || "cUSDT"
  const token = TOKENS[symbol]
  if (!token) throw new Error(`Unsupported TOKEN_SYMBOL ${symbol}. Use one of: ${Object.keys(TOKENS).join(", ")}`)
  return token
}

module.exports = { TOKENS, selectedToken }
