# Submission Checklist

This checklist tracks the remaining work for a public Zama Season 4 submission.

## Required Assets

- Working smart contracts.
- Working frontend.
- Public deployed demo URL.
- Three-minute real-person video pitch.
- X thread or article.

Official brief: https://forms.zama.org/developer-program-mainnet-season4-bounty-track

## Current Status

| Item | Status | Notes |
| --- | --- | --- |
| Smart contracts | Done | cUSDT and cUSDC Sepolia prize pools deployed and verified. |
| Frontend | Done | Multi-market vault workspace is wired for cUSDT and cUSDC. |
| Reward vaults | Done for demo | Liquidity Hunt reward reserves are deployed and seeded as simulated APY sources. |
| Permissionless draw lifecycle | Done | `closeDraw()`, `continueSelection()`, and `openNextDraw()` are permissionless. |
| Public demo URL | Missing | Add final hosted URL to `README.md` before submission. |
| Video pitch | Missing | Record a human walkthrough. |
| X thread or article | Missing | Publish and link it. |
| Live Sepolia e2e proof | Recommended | Record a real wallet flow using both markets. |

## Video Outline

Target length: three minutes.

1. State the problem: prize savings leaks balances, odds, and winners.
2. Show cUSDT and cUSDC markets.
3. Connect wallet and switch to Sepolia.
4. Mint/wrap test stablecoin into confidential token.
5. Deposit into a prize vault.
6. Reveal private balance with a signed read permit.
7. Explain permissionless draw progression.
8. Show prize-or-zero preview and claim path.
9. Explain what remains public and what stays encrypted.
10. Close with deployment links and limitations.

## Article or X Thread Outline

- What Confidential PoolTogether is.
- Why FHE is needed.
- How encrypted weighted selection works.
- What the Liquidity Hunt reward source does.
- cUSDT and cUSDC deployment addresses.
- Public demo link.
- Privacy limitations.
- Source and verification links.

## Final Review

- README has the public demo URL.
- Etherscan links work.
- `.env.local` is not committed.
- `npm run lint` passes.
- `npm run build` passes.
- `npm test` passes.
- `npm run contracts:test` passes.
- UI does not contain placeholder actions such as `Switcher next`.
- UI does not overstate simulated APY as realized yield.
