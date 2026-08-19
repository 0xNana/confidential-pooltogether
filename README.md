# Confidential PoolTogether

Confidential PoolTogether is a confidential no-loss prize vault built for Zama Developer Program Mainnet Season 4. Savers deposit ERC-7984 cUSDT, keep access to their principal, and enter a weighted prize draw without publishing individual deposit amounts, balances, odds, winner identity, or winnings.

The first screen is a dedicated product landing page; **Launch app** opens the live vault workspace. Public state is read from the Sepolia deployment, wallet actions use the Zama browser relayer, and every deposit, withdrawal, preview, and claim submits a real transaction. There are no seeded balances, simulated winners, or frontend-only prize values.

## What is implemented

- Production-oriented React interface inspired by Veilflow's editorial hierarchy and redaction language.
- Live Sepolia contract reads for draw phase, participant count, selection cursor, draw/claim deadlines, and claim status.
- Supabase-backed public event index with read-only RLS, Realtime updates, server-only ingestion credentials, and bounded RPC fallback.
- Zama's official Sepolia `cUSDTMock` wrapper and public-mint underlying from the protocol address registry; no application token is deployed.
- EIP-1193 wallet connection and explicit Sepolia network gating.
- Real ERC-7984 operator approval with a 30-day expiry.
- Browser-side `euint64` encryption and proof generation bound to the pool contract through `@zama-fhe/relayer-sdk`.
- Real deposit and withdrawal transactions with distinct initialization, encryption, signature, pending, confirmed, and recoverable error states.
- Explicit one-day EIP-712 decryption sessions; no automatic signature prompts.
- User-only KMS threshold decryption for principal, confidential cUSDT balance, and prize-or-zero results.
- Live verification drawer backed by contract state rather than a static success screen.
- Compilable FHEVM contract using OpenZeppelin ERC-7984 cUSDT transfers.
- Encrypted weighted selection in bounded batches to respect FHEVM HCU limits.
- FHEVM integration tests covering ACL persistence, withdrawal validation, private weighted selection, zero-total draws, bounded claims, and encrypted prize rollover.

## Confidentiality model

| State | Visibility |
|---|---|
| Individual deposit amount | Encrypted input, bound to the pool contract |
| Principal balance | `euint64`, decryptable by the saver |
| Snapshot weight / odds | `euint64`, contract-only |
| Winner | `eaddress`, contract-only |
| Prize | `euint64`, winner sees `prize-or-zero` |
| Aggregate pool / snapshot total | `euint64`, contract-only |
| Draw phase, deadlines, participant count, cursor | Public |

The aggregate pool size is never decrypted or emitted. Winner selection multiplies the encrypted snapshot total by an encrypted 64-bit random value, then compares it with encrypted cumulative weights scaled into `euint128`. `FHE.select` assigns the first matching account without a plaintext winner branch, revert, or event.

Every claimant follows the same public path. `claimPrize()` computes an encrypted `prize-or-zero` transfer, so a non-winner and a repeat claimant do not produce a distinguishing conditional revert. After the public claim deadline, the remaining encrypted reserve is moved to the next draw and the old draw is disabled without decrypting whether anything remained.

## Contract lifecycle

1. A saver grants the pool a time-bounded ERC-7984 operator approval.
2. `deposit()` converts proof-backed input in the pool, transiently grants the token access, and transfers cUSDT.
3. `closeDraw()` snapshots encrypted balance handles after the onchain deadline and derives an encrypted threshold without disclosing the total.
4. `continueSelection()` advances the weighted scan in batches of at most 12 accounts.
5. `previewPrize(drawId)` gives the caller a decryptable prize-or-zero handle during the claim window.
6. `claimPrize(drawId)` transfers prize-or-zero to the caller's confidential token balance.
7. `openNextDraw()` closes the old claim path and moves any encrypted remainder into the next draw.

## Run locally

```bash
npm install
npm run dev
```

This repository is organized as npm workspaces:

