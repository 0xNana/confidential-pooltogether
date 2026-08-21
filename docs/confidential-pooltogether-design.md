# Confidential PoolTogether Design

## Purpose

Confidential PoolTogether adapts the PoolTogether prize savings model to an FHEVM setting. Depositors keep principal withdrawable, prizes are funded from yield or a yield simulator, and the draw uses confidential weighted selection so public observers do not learn deposit amounts, odds, winner identity, or prize amount. The current Sepolia deployment supports two stablecoin markets: cUSDT and cUSDC.

The design uses FHE randomness for the draw. A random encrypted value is combined with the encrypted snapshot total to create a private winning threshold, then the contract scans encrypted user weights until the cumulative encrypted weight crosses that threshold.

## Goals

- Preserve the no-loss savings property: users can withdraw principal without risking deposited funds.
- Keep individual balances, draw weights, aggregate snapshot totals, winner identity, and prize-or-zero outcomes encrypted.
- Use FHE randomness directly in winner selection instead of revealing a plaintext winning ticket.
- Keep the public lifecycle auditable and permissionless: draw phase, deadlines, participant count, scan cursor, and claim attempts remain visible, while any account can close elapsed draws, advance selection, and open the next draw after claims expire.
- Bound draw work so selection fits FHEVM execution limits.

## Non-Goals

- Hiding Ethereum account participation, transaction timing, gas usage, or interaction frequency.
- Supporting unbounded participants in one draw.
- Claiming mainnet custody readiness before a real yield adapter, claim incentives, and external audit exist.
- Reproducing PoolTogether V5's full tiered prize structure in the first confidential version.

## Current Contract Shape

The current implementation centers on `ConfidentialPrizePool`:

- Deposits use ERC-7984 confidential transfers.
- Principal and total principal are stored as `euint64` handles.
- Draw snapshots copy encrypted principal handles into per-draw encrypted weights.
- Selection uses a bounded encrypted weighted scan.
- Claims transfer encrypted `prize-or-zero`, so non-winners and repeat claimers follow the same public path.
- Prize rollover keeps unclaimed encrypted reserve inside the pool.

The app also includes separate Liquidity Hunt Earn vaults for cUSDT and cUSDC. Each vault is the testnet reward source for the 12% APY narrative in its own market. It keeps principal encrypted, accepts a separately funded encrypted reward reserve, computes the 90-day APY slice from encrypted Earn TVL, and contributes that encrypted amount into its prize pool. It is still not an audited external yield adapter.

## Confidential State Model

| Data | Representation | Visibility |
|---|---|---|
| Deposit amount | `externalEuint64` input, converted in contract | User and contract |
| Principal balance | `euint64` | User and contract |
| Snapshot weight | `euint64` | Contract |
| Snapshot total | `euint64` | Contract |
| Winning threshold | `euint128` | Contract |
| Winner | `eaddress` | Contract |
| Prize reserve | `euint64` | Contract |
| Prize preview | `euint64` | User and contract |
| Draw phase/deadlines/cursor | Plain public values | Everyone |

Participant addresses remain public because they submit transactions and are stored in the participant list. The privacy claim is about values and outcomes, not participation anonymity.

## Draw Lifecycle

1. **Open**
   - Users deposit confidential cUSDT through proof-backed encrypted inputs.
   - Users may withdraw at any phase.
   - Yield or testnet prize funding is added to the encrypted draw reserve.

2. **Close**
   - After `drawClosesAt`, the operator closes the draw.
   - The contract snapshots each participant's encrypted principal into that draw's encrypted weight map.
   - The contract freezes the encrypted aggregate total for the draw.

3. **Generate Private Threshold**
   - The draw calls FHE randomness:

     ```solidity
     _winningThreshold = FHE.mul(FHE.asEuint128(_snapshotTotalEncrypted), FHE.randEuint64());
     ```

   - Conceptually, this maps a private random 64-bit value into the encrypted range `[0, snapshotTotal)`.
   - The threshold is never decrypted or emitted.

