# P0 Production Readiness Plan

## Scope

Implement only the five P0 score-killer sections in `internal-docs/prod-ready-todo.md`. Keep all P1 work and every submission blocker untouched and last.

## Delivery Slices

1. **Draw lifecycle state and actions**
   - Add pure deadline/phase/scan-cursor derivation with unit coverage.
   - Add the three permissionless ABI calls and one model action.
   - Render live draw ID, phase, progress, remaining accounts, wallet gates, and transaction states.

2. **Sepolia read resilience**
   - Parse a dedicated primary RPC and configured fallback URLs.
   - Use quorum-one provider fallback plus bounded transient retries.
   - Map RPC and contract failures to short user messages and keep redacted diagnostics out of visible UI.
   - Preserve best-effort activity behavior when Supabase is absent or unavailable.

3. **Private-read browser proof**
   - Use the SDK's wagmi adapter so the Zama signer follows the active connector.
   - Replace stale smoke selectors with an explicit live-state readiness marker.
   - Fail immediately on read degradation and always print captured browser errors.
   - Sign EIP-712 data with a deterministic local smoke wallet instead of an invalid placeholder signature.

4. **Prize correctness coverage**
   - Prove winner transfer, non-winner zero settlement, repeat-claim zero settlement, principal conservation, prize conservation, withdrawal, and rollover in Hardhat.
   - Add a frontend workflow-state integration test spanning deposit through withdrawal.

5. **Live Sepolia preparation and evidence**
   - Add dry-run-first preparation and read-only evidence scripts for both markets.
   - Document required production RPC configuration and a hash-based live checklist.
   - Execute only currently possible live steps; record time-gated draw work as incomplete until the deployed deadline and real-wallet run occur.

## Verification Gates

- Frontend tests, lint, typecheck/build.
- Contract compile and tests.
- Browser smoke at desktop and mobile sizes with clean console/page errors.
- Read-only live verification for cUSDT and cUSDC.
- Review the final diff without changing unrelated user work.
