# Confidential PoolTogether

Confidential PoolTogether is a no-loss prize savings prototype built with Zama FHEVM. Users deposit confidential stablecoins, keep access to their principal, and enter weighted prize draws without publishing deposit amounts, balances, odds, winner identity, or prize amounts.

The current Sepolia deployment supports two markets:

- `cUSDT`
- `cUSDC`

This project was built for the Zama Developer Program Mainnet Season 4. It is V5-style in product behavior: draw progression is permissionless, multiple prize markets are supported, and the interface separates saving, shielding, sending, earning, and draw verification. It is not a direct fork of PoolTogether V5's TWAB controller, liquidator, tiered prize pool, or VRGDA claimer.

## Features

- React and Vite frontend for the live vault workspace.
- Sepolia wallet support with explicit network gating.
- Zama browser relayer integration for encrypted inputs, proofs, permits, and user decryption.
- ERC-7984 cUSDT and cUSDC support using Zama's official Sepolia mock wrappers.
- Encrypted deposits, withdrawals, balances, prize previews, and prize claims.
- Permissionless draw lifecycle methods for closing draws, continuing selection, and opening the next draw.
- Encrypted weighted winner selection with bounded scan batches.
- Confidential Liquidity Hunt vaults that track encrypted Earn TVL and fund prize pools from a separately funded reward reserve.
- Supabase event indexing for public lifecycle events, with a bounded RPC fallback when the index is unavailable.

## Product Flow

```mermaid
flowchart LR
  saver["Saver wallet"] --> market{"Choose market"}
  market --> cusdt["cUSDT vault"]
  market --> cusdc["cUSDC vault"]

  saver --> mint["Mint public test USDT or USDC"]
  mint --> shield["Shield into confidential token"]
  shield --> deposit["Deposit encrypted amount"]

  deposit --> pool["Confidential prize pool"]
  pool --> privateState["Encrypted balances, odds, winner, and prize"]
  pool --> publicState["Public draw phase, deadline, participant count, and cursor"]

  saver --> earn["Optional Liquidity Hunt Earn vault"]
  earn --> reserve["Encrypted reward reserve"]
  reserve --> pool

  keeper["Any account"] --> close["closeDraw"]
  close --> select["continueSelection"]
  select --> claimable["Claim window"]
  claimable --> preview["User previews prize-or-zero"]
  preview --> claim["Claim encrypted prize-or-zero"]
  claimable --> next["openNextDraw"]

  pool --> indexer["Public event indexer"]
  indexer --> ui["Frontend activity feed"]
  privateState --> decrypt["Wallet-authorized private reads"]
  decrypt --> ui
  publicState --> ui
```

## Repository Structure

```text
.
├── backend/    Supabase migrations and Sepolia event indexer
├── contracts/  Hardhat project, Solidity contracts, tests, and deployment scripts
├── docs/       Architecture and design notes
└── frontend/   Vite React application
```

## Requirements

- Node.js 20 or newer
- npm
- A Sepolia RPC endpoint
- A funded Sepolia deployer wallet for deployment and reward seeding
- Optional: Supabase project for indexed public activity

## Setup

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env.local
```

Set the variables needed for the workflows you use:

```bash
SEPOLIA_RPC_URL=
DEPLOYER_PRIVATE_KEY=
ETHERSCAN_API_KEY=
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Only `VITE_` variables are exposed to the browser. Keep deployer keys and Supabase service-role credentials server-side.

## Development

Run the frontend:

```bash
npm run dev
```

Build the frontend:

```bash
npm run build
```

Run frontend tests:

```bash
npm test
```

Run linting:

```bash
npm run lint
```

Run contract tests:

```bash
npm run contracts:test
```

Compile contracts:

```bash
npm run contracts:compile
```

Run the browser smoke test:

```bash
npm run browser:smoke
```

## Contract Deployment

Deploy the default cUSDT pool:

```bash
npm run contracts:deploy
```

Deploy the cUSDC pool:

```bash
npm run contracts:deploy:usdc
```

