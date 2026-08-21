eason 4 Requirements

  The official requirements are:

  - Working smart contract and frontend.
  - Public deployed demo.
  - 3-minute real-person video pitch.
  - X thread or article.
    Official Season 4 bounty brief (https://forms.zama.org/developer-program-mainnet-season4-bounty-track)

  What’s Still Missing

  P0: Submission blockers

  1. 3-minute human demo video
      - Show wallet connection.
      - Mint/wrap cUSDT.
      - Deposit.
      - Private balance decryption.
      - Draw lifecycle.
      - Prize-or-zero preview.
      - Claim and withdrawal.
      - Explain what remains public versus encrypted.

  2. X launch thread/article
      - Problem and product.
      - Why FHE is necessary.
      - Contract address and verified source.
      - Live demo link.
      - Short architecture diagram.
      - Privacy guarantees and limitations.

  3. Public demo URL
      - The repository does not document a production frontend URL.
      - Add the deployed URL and exact environment setup to README.md.

  4. Real Sepolia end-to-end proof
      - Current browser smoke tests use mocked wallets.
      - We need a recorded or scripted live flow using the deployed contract and real Zama relayer.
      - Demonstrate at least two participant wallets and one complete draw.

  P1: Biggest judging weaknesses

  5. Simulated APY needs live redeployment proof
      - The contract path now uses a Liquidity Hunt reward-source vault with encrypted Earn TVL, a separately funded encrypted reward reserve, owner-operated `fundPrizePool()`, and pool-side `rewardSource` authorization.
      - `fundPrize()` remains a direct testnet seeding hook and must not be presented as realized yield.
      - The existing checked-in Sepolia Liquidity Hunt deployment still has `apyAccounting: false` and `rewardSourceConfigured: false`; run `npm run contracts:deploy:vault` and `npm run contracts:verify:vault` before claiming the live address supports reward-source accounting.
      - The reward source must be described as a 12% APY target/simulation, not realized external strategy yield.
      - A real audited yield adapter is still required before mainnet custody.

  6. No keeper automation
      - closeDraw, continueSelection, and openNextDraw are owner-only.
      - The backend only indexes events; it does not advance draws.
      - Add a scheduled keeper service or documented operator workflow so the draw lifecycle actually progresses without manual intervention.

  7. Production hardening evidence
      - Add fuzz/invariant tests for:
          - repeated claims,
          - rollover,
          - zero-balance participants,
          - participant cap,
          - withdrawals during each phase,
          - owner/key compromise assumptions,
          - encrypted prize conservation.

      - Run static analysis such as Slither.
      - Include a concise threat model.

  8. README is now inaccurate
      - It still references @zama-fhe/relayer-sdk.
      - It still references deleted frontend/src/lib/fhevm-client.ts.
      - It describes the old manual FHE architecture.
      - This will undermine reviewer confidence and must be updated before submission.

  P2: Competitive polish

  9. Add a visible “live demo checklist” or guided first-run path so judges do not need to understand the protocol before using it.
  10. Add a public architecture/privacy diagram showing:
      - encrypted input,
      - Zama relayer,
      - FHEVM contract,
      - IndexedDB credentials,
      - user-only decryption,
      - public event indexer.

  11. Make the deployed contract’s current state useful for judging. An empty draw with no participants makes the demo look unfinished.
  12. Explain limitations clearly:
      - participant addresses and transaction timing remain public,
      - 256-participant bound,
      - Sepolia only,
      - unaudited,
      - owner-operated draw lifecycle.
