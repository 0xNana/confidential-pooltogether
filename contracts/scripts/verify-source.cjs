const hre = require("hardhat")
const deployment = require("../deployments/sepolia.json")

async function main() {
  await hre.run("verify:verify", {
    address: deployment.pool,
    constructorArguments: [deployment.deployer, deployment.asset],
  })
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