Deploy Liquidity Hunt reward vaults:

```bash
npm run contracts:deploy:vault
npm run contracts:deploy:vault:usdc
```

Verify deployments:

```bash
npm run contracts:verify-deployment
npm run contracts:verify-deployment:usdc
npm run contracts:verify:vault
npm run contracts:verify:vault:usdc
npm run contracts:verify-source
npm run contracts:verify-source:usdc
```

Seed reward reserves:

```bash
REWARD_RESERVE=1 npm run contracts:fund:vault
REWARD_RESERVE=1 npm run contracts:fund:vault:usdc
```

Deployment manifests are written to `contracts/deployments/` and copied into `frontend/src/generated/`. The frontend reads those generated manifests through `frontend/src/lib/contracts.ts`.

## Current Sepolia Deployments

| Market | Pool | Reward vault | Draw 1 close |
| --- | --- | --- | --- |
| cUSDT | `0x4f475e9A84971629d69aC91f0CC4aE102E1f3B4C` | `0xA2DA21152293683A774B5F1c9D2F03A7B0116500` | `2026-08-27 22:24:24 UTC` |
| cUSDC | `0x17f8C7703B0BCC665f97C870877f417AAfcc0E9E` | `0xBbCDf44f8192cf253451368C679eAe1eFA58B33D` | `2026-08-27 22:25:12 UTC` |

Verified source:

- cUSDT pool: https://sepolia.etherscan.io/address/0x4f475e9A84971629d69aC91f0CC4aE102E1f3B4C#code
- cUSDC pool: https://sepolia.etherscan.io/address/0x17f8C7703B0BCC665f97C870877f417AAfcc0E9E#code

Official Zama Sepolia wrappers:

| Token | Wrapper | Underlying |
| --- | --- | --- |
| cUSDT | `0x4E7B06D78965594eB5EF5414c357ca21E1554491` | `0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0` |
| cUSDC | `0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639` | `0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF` |

## Confidentiality Model

| Data | Visibility |
| --- | --- |
| Deposit and withdrawal amounts | Encrypted input bound to the target contract |
| User principal | Encrypted handle, decryptable by the user |
| Confidential token balance | Encrypted handle, decryptable by the user |
| Snapshot weight and odds | Encrypted, contract-only |
| Winner address | Encrypted, contract-only |
| Prize amount | Encrypted prize-or-zero result, decryptable by the caller |
| Aggregate pool size | Encrypted, contract-only |
| Draw phase, deadlines, participant count, and selection cursor | Public |

Participant addresses and transaction timing remain visible at the Ethereum account layer. This prototype does not claim account-level participation privacy.

## Draw Lifecycle

1. A user grants the pool a time-bounded ERC-7984 operator approval.
2. The user deposits encrypted cUSDT or cUSDC into the selected prize pool.
3. Anyone can call `closeDraw()` after the draw deadline.
4. Anyone can call `continueSelection()` to progress encrypted weighted winner selection in bounded batches.
5. During the claim window, participants call `previewPrize(drawId)` to create a decryptable prize-or-zero result.
6. Participants call `claimPrize(drawId)` to receive the encrypted prize-or-zero transfer.
7. Anyone can call `openNextDraw()` after the claim window closes.

## Supabase Event Index

The app can read public lifecycle events from Supabase. Browser clients only need the publishable key.

```bash
cd backend
npx supabase link --project-ref <project-ref>
npx supabase db push
cd ..
npm run events:index
```

The indexer stores finalized public events and checkpoints by chain and contract. If Supabase is not configured, the frontend falls back to bounded Sepolia RPC log reads.

## Security Notes

This code is unaudited and should not custody production funds.

The Liquidity Hunt reward vault is a testnet APY simulator. Rewards come from a separately funded encrypted reserve, not from realized external strategy yield. Before mainnet use, replace the reserve simulator with an audited yield adapter, add broader invariant and fuzz testing, decentralize keeper operations, and complete an external audit.

The current winner-selection implementation is intentionally bounded for testnet demonstration and supports at most 256 lifetime participant addresses.
