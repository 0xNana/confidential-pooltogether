# Production-Ready TODO

Complete the score-killer work before the submission packaging tasks at the end of this file.

## Score Killers

### P0: Expose the complete draw lifecycle in the frontend

- [x] Add `closeDraw`, `continueSelection`, and `openNextDraw` to the frontend ABI and application model.
- [x] Show the action appropriate to the current draw phase, deadline, and scan cursor.
- [x] Allow any connected Sepolia wallet to advance the permissionless lifecycle.
- [x] Surface transaction progress, actionable failures, and the remaining selection work.
- [ ] Verify deposit -> close -> selection -> preview -> claim -> next draw through the deployed UI.

Definition of done: a judge can complete every permissionless draw action from the public app without using Etherscan or a local script.

### P0: Prepare a nonzero live prize cycle

Automation: run `npm run contracts:live:cycle` to inspect the remaining work, then set `LIVE_CYCLE_EXECUTE=1` to execute eligible actions. See `internal-docs/live-cycle-automation.md`.

- [ ] Deposit test principal into both current v4 prize markets.
- [ ] Fund each current v4 prize pool from its configured reward vault or execute the direct testnet funding path.
- [ ] Confirm each current v4 pool emits `PrizeFunded` and has enough prize liquidity for a visible claim.
- [ ] Advance at least one deployed market through a complete draw and successful nonzero claim.
- [ ] Record transaction links for deposit, funding, draw progression, claim, and principal withdrawal.

Definition of done: the public deployment has reproducible onchain evidence of a nonzero prize cycle, not only deployed contracts and seeded reward reserves.

### P0: Prove the EIP-712 private-read path with a real wallet

- [ ] Complete permit authorization, balance decryption, prize preview, and prize decryption using a real Sepolia wallet.
- [x] Fix the browser smoke timeout at `Private session authorized`.
- [x] Replace the stale `.draw-console-id` synchronization selector with an element that exists and represents successful live-state loading.
- [x] Make the smoke test fail on `.read-error` instead of treating it as a valid synchronized state.
- [x] Print captured console and page errors before aborting on a timeout.

Definition of done: the automated browser check passes for the intended state, and a separate real-wallet run proves the SDK/KMS flow end to end.

### P0: Stabilize Sepolia reads and user-facing errors

- [ ] Configure the deployment with a dedicated, rate-limited Sepolia RPC endpoint.
- [x] Add RPC fallback or retry behavior for transient `429` and provider failures.
- [x] Replace raw provider payloads with short, actionable error messages while retaining diagnostic detail outside the visible UI.
- [x] Verify pool state, activity, and both markets during temporary indexer failure.

Definition of done: normal judge usage does not display provider internals, and a transient RPC failure recovers without breaking the vault workflow.

### P0: Cover the core prize behavior with tests

- [x] Add a successful winner claim test that proves the confidential asset reaches the winner.
- [x] Add non-winner and repeat-claim tests proving both paths settle safely without leaking through conditional reverts.
- [x] Add conservation tests for principal, prize funding, claims, and rollover.
- [x] Add a frontend integration test for deposit, draw progression, private preview, claim, and withdrawal states.
- [x] Add a live Sepolia smoke checklist that records addresses and transaction hashes.

Definition of done: the test suite directly proves every operation named in the bounty's correctness criterion.

### P1: Remove the lifetime participant-cap denial of service

- [x] Replace the lifetime participant list with draw-scoped active participation or another bounded structure that can reclaim slots.
- [x] Prevent encrypted zero-value deposits from permanently consuming participant capacity without revealing private amounts.
- [x] Add tests for zero deposits, withdrawn participants, repeated draws, and capacity exhaustion.
- [x] Redeploy both markets and update generated manifests if the contract changes.

Definition of done: an attacker cannot permanently block new savers by filling 256 lifetime slots.

### P1: Correct the simulated APY accounting

- [x] Make reward accrual proportional to elapsed time or enforce one 90-day funding interval per reward slice.
- [x] Prevent the current 2.95% 90-day slice from being distributed once per day.
- [x] Add tests covering repeated funding calls, elapsed periods, reserve exhaustion, and principal changes.
- [x] Ensure the UI and README describe the mechanism as simulated reserve funding rather than realized yield.

Definition of done: repeated permitted calls cannot exceed the documented annualized reward target.

### P1: Establish release quality gates

- [x] Add CI for lint, production build, frontend tests, contract tests, and browser smoke.
- [x] Move deployment-only tooling such as the Vercel CLI out of production dependencies.
- [x] Triage `npm audit --omit=dev`, update reachable vulnerable dependencies, and document any accepted residual findings.
- [x] Run deployment verification for both pools and both reward vaults in the release checklist.

Definition of done: a clean checkout has an automated, reproducible pass/fail signal for the submission commit.

## Submission Blockers - Complete Last

- [ ] Deploy the frontend to a stable public URL and add it to the README and submission form.
- [ ] Make the GitHub repository publicly accessible.
- [ ] Add an explicit open-source license.
- [ ] Publish the required X post, thread, or article with `@zama` and `#ZamaDeveloperProgram`.
- [ ] Record and publish the final real-person video at normal speed, no longer than three minutes, on X, YouTube, or Loom.
- [ ] Recheck every submitted link in an unauthenticated browser before the one-time form submission.
