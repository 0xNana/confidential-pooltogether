# Production Dependency Audit

Audit date: 2026-08-26

Command:

```bash
npm audit --omit=dev --audit-level=high
```

## Result

The release gate exits successfully with zero high or critical production findings. Eight moderate findings remain in transitive `uuid` copies below `@metamask/sdk`, which is included by Wagmi's connector package.

## Remediation

- Moved the Vercel CLI from production dependencies to root development dependencies. This removed its deployment-only dependency tree from the production audit, including the prior critical `tar` finding.
- Overrode transitive `axios` to `1.20.0` and `ws` to `8.21.3`, eliminating the reachable high-severity findings without changing their major versions.
- Added a CI audit gate at high severity so new high or critical production advisories fail the release workflow.

## Accepted Residual Risk

Advisory `GHSA-w5hq-g745-h8pq` affects `uuid` versions below `11.1.1` when callers use v3, v5, or v6 UUID generation with a supplied output buffer. The application configures only Wagmi's injected connector and does not import `uuid`, MetaMask SDK, or Gemini connector APIs directly. Its active wallet flow does not call the affected UUID functions.

`npm audit fix --force` proposes Wagmi `3.7.6`, a breaking major migration. That migration is deferred because it changes the wallet integration boundary and requires dedicated compatibility work with `@zama-fhe/react-sdk`, plus a complete real-wallet and browser regression pass. Reassess this exception before mainnet use or when the Wagmi 3 migration is scheduled.
