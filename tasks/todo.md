# P0 Implementation Ledger

- [x] Lifecycle derivation tests are red, then green.
- [x] Lifecycle ABI, model action, and responsive controls are implemented.
- [x] RPC fallback/retry and public error sanitization tests are red, then green.
- [x] Both markets load when the optional indexer is unavailable.
- [x] Zama wagmi provider and EIP-712 smoke signer pass authorization.
- [x] Browser smoke rejects degraded reads and prints failures before exit.
- [x] Winner, non-winner, repeat claim, principal, prize, withdrawal, and rollover tests pass.
- [x] Frontend end-to-end state integration test passes.
- [x] Live demo preparation/evidence scripts are dry-run-first and verified.
- [x] Live transaction hashes and real-wallet decryption evidence are recorded where completed.
- [x] Final frontend build and browser smoke pass after the activity fallback fix (verified by the user).
- [x] Draw-scoped participant capacity is implemented, tested at 256 entries, and deployed for both markets.
- [x] Time-weighted encrypted APY accrual is tested, deployed, source-verified, and bound to both v4 markets.
- [x] Release CI, production-only audit gating, deployment verification, and dependency triage are wired.
- [x] Idempotent public-RPC automation covers two-market seeding, funding, draw progression, claim, withdrawal, rollover, and evidence capture.
- [ ] Rerun frontend tests/build/browser smoke against the new v4/time-weighted manifests and re-seed both active pools and vaults.
- [x] `internal-docs/prod-ready-todo.md` reflects evidence, with submission blockers still last.
