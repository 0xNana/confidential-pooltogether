# Live Sepolia P0 Evidence

Checked on 2026-08-26. All amounts use six decimals. The preparation scripts are dry-run-first; writes require `LIVE_DEMO_EXECUTE=1`.

## Current v4 Deployments

These addresses are active in the generated frontend manifests. Both expose draw-scoped enrollment, start with zero participants, cap each draw at 256 entrants, and use the corrected time-weighted reward vaults.

### cUSDT v4

- Pool: `0x9fCd8e05C9f08FDaB15871178B67055bEc3Cf00F`
- Deployment: [0x5e5e...2587](https://sepolia.etherscan.io/tx/0x5e5e21d2ef9b7fd0456ec44ed682e8879a0ad08be1bf544e66550d271e362587), block `11570710`.
- Time-weighted reward vault: `0x5a89824138F7A4da7d07C460e073E36d38745487`.
- Vault deployment: [0x54c1...4bfa](https://sepolia.etherscan.io/tx/0x54c1b8f8c1d2c764554c9756cea62f4801db1560416f8bd53283a84eaf894bfa), block `11570842`.
- Reward source binding: [0x5416...5219](https://sepolia.etherscan.io/tx/0x5416d8984adb42e135208b01d6851b65b977558b394cfd6e8406fe574d725219).
- Reseeding status: the new pool and vault are empty; pool deposit and `PrizeFunded` are pending. A partial preparation run minted test USDT in [0xa65c...d8f](https://sepolia.etherscan.io/tx/0xa65caf5407bc31b1c8edfe6136acb94ab622b39071cec74b481de03538a4cd8f) but changed no pool state.

### cUSDC v4

- Pool: `0x0Df09628bAdA515D3b0A3AC8945120C14C725819`
- Deployment: [0xb348...4418](https://sepolia.etherscan.io/tx/0xb3489f00fff160fd0ac2aa1cfc4dfc13cd33b62bbc406de96d2fb6bde5394418), block `11570713`.
- Time-weighted reward vault: `0x4f7fB215FCB6926Cdae216F6E65Cc8ffF7faF185`.
- Vault deployment: [0xe046...539a](https://sepolia.etherscan.io/tx/0xe046452a1802225c51839af77e989ad852760973e097749d40515f324e53539a), block `11570845`.
- Reward source binding: [0x0632...a4be](https://sepolia.etherscan.io/tx/0x06322e8af36d2422246a79b39edf05322274748c485f71f287752e619297a4be).
- Reseeding status: the new pool and vault are empty; pool deposit and `PrizeFunded` are pending.

Resume each idempotent preparation run with a dedicated Sepolia RPC:

```bash
SEPOLIA_RPC_URL=<dedicated-rpc> LIVE_DEMO_EXECUTE=1 npm run contracts:live:prepare
SEPOLIA_RPC_URL=<dedicated-rpc> LIVE_DEMO_EXECUTE=1 npm run contracts:live:prepare:usdc
```

## Seeded v3 Evidence (Superseded Pools)

The following transactions remain historical proof of the P0 funding flow, but neither these pools nor their 295 bps reward vaults are active. The old vault formula was superseded because it could pay the 90-day slice once per cooldown period; do not cite these transactions as evidence of current APY accounting.

### cUSDT v3

- Pool: `0x4f475e9A84971629d69aC91f0CC4aE102E1f3B4C`
- Reward vault: `0xA2DA21152293683A774B5F1c9D2F03A7B0116500`
- Draw 1 closes: `2026-08-27T22:24:24Z`
- Pool principal: 1,000 cUSDT submitted; participant count is 1.
- Vault principal: 1,000 cUSDT submitted.
- Prize: 29.5 cUSDT target (`1,000 * 295 / 10,000`) funded from the existing encrypted reward reserve.
- Pool deposit: [0x37a8...ac5f](https://sepolia.etherscan.io/tx/0x37a8ab8073860dfa3f1010fd44f781dba727ccd21c6ecf22f60b6c7b40ffac5f)
- Vault deposit: [0xa0af...f631](https://sepolia.etherscan.io/tx/0xa0af90bd5393fed4531a07a47147fb5573c1b7f97920a334af8c98ecaf7cf631)
- Reward reserve: [0x11f9...3143](https://sepolia.etherscan.io/tx/0x11f959932e6c44b3081e65b02f53d29a363cb7af90133cb22d00180e54e53143)
- Vault-to-pool funding (`PrizePoolFunded` and `PrizeFunded`): [0x4f49...d8eb](https://sepolia.etherscan.io/tx/0x4f496fdb300e0ef0c96d9bc5da11f3781c76184c284e9d9662cb52ce22b2d8eb)

### cUSDC v3

- Pool: `0x17f8C7703B0BCC665f97C870877f417AAfcc0E9E`
- Reward vault: `0xBbCDf44f8192cf253451368C679eAe1eFA58B33D`
- Draw 1 closes: `2026-08-27T22:25:12Z`
- Pool principal: 1,000 cUSDC submitted; participant count is 1.
- Vault principal: 1,000 cUSDC submitted.
- Prize: 29.5 cUSDC target (`1,000 * 295 / 10,000`) funded from the existing encrypted reward reserve.
- Pool deposit: [0xc2e1...7dc8](https://sepolia.etherscan.io/tx/0xc2e12a7d983711ce1aa4a55546a80cba192102fd7b4b2fd5b2d6a43958737dc8)
- Vault deposit: [0x920d...9218](https://sepolia.etherscan.io/tx/0x920d8861ff0371b6f3a4cbf7a8b79acf03a6e56c37c6907ef7af7c0158369218)
- Reward reserve: [0xcd32...37c7](https://sepolia.etherscan.io/tx/0xcd32a945d7da336162eee509f2f9e8304183300af3f167fab6953f4ecfe037c7)
- Vault-to-pool funding (`PrizePoolFunded` and `PrizeFunded`): [0x7910...6a74](https://sepolia.etherscan.io/tx/0x7910b101ef58c3111412354eb37fbcdc116f6788e8c94ba6ee1f3fad43e06a74)

## Verification Commands

```bash
npm run contracts:verify-deployment
npm run contracts:verify-deployment:usdc
npm run contracts:verify:vault
npm run contracts:verify:vault:usdc
npm run contracts:live:prepare
npm run contracts:live:prepare:usdc
npm run contracts:live:evidence
npm run contracts:live:evidence:usdc
```

Add `LIVE_EVIDENCE_REQUIRE_READY=1` to the evidence scripts only after draw progression, claim, withdrawal, and the next draw have all occurred.

## Deadline-Gated Runbook

1. Seed a current v4 pool, then after its close timestamp connect the funded Sepolia wallet in the public UI and select the market.
2. Use **Close draw**, then **Continue selection**. With one participant, one selection batch completes the draw.
3. Authorize the EIP-712 private-read session, reveal balances, create the private prize preview, and decrypt it.
4. Claim the nonzero prize and record the transaction emitted as `PrizeClaimAttempted`.
5. Withdraw the 1,000-token principal and record `WithdrawalRecorded`.
6. After the seven-day claim window closes, use **Open next draw** and record `PrizeRolledOver` plus `DrawOpened`.
7. Rerun both evidence commands with `LIVE_EVIDENCE_REQUIRE_READY=1`.

The real-wallet authorization/decryption and all deadline-gated transaction hashes remain intentionally unrecorded until they have actually happened.
