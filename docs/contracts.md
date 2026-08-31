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
4. At `scheduledClose`, anyone can call `closeDraw()`; the next epoch-aligned daily entry draw opens immediately.
5. Anyone can call `continueSelection(drawId, maxAccounts)` until that historical encrypted scan completes.
6. Participants call `previewPrize(drawId)` during the claim window.
7. Participants call `claimPrize(drawId)` to receive encrypted prize-or-zero.
8. After the claim window, anyone can call `sweepExpiredPrize(drawId)` to move the encrypted remainder into the current open draw.

## Permission Model

| Function | Access |
| --- | --- |
| `deposit()` | Any account with valid encrypted input and token approval |
| `withdraw()` | Any depositor |
| `closeDraw()` | Permissionless after draw deadline |
| `continueSelection(drawId, maxAccounts)` | Permissionless during that draw's selection |
| `expireDraw(drawId)` | Permissionless after that draw's claim deadline |
| `sweepExpiredPrize(drawId)` | Permissionless after that draw expires |
| `previewPrize(drawId)` | Any participant checking their own result for an explicit historical draw |
| `claimPrize(drawId)` | Any claimant settling prize-or-zero for an explicit historical draw |
| `fundPrize()` | Owner-only direct testnet seeding |
| `setRewardSource()` | Owner-only |
| `receivePrizeFromSource()` | Configured reward source only |

`MAX_POOL_PRINCIPAL` and `MAX_PRIZE_RESERVES` partition the ERC-7984 `euint64` custody width. Direct funding and reward-source funding clamp before token transfer; reward sources obtain the pool's encrypted remaining capacity in the same transaction.

## Deployment Manifests

Deployment scripts write manifests in two places:

- `contracts/deployments/`: source-of-truth deployment records.
- `frontend/src/generated/`: browser-consumed deployment records.

The frontend imports these manifests from `frontend/src/lib/contracts.ts`.

## Active Continuous-Draw Sepolia Markets

| Market | Pool | Capacity-aware reward vault |
| --- | --- | --- |
| cUSDT | `0x7f05Ed06B957906f16013de908E825bd836e28d3` | `0xfC6DbFA68f86144e20846401febd52A87d39e13E` |
| cUSDC | `0x66fCF1bB6C790176c770FaC028994fD375bF27ad` | `0x09e250E6105EB21053D32dbB705d836bAd8EC041` |

Both pools and vaults are source-verified. Their checked-in contract and frontend manifests are byte-for-byte identical.

## Superseded Sepolia Markets

| Market | Pool | Reward vault |
| --- | --- | --- |
| cUSDT | `0x4f475e9A84971629d69aC91f0CC4aE102E1f3B4C` | `0xA2DA21152293683A774B5F1c9D2F03A7B0116500` |
| cUSDC | `0x17f8C7703B0BCC665f97C870877f417AAfcc0E9E` | `0xBbCDf44f8192cf253451368C679eAe1eFA58B33D` |

These addresses use the previous ABI and remain historical evidence only.

## Operational Notes

- Keep `TOKEN_SYMBOL` explicit when deploying or verifying non-default markets.
- Use `REWARD_RESERVE=1` when seeding the Liquidity Hunt reward reserve.
- Do not present `fundPrize()` as yield. It is a direct testnet funding hook.
- The deployed source should be verified before public submission.
