# ADR-002: Use Market Manifests for Multi-Token Deployments

## Status

Accepted

## Date

2026-08-21

## Context

The frontend needs to route every action through the selected market. Hardcoding one pool, wrapper, underlying, or reward vault address caused stale cUSDT behavior when cUSDC was added.

## Decision

Represent each market with generated deployment manifests and expose them through `MARKETS` in `frontend/src/lib/contracts.ts`.

Each market includes:

- token symbol,
- underlying symbol,
- prize pool address,
- confidential wrapper address,
- underlying address,
- deployment transaction,
- Liquidity Hunt vault address,
- vault deployer,
- APY accounting status,
- reward-source wiring status.

## Alternatives Considered

### Separate Frontend Builds Per Token

- Pros: Simple constants.
- Cons: Duplicates UI and increases deployment risk.
- Rejected because users should switch markets in one app.

### Fetch Deployment Metadata Remotely

- Pros: Can update addresses without a frontend build.
- Cons: Adds availability and integrity concerns for core contract routing.
- Rejected for now. Checked-in manifests are easier to review and verify.

## Consequences

- The active market must be included in transaction hooks, permit requests, proof links, and event subscriptions.
- New markets require a deployment manifest and frontend generated manifest.
- Backward-compatible default constants remain for legacy helpers and tests.