4. **Select**
   - `continueSelection(maxAccounts)` scans participants in batches.
   - The contract adds each encrypted weight into an encrypted cumulative total.
   - The cumulative total is scaled to match the threshold range.
   - The first account whose encrypted cumulative weight crosses the encrypted threshold becomes the encrypted winner.
   - `FHE.select` updates the encrypted winner without a plaintext branch that reveals which account matched.

5. **Claim**
   - `previewPrize(drawId)` creates a user-decryptable encrypted prize-or-zero.
   - `claimPrize(drawId)` transfers encrypted prize-or-zero.
   - Public observers see a claim attempt, but not whether it paid a nonzero prize.

6. **Rollover**
   - After the claim window closes, remaining encrypted prize reserve rolls into the next draw.
   - The previous draw claim path is disabled.

## Winner Selection Algorithm

The confidential draw should be understood as weighted random sampling over encrypted balances:

```text
snapshotTotal = encrypted sum of all eligible weights
random64 = encrypted FHE random value
threshold = snapshotTotal * random64

cumulative = 0
for participant in participants:
  cumulative += encrypted participant weight
  if cumulative crosses threshold and winner is unset:
    winner = participant
```

The implementation avoids decrypting:

- the total weight,
- each participant weight,
- the random threshold,
- the crossing comparison,
- and the selected winner.

The public scan cursor only reveals progress through a fixed participant array. It does not reveal which participant crossed the threshold.

## Randomness Design

The confidential design intentionally uses FHE randomness alongside the draw:

- The randomness is generated inside the FHE execution environment with `FHE.randEuint64()`.
- The random value remains encrypted.
- The random value is not published as a draw seed.
- The result is combined with the encrypted snapshot total, so the winning ticket is also encrypted.

This differs from classic PoolTogether V5, where a public random number is pushed to the Prize Pool and users can independently check winner eligibility. In the confidential design, public auditability shifts from "anyone can recompute the winner" to "the contract follows a deterministic encrypted selection circuit using FHE handles and public lifecycle events."

## Simulated APY Source

For the current testnet design, the Earn vault is a simulated APY source rather than a real external yield strategy:

- The Earn UI presents the Liquidity Hunt program with a 90-day maturity and a 12% target APY.
- Deposits go to `ConfidentialLiquidityVault`, which tracks encrypted principal and maturity.
- `ConfidentialLiquidityVault` exposes `TARGET_APY_BPS = 1200` and `PROGRAM_REWARD_BPS = 295`.
- `PROGRAM_REWARD_BPS` is the rounded-down 90-day slice of the annual 12% APY target.
- Rewards come from `fundRewards()`, a separately funded encrypted reserve, so saver principal is not used as prize liquidity.
- `fundPrizePool(prizePool)` computes `totalPrincipal * PROGRAM_REWARD_BPS / 10_000` under FHE, caps it to the encrypted reward reserve, transfers the encrypted payout to the prize pool, and calls `receivePrizeFromSource()`.
- `fundPrizePool(prizePool)` is owner-operated and has a one-day cooldown after each contribution, which keeps the Sepolia demo practical without representing the reserve as continuously realized external yield.
- The prize pool only accepts source-funded rewards from the configured `rewardSource`.

This gives us a clean demo story without overstating custody behavior:

```text
User deposits confidential cUSDT into Earn
Earn tracks encrypted principal and encrypted TVL
Operator/test harness funds Earn's encrypted reward reserve
Earn computes the 90-day 12% APY slice under FHE
Earn transfers encrypted reward liquidity to the prize pool
Prize pool runs confidential weighted draw over encrypted positions
Winner claims encrypted prize-or-zero
```

In docs and UI copy, call this **simulated APY**, **reward reserve**, or **Liquidity Hunt target APY**. Do not call it realized yield or audited strategy yield until the contract routes deposits through a real yield adapter.

The eventual production wiring should replace this simulation with an adapter that:

