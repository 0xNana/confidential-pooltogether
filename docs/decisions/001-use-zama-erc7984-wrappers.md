# ADR-001: Use Zama ERC-7984 Testnet Stablecoin Wrappers

## Status

Accepted

## Date

2026-08-21

## Context

The project needs confidential stablecoin balances on Sepolia. Deploying application-specific mock confidential tokens would make demos easier to control, but it would weaken the integration story and create avoidable review questions about whether the app uses Zama's standard token flow.

## Decision

Use Zama's official Sepolia ERC-7984 mock wrappers for `cUSDT` and `cUSDC`, with their registered public-mint underlying test tokens.

## Alternatives Considered

### Deploy Local Application Wrappers

- Pros: Full control over minting and test setup.
- Cons: Less representative of Zama's public testnet environment; more custom code to review.
- Rejected because official wrappers provide a clearer Season 4 integration path.

### Support Only cUSDT

- Pros: Simpler deployment and UI state.
- Cons: We need two token markets for the product direction.
- Rejected because multi-market support is now a project requirement.

## Consequences

- Deployment scripts must select token addresses by market.
- Frontend actions must be market-aware.
- Tests can still use local fixtures for deterministic FHEVM behavior.
- Public docs should identify official wrapper and underlying addresses.
