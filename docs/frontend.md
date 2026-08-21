# Frontend

The frontend lives in `frontend/` and uses Vite, React, Ethers, Wagmi, and the Zama React SDK.

## Main Files

| File | Purpose |
| --- | --- |
| `frontend/src/routes/VaultApp.tsx` | Main vault workspace shell and navigation. |
| `frontend/src/hooks/useConfidentialPoolTogether.ts` | Wallet lifecycle, selected market, reads, decryption, and transactions. |
| `frontend/src/lib/contracts.ts` | ABI and generated deployment-manifest boundary. |
| `frontend/src/lib/supabase-events.ts` | Public event-index reads and realtime subscription. |
| `frontend/src/components/OverviewDashboard.tsx` | Market list and hero overview. |
| `frontend/src/components/VaultAction.tsx` | Deposit and withdraw flows. |
| `frontend/src/components/TokenAction.tsx` | Shield and unshield flows. |
| `frontend/src/components/EarnView.tsx` | Liquidity Hunt reward vault deposit flow. |

## Market Selection

The app supports `cUSDT` and `cUSDC` through a single active market state. Selecting a market changes:

- prize pool address,
- confidential wrapper address,
- underlying token address,
- Liquidity Hunt vault address,
- Etherscan links,
- token labels,
- balances,
- permit contract list,
- Supabase indexed activity channel.

The default market is `cUSDT`.

## Wallet Flow

1. Connect wallet.
2. Switch to Sepolia when needed.
3. Use the header faucet to mint public test stablecoin and wrap it into confidential `cUSDT` or `cUSDC`.
4. Authorize private reads when the user wants to decrypt balances or prize status.
5. Deposit into the prize pool or Liquidity Hunt vault.

## Private Read Flow

The app asks for an EIP-712 permit before decrypting user-visible handles. The permit covers the selected pool, token wrapper, and Liquidity Hunt vault for the active market.

No transaction is submitted for read authorization.

## Browser Requirements

The Zama SDK needs cross-origin isolation for `SharedArrayBuffer`. Vite config serves the required COOP/COEP headers in development.

## UI Rules

- Do not show fake seeded balances or fake winners.
- Keep selected token labels dynamic.
- Use explicit empty, loading, wrong-network, signature, pending, confirmed, and error states.
- Make privacy limits visible: values are encrypted, but wallet addresses and transaction timing remain public.
