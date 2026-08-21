# Project Documentation

This directory contains engineering documentation for Confidential PoolTogether.

## Start Here

- [Architecture](architecture.md): system components, data flow, and trust boundaries.
- [Contracts](contracts.md): Solidity contracts, lifecycle, deployment manifests, and operational controls.
- [Frontend](frontend.md): wallet flow, market selection, Zama SDK usage, and UI states.
- [Deployment Runbook](deployment-runbook.md): local setup, Sepolia deployment, verification, reward seeding, and frontend release checks.
- [Testing](testing.md): test suites, smoke tests, and recommended pre-submission checks.
- [Security and Privacy](security-and-privacy.md): threat model, privacy claims, limitations, and hardening path.
- [Submission Checklist](submission-checklist.md): remaining Season 4 submission assets and review checklist.

## ADRs

Architecture Decision Records live in [decisions/](decisions/):

- [ADR-001: Use Zama ERC-7984 Testnet Stablecoin Wrappers](decisions/001-use-zama-erc7984-wrappers.md)
- [ADR-002: Use Market Manifests for Multi-Token Deployments](decisions/002-use-market-manifests.md)
- [ADR-003: Use a Simulated Reward Reserve for Liquidity Hunt](decisions/003-use-simulated-reward-reserve.md)

## Documentation Rules

- Keep deployed addresses and transaction hashes in sync with `contracts/deployments/` and `frontend/src/generated/`.
- Do not document simulated APY as realized yield.
- Do not claim account-level anonymity. Amounts, balances, odds, winner identity, and prize amounts are encrypted; account addresses and transaction timing remain public.
- If a major technical decision changes, add a new ADR instead of rewriting historical rationale.