- `frontend/` contains the Vite React app.
- `contracts/` contains Hardhat config, Solidity sources, deployments, and contract tests.
- `backend/` contains Supabase migrations and the Sepolia event indexer.

Verification:

```bash
npm test
npm run lint
npm run build
npm run contracts:compile
npm run contracts:test
npm run events:index
npm run browser:smoke
npm audit --omit=dev
```

## Supabase event backend

The browser receives only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Keep `SUPABASE_SERVICE_ROLE_KEY` server-side for the idempotent event indexer.

```bash
cd backend
npx supabase link --project-ref <project-ref>
npx supabase db push
cd ..
npm run events:index
```

Run `events:index` on a short server-side schedule. It checkpoints finalized Sepolia blocks and upserts by chain, contract, transaction hash, and log index. If the backend is absent or degraded, the UI falls back to a bounded recent-log query rather than an unbounded `eth_getLogs` request.

## Sepolia deployment

Pool contract:

```text
0x717256cd7d56C61878D601D1e69429Fa3d88fc91
```

Deployment transaction:

```text
0xe3ca3955070bc029d75414c9021f902ced91b41da6b7ed2c7961d751502e1e3b
```

The source is verified on Etherscan:

https://sepolia.etherscan.io/address/0x717256cd7d56C61878D601D1e69429Fa3d88fc91#code

The pool is immutably bound to Zama's official Sepolia cUSDTMock wrapper:

```text
0x4E7B06D78965594eB5EF5414c357ca21E1554491
```

The interface includes the official testnet funding path: mint the registered underlying test USDT at `0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0`, approve the wrapper, and call `wrap()` to create confidential cUSDT. The local `ConfidentialTokenFixture` exists only for deterministic Hardhat tests and is never selected by the Sepolia deployment script.

To produce another deployment, configure `SEPOLIA_RPC_URL` and `DEPLOYER_PRIVATE_KEY`, then run:

```bash
npm run contracts:deploy
```

The deployment script exports `contracts/deployments/sepolia.json` and `frontend/src/generated/deployment.json`; the frontend consumes the generated manifest directly. Source verification reads the contract manifest, so no contract address is hardcoded in package scripts.

The deployer private key is used only by Hardhat scripts. It is never imported through a `VITE_` environment variable or shipped to the browser bundle.

## Frontend architecture

- `frontend/src/hooks/useConfidentialPoolTogether.ts` owns wallet lifecycle, live reads, transaction orchestration, indexed activity, and refresh behavior.
- `frontend/src/lib/fhevm-client.ts` lazily initializes the Zama WASM relayer, encrypts inputs, creates session permits, and performs user decryption.
- `frontend/src/lib/supabase-events.ts` reads the public event index and subscribes to inserts without exposing server credentials.
- `backend/index-events.mjs` is the server-side, idempotent Sepolia indexer. It stores only public lifecycle metadata and checkpoints finalized blocks.
- `backend/supabase/migrations/` defines explicit grants and RLS: anonymous clients can select public events, while only `service_role` can write events or indexer state.
- `frontend/src/lib/contracts.ts` is the deployment/ABI boundary consumed by the interface.
- Vite serves COOP/COEP headers so browser FHE encryption can use `SharedArrayBuffer` and the SDK worker pool.
- The app remains useful in disconnected read-only mode and renders explicit empty, loading, wrong-network, relayer, wallet-signature, transaction, and decryption states.

## Production hardening path

The current contract accepts yield through the owner-gated `fundPrize()` hook. Before mainnet custody, replace that hook with an audited confidential yield adapter for the selected strategy, decentralize keeper operations, add invariant and fuzz coverage, and complete the OpenZeppelin audit described by the bounty.

The testnet architecture supports at most 256 lifetime participant addresses so encrypted winner selection remains bounded. Zero-balance accounts remain in the scan because publicly pruning them would disclose private position state.

Participant addresses and transaction timing remain observable at the Ethereum account layer even though amounts and positions are encrypted. Hiding participation itself requires an additional relayer or account-abstraction privacy layer and is not claimed here.

This code is unaudited and should not custody production funds.
