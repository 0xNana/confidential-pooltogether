# Security and Privacy

This document defines what Confidential PoolTogether does and does not protect.

## Privacy Claims

The app is designed to keep the following encrypted:

- deposit and withdrawal amounts,
- principal balances,
- confidential token balances,
- draw weights and odds,
- aggregate pool size,
- winner identity,
- prize amount,
- prize-or-zero result.

Public observers can still see:

- wallet addresses interacting with contracts,
- transaction timing,
- gas usage,
- draw phase,
- deadlines,
- participant count,
- selection cursor,
- claim attempts.

## Threat Model

| Actor | Capability | Mitigation |
| --- | --- | --- |
| Public chain observer | Reads transactions, events, public storage, and gas patterns | Sensitive values are FHE-encrypted; public events avoid amounts and winners. |
| Non-winning claimant | Attempts to learn winner status from reverts or public branches | Claims transfer encrypted prize-or-zero rather than reverting on non-winner status. |
| Frontend operator | Serves UI and metadata | Contracts remain source-verifiable; users should verify addresses and signatures. |
| Reward source operator | Funds and triggers simulated APY reserve | Reward funding is separate from principal; docs label it as simulated APY. |
| Deployer owner | Controls reward source setup and direct testnet seeding | Acceptable for demo; production needs decentralization and audits. |
| Event indexer | Stores public event data | Indexer receives no decryptable private state. |

## Important Limitations

- The project is unaudited.
- Sepolia deployments are testnet-only.
- The reward vault simulates APY from a funded reserve; it is not realized external strategy yield.
- Participant addresses and timing are public.
- The current participant cap is 256 lifetime addresses.
- Contract upgrades are not supported; fixes require redeployment and manifest updates.

## Operational Controls

Draw progression is permissionless:

- `closeDraw()`
- `continueSelection()`
- `openNextDraw()`

Reward configuration remains controlled:

- `setRewardSource()` is owner-only.
- `fundPrize()` is owner-only and should be used only for direct testnet seeding.
- `ConfidentialLiquidityVault.fundRewards()` and `fundPrizePool()` are owner-operated in the demo.

## Hardening Path

Before production custody:

1. Replace reward reserve simulation with an audited yield adapter.
2. Add invariant and fuzz tests for conservation, participant limits, claims, and phase transitions.
3. Run static analysis.
4. Complete external audit.
5. Add keeper incentives for lifecycle calls.
6. Document exact FHEVM randomness assumptions for the deployed network version.
7. Add monitoring for draw deadlines, stalled selection, reward funding, and indexer lag.