- routes compatible liquidity into an audited yield strategy without putting principal at undocumented risk,
- contributes realized yield into the encrypted reward reserve or directly into the encrypted prize reserve,
- keeps principal withdrawable,
- and exposes only public lifecycle metadata.

## Fairness Properties

A participant's probability of winning is proportional to their encrypted snapshot weight divided by the encrypted snapshot total, assuming:

- FHE randomness is unbiased.
- The snapshot correctly freezes all eligible weights.
- The participant list is complete.
- The bounded scan completes before claims begin.
- Zero-balance participants remain in the list but contribute encrypted zero weight.

Withdrawals after snapshot do not affect the already closed draw's weight. Deposits after close apply to future draws only.

## Operational Model

The current implementation keeps reward configuration and reserve funding owner-operated:

- `fundPrize()` for direct testnet prize seeding only
- `setRewardSource()`
- `receivePrizeFromSource()`
- `ConfidentialLiquidityVault.fundRewards()`
- `ConfidentialLiquidityVault.fundPrizePool()`

Draw progression is permissionless:

- `closeDraw()`
- `continueSelection()`
- `openNextDraw()`

For the simulated APY demo, `ConfidentialLiquidityVault.fundRewards()` and `ConfidentialLiquidityVault.fundPrizePool()` are the bridge between the Earn narrative and the prize reserve. `fundPrize()` remains as an owner-only direct testnet seeding hook, but the submitted demo should use the authorized Earn reward source.

For a production version, this should move toward incentivized execution:

- Draw closers should receive bounded incentives for timely execution.
- Selection advancement should be keeper-friendly across participant caps.
- Claiming should move toward a confidential equivalent of PoolTogether V5 claim incentives.
- Incentives should avoid leaking outcome information.

## Security and Privacy Considerations

- **Insufficient withdrawal privacy:** Withdrawal success currently transfers encrypted zero on insufficient balance rather than reverting, which avoids a public failure branch.
- **Claim privacy:** Non-winners and repeat claimers should not revert based on winner status. They should emit the same public claim path and transfer encrypted zero.
- **Participant cap:** The cap keeps FHE computation bounded. Raising it requires new gas/HCU analysis.
- **Owner trust:** Owner-gated lifecycle and funding are acceptable for testnet but not for production custody.
- **RNG trust:** Fairness depends on the security properties of FHEVM randomness. This should be documented with the exact deployed FHEVM version before mainnet use.
- **Public metadata:** Addresses, timestamps, transaction ordering, and gas patterns can still leak behavioral information.
- **Simulated APY:** The Earn vault can support the demo as a 12% target APY simulator using an encrypted reward reserve, but it does not deploy principal into an external yield strategy.
- **Yield adapter:** A real no-loss deployment needs an audited adapter that can route realized yield into encrypted prize reserves without exposing private balances.

## Open Design Questions

- Should selection use one prize per draw initially, or support multiple encrypted winners per draw?
- Should prize funding stay single-reserve, or move toward PoolTogether-style prize tiers?
- Can draw lifecycle calls be made permissionless without adding griefing vectors?
- What is the maximum participant count that remains practical under current FHEVM HCU limits?
- Should the contract commit to an external public draw id or block boundary in addition to FHE randomness?
- How should users independently verify that a deployed contract uses the expected FHE randomness circuit?

## Implementation Path

1. Keep the current single-prize confidential draw as the baseline.
2. Add tests that assert the draw lifecycle never emits plaintext totals, winners, or prize amounts.
3. Add invariant tests for encrypted prize conservation across fund, claim, and rollover.
4. Replace owner-only draw progression with permissionless progression where safe.
5. Use Earn/Liquidity Hunt as the explicitly labeled testnet APY simulator and reward source in docs and demos.
6. Replace the funded reward reserve with a documented confidential yield adapter when moving beyond simulation.
7. Document the exact FHEVM randomness assumptions before any mainnet deployment.
