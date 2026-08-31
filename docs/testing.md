# Testing

## Test Commands

| Command | Purpose |
| --- | --- |
| `npm run lint` | ESLint across the workspace. |
| `npm run build` | TypeScript build and Vite production build. |
| `npm test` | Frontend unit tests. |
| `npm run contracts:test` | Hardhat FHEVM contract tests. |
| `npm run browser:smoke` | Live-Sepolia browser smoke for both generated markets, FHE runtime initialization, private-session authorization, accessibility, and responsive layouts. |

## Current Coverage

Frontend tests cover token amount parsing, action validation, and FHEVM helper behavior.

Contract tests cover:

- encrypted deposits,
- withdrawals,
- ACL persistence,
- weighted selection,
- zero-total draw behavior,
- encrypted expired-prize sweep,
- Liquidity Hunt reward reserve funding,
- prize pool funding from encrypted Earn TVL.

The replacement cUSDT and cUSDC manifests passed the live browser smoke on 2026-08-31. Draw-1 principal and prize funding evidence is recorded under `contracts/deployments/live-cycle-*.json`; the remaining lifecycle transactions are time-gated by the immutable daily cutoffs.

## Manual Sepolia Test Plan

Use two wallets when possible.

1. Connect wallet A on Sepolia.
2. Select cUSDT, use faucet, shield, and deposit.
3. Select cUSDC, use faucet, shield, and deposit.
4. Reveal private balances with a signed read permit.
5. Repeat deposit with wallet B.
6. Wait for the draw deadline.
7. Call `closeDraw()`.
8. Confirm the next aligned draw is already open, then call `continueSelection(drawId, maxAccounts)` on the historical draw until claimable.
9. Preview prize-or-zero from both wallets.
10. Claim prize-or-zero.
11. Withdraw principal.

## Pre-Submission Checks

- No `Switcher next` or placeholder disabled market actions remain.
- No fake balances, fake winners, or frontend-only prize values are shown.
- Source is verified for both prize pools.
- Reward vault manifests report active APY accounting and configured reward source.
- Public demo URL is documented before final submission.

## Recommended Additional Coverage

- Invariant tests for encrypted prize conservation.
- Fuzz tests around participant cap and repeated claims.
- Withdrawal tests immediately before, at, and after the fixed cutoff.
- Static analysis with Slither or equivalent.
- Live Sepolia e2e recording with real Zama relayer calls.
