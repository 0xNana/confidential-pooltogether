# Live Prize Cycle Automation

The live-cycle runner covers both active v4 markets and is dry-run-first:

```bash
npm run contracts:live:cycle
LIVE_CYCLE_EXECUTE=1 npm run contracts:live:cycle
```

The dry run performs public chain reads and does not require a private key. Execution requires `DEPLOYER_PRIVATE_KEY` for the current onchain pool owner; the runner verifies ownership before submitting anything.

It uses only public Sepolia RPC endpoints. Override their order with a comma-separated public list when necessary:

```bash
PUBLIC_SEPOLIA_RPC_URLS=https://public-rpc-one.example,https://public-rpc-two.example npm run contracts:live:cycle
```

Optional controls are `LIVE_CYCLE_MARKETS`, `LIVE_CYCLE_POOL_PRINCIPAL`, and `LIVE_CYCLE_DIRECT_PRIZE`. Defaults are both markets, 1,000 tokens of principal per market, and a 29.5-token direct prize per market.

## Incomplete Task Coverage

| Production task | Automation |
| --- | --- |
| Deposit test principal into cUSDT and cUSDC | Encrypted 1,000-token deposits, skipped when the depositor event already exists. |
| Fund both prize pools | Encrypted 29.5-token direct testnet funding, skipped when `PrizeFunded` already exists. |
| Confirm funding and claim liquidity | Reads deployment-scoped events and records `PrizeFunded` links. A single funded entrant makes the scripted claim deterministically nonzero. |
| Close each draw | Submits `closeDraw` only after the onchain close timestamp. |
| Complete selection | Repeats bounded `continueSelection` calls until the draw becomes claimable. |
| Preview and claim | Submits `previewPrize` followed by `claimPrize` with the participant signer during the claim window. |
| Withdraw principal | Submits an encrypted withdrawal after the claim transaction. |
| Open the next draw | Submits `openNextDraw` after the claim deadline. |
| Record evidence | Writes current state, incomplete tasks, submitted hashes, event hashes, and Etherscan links to `contracts/deployments/live-cycle-cusdt.json` and `live-cycle-cusdc.json`. |

The runner is intentionally resumable instead of long-running. Run it once to seed, again after the draw deadline, and again after the claim deadline. It stops successfully with a timestamped wait reason when the next action is not eligible. It refuses to continue if multiple entrants would make the deployer's nonzero prize uncertain.

## Remaining Human Evidence

Automation cannot replace the judge-facing real-wallet proof. A person still needs to open the deployed UI, approve the EIP-712 private-read session, decrypt the prize preview and post-claim confidential balance, and visually confirm the full workflow. Those are HITL evidence steps, not missing protocol automation.

## Backend Requirement

The backend is **not required** for deposits, funding, lifecycle transactions, FHE encryption, claims, withdrawals, or evidence generation. The contracts and automation read Sepolia directly.

The backend is an optional Supabase event indexer for the frontend activity feed. It caches finalized public lifecycle events so the app loads activity faster and consumes fewer RPC log requests. When Supabase is absent or stale, the frontend uses its bounded public-RPC fallback.

The current indexer reads only the default cUSDT deployment. Do not make live-cycle execution depend on it. Generalize the indexer to both deployment manifests only if Supabase will be enabled for the public submission; otherwise the existing frontend fallback is the smaller and more reliable submission architecture.
