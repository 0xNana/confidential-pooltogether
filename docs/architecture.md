# Architecture

Confidential PoolTogether has three runtime surfaces:

- **Contracts:** FHEVM Solidity contracts on Sepolia.
- **Frontend:** Vite React app that connects wallets, creates encrypted inputs, requests Zama decryption permits, and submits transactions.
- **Backend indexer:** Optional Supabase-backed indexer for public pool events.

## System Diagram

```text
User wallet
  |
  | EIP-1193 connection, signatures, Sepolia transactions
  v
Frontend
  |
  | Zama SDK encryption, proofs, user decryption permits
  v
Zama relayer / KMS
  |
  | encrypted handles and input proofs
  v
FHEVM contracts on Sepolia
  |
  | public lifecycle events only
  v
Supabase event indexer
  |
  | read-only public event feed
  v
Frontend activity UI
```

## Components

### `ConfidentialPrizePool`

The prize pool accepts confidential token deposits, tracks encrypted principal, incrementally maintains per-draw encrypted weights, selects an encrypted winner, and lets each participant privately preview and claim prize-or-zero from historical draws.

Public metadata includes draw ID, status, epoch-aligned open/close times, claim times, participant count, scan cursor, and lifecycle events. `currentDrawId` refers only to the draw accepting entries.

Private state includes principal balances, draw weights, draw aggregate totals, full-width random threshold, cumulative scan state, winner identity, prize reserve, and prize-or-zero result.

### `ConfidentialLiquidityVault`

The Liquidity Hunt vault is a testnet reward source. It accepts confidential token deposits, tracks encrypted Earn TVL, accepts encrypted reward reserve funding, and contributes the 90-day APY target slice to the configured prize pool.

It does not deploy principal into an external yield strategy.

### Frontend

The frontend reads generated deployment manifests from `frontend/src/generated/` through `frontend/src/lib/contracts.ts`. It keeps a selected market (`cUSDT` or `cUSDC`) and routes deposits, withdrawals, shielding, unshielding, sending, proof links, and indexed activity through that market.

### Event Indexer

The backend indexes only public lifecycle events. It does not receive private keys from the browser, does not decrypt handles, and does not advance draws. If Supabase is unavailable, the frontend uses bounded RPC log reads.

## Trust Boundaries

| Boundary | What crosses it | Notes |
| --- | --- | --- |
| Wallet to frontend | Account, chain id, signatures, transactions | User approves all signatures and transactions. |
| Frontend to Zama SDK | Encryption requests and decryption permits | Decryption is user-authorized. |
| Frontend to contracts | Encrypted inputs, input proofs, transaction calls | Contracts validate encrypted inputs through FHEVM. |
| Contracts to indexer | Public events | No private encrypted values are decrypted for indexing. |
| Indexer to frontend | Public event rows | Index is an optimization, not a source of private truth. |

## Key Constraints

- Sepolia only.
- 6-decimal token amounts.
- At most 256 lifetime participant addresses in the current prize pool implementation.
- Draw work is split across bounded selection batches.
- Reward-source funding is owner-operated for the demo.
- Draw progression is permissionless.
