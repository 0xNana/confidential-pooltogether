# Deployment Runbook

This runbook covers local validation, Sepolia deployment, source verification, reward seeding, and frontend release checks.

## Prerequisites

- Node.js 20 or newer
- npm dependencies installed with `npm install`
- `SEPOLIA_RPC_URL`
- `DEPLOYER_PRIVATE_KEY`
- `ETHERSCAN_API_KEY`
- Optional Supabase credentials for event indexing

## Local Validation

Run before deploying:

```bash
npm run lint
npm run build
npm test
npm run contracts:test
```

Compile contracts:

```bash
npm run contracts:compile
```

## Deploy Prize Pools

Deploy cUSDT:

```bash
npm run contracts:deploy
```

Deploy cUSDC:

```bash
npm run contracts:deploy:usdc
```

## Deploy Liquidity Hunt Vaults

Deploy cUSDT vault:

```bash
npm run contracts:deploy:vault
```

Deploy cUSDC vault:

```bash
npm run contracts:deploy:vault:usdc
```

## Verify Contracts

```bash
npm run contracts:verify-deployment
npm run contracts:verify-deployment:usdc
npm run contracts:verify:vault
npm run contracts:verify:vault:usdc
npm run contracts:verify-source
npm run contracts:verify-source:usdc
```

## Seed Reward Reserves

Seed cUSDT:

```bash
REWARD_RESERVE=1 npm run contracts:fund:vault
```

Seed cUSDC:

```bash
REWARD_RESERVE=1 npm run contracts:fund:vault:usdc
```

## Run Event Indexer

```bash
npm run events:index
```

The indexer should run server-side with `SUPABASE_SERVICE_ROLE_KEY`. Do not expose service-role credentials to the frontend.

## Frontend Release Check

Before deploying the frontend:

1. Confirm generated manifests in `frontend/src/generated/` match `contracts/deployments/`.
2. Confirm `cUSDT` and `cUSDC` market rows open the Deposit view.
3. Confirm the selected market changes faucet, shield, deposit, withdraw, send, Earn, proof, and Etherscan links.
4. Confirm `.env.local` and build output are ignored.
5. Run `npm run build`.

## Rollback

Contracts are immutable. If a deployment is wrong, deploy a replacement and update the manifests. For frontend releases, roll back through the hosting provider to the previous successful build.
