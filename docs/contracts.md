# Contracts

The contracts live in `contracts/src/` and are tested with Hardhat FHEVM tests in `contracts/test/`.

## Contract Inventory

| Contract | Purpose |
| --- | --- |
| `ConfidentialPrizePool.sol` | Confidential no-loss prize pool with encrypted balances, weighted draw selection, and prize-or-zero claims. |
| `ConfidentialLiquidityVault.sol` | Testnet Liquidity Hunt reward-source vault with encrypted principal and encrypted reward reserve. |

## Prize Pool Lifecycle

1. User wraps public test USDT or USDC into Zama's confidential ERC-7984 wrapper.
2. User grants the prize pool ERC-7984 operator approval.
3. User calls `deposit()` with an encrypted amount and proof.
4. After `drawClosesAt`, anyone can call `closeDraw()`.
5. Anyone can call `continueSelection()` until the encrypted scan completes.
6. Participants call `previewPrize(drawId)` during the claim window.
7. Participants call `claimPrize(drawId)` to receive encrypted prize-or-zero.
8. After the claim window, anyone can call `openNextDraw()`.

## Permission Model

| Function | Access |
| --- | --- |
| `deposit()` | Any account with valid encrypted input and token approval |
| `withdraw()` | Any depositor |
| `closeDraw()` | Permissionless after draw deadline |
| `continueSelection()` | Permissionless during selection |
| `openNextDraw()` | Permissionless after claim window |
| `previewPrize()` | Any participant checking their own result |
| `claimPrize()` | Any claimant |
| `fundPrize()` | Owner-only direct testnet seeding |
| `setRewardSource()` | Owner-only |
| `receivePrizeFromSource()` | Configured reward source only |

## Deployment Manifests

Deployment scripts write manifests in two places:

- `contracts/deployments/`: source-of-truth deployment records.
- `frontend/src/generated/`: browser-consumed deployment records.

The frontend imports these manifests from `frontend/src/lib/contracts.ts`.

## Current Sepolia Markets

| Market | Pool | Reward vault |
| --- | --- | --- |
| cUSDT | `0x4f475e9A84971629d69aC91f0CC4aE102E1f3B4C` | `0xA2DA21152293683A774B5F1c9D2F03A7B0116500` |
| cUSDC | `0x17f8C7703B0BCC665f97C870877f417AAfcc0E9E` | `0xBbCDf44f8192cf253451368C679eAe1eFA58B33D` |

## Operational Notes

- Keep `TOKEN_SYMBOL` explicit when deploying or verifying non-default markets.
- Use `REWARD_RESERVE=1` when seeding the Liquidity Hunt reward reserve.
- Do not present `fundPrize()` as yield. It is a direct testnet funding hook.
- The deployed source should be verified before public submission.
