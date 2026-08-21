const hre = require("hardhat")
const { selectedToken } = require("./token-config.cjs")

const token = selectedToken()
const deployment = require(`../deployments/${token.deploymentFile}`)
const liquidityVaultDeployment = require(`../deployments/${token.vaultDeploymentFile}`)

async function main() {
  await hre.run("verify:verify", {
    address: deployment.pool,
    constructorArguments: [deployment.deployer, deployment.asset],
  })
  await hre.run("verify:verify", {
    address: liquidityVaultDeployment.vault,
    constructorArguments: [liquidityVaultDeployment.deployer, liquidityVaultDeployment.asset],
  })
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
