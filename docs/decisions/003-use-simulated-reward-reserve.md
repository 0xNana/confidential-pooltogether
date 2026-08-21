# ADR-003: Use a Simulated Reward Reserve for Liquidity Hunt

## Status

Accepted

## Date

2026-08-21

## Context

The product needs to demonstrate a prize source tied to private savings. A production no-loss prize account would route principal into an audited yield strategy and send realized yield into the prize pool. That is too large for the current Season 4 prototype and would require additional custody review.

## Decision

Use `ConfidentialLiquidityVault` as a testnet reward-source simulator. It tracks encrypted principal, accepts a separately funded encrypted reward reserve, computes the 90-day 12% APY target slice from encrypted TVL, and contributes that encrypted amount to the configured prize pool.

## Alternatives Considered

### Direct Owner Prize Funding Only

- Pros: Simple.
- Cons: Does not support the Earn/Liquidity Hunt story.
- Rejected as the primary demo path, though `fundPrize()` remains for direct testnet seeding.

### Real External Yield Adapter

- Pros: Closer to production.
- Cons: Requires strategy risk analysis, audits, and more integration work.
- Deferred until after the testnet prototype.

## Consequences

- Docs and UI must call the reward source simulated APY or target APY, not realized yield.
- Saver principal is separate from reward reserve funding.
- Production readiness requires replacing this simulator with an audited yield adapter.
