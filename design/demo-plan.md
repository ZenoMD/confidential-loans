# Demo plan

Agreed 2026-10-24. What the frontend shows, in order. Setup with no screen (wallets, token,
holder balances, vault) runs from `confidential-loans/frontend/scripts`. The video is recorded and
sped up, so protocol waits do not need to fit a live slot. Timings: `product/demo-timing.html`.

## UI flow

Two loans, because one loan cannot be repaid, paid late and defaulted.

1. Broker: create the confidential LoanBroker with its `HolderEncryptionKey` and `ZKProof`
   (`LoanBrokerSet`, SPEC.md §6). No fee and no first-loss cover.
2. Depositors: subscribe (`VaultDeposit`).
3. Broker: draw into the Lending Balance (`LoanBrokerDraw`, public amount), then merge it into
   spending (`LoanBrokerMergeInbox`). SPEC.md §7, §9.
4. Broker + borrowerA co-sign loan A; broker + borrowerB co-sign loan B (`LoanSet`).
5. Mini explorer: outsider view, then auditor view.
6. borrowerA: repay (`ConfidentialLoanPay`); the action merges the inbox first.
7. Broker: settle the Lending Balance back to the vault (`LoanBrokerSettle`).
8. Broker: impair, then default, loan B (`LoanManage`).
9. Mini explorer: outsider view, then auditor view.
10. Depositors: redeem (`VaultWithdraw`); the payout shows the default loss, which depositors
    carry in full.

Left out of the video: late payment (adds a 60 s wait and a third storyline), `LoanDelete`,
`LoanBrokerDelete`, `VaultDelete`.

## Timing constraints

- Both loans are created within the first 60 s of Investment (with 180 s Investment and one 60 s
  payment), or `LoanSet` fails with `tecNO_PERMISSION`.
- Loan A repays about 20 s after creation; loan B can default about 2 min 10 s after creation.
- Redemption opens at least 180 s after Subscription closes.

## Decisions

- **Keys in the browser.** Each role decrypts with its own ElGamal private key in the frontend: the
  borrower reads its balance, the broker reads loan amounts and repayments.
- **The chain enforces repayments.** `ConfidentialLoanPay` carries zero-knowledge proofs that the
  encrypted amount covers the periodic payment, or the balance for a full repayment (SPEC.md §3).
  The broker still impairs and defaults a loan that misses a payment with `LoanManage`.
- **No first-loss cover.** A confidential LoanBroker has `ManagementFeeRate`, `CoverRateMinimum`,
  `CoverRateLiquidation` and `CoverAvailable` at 0, and `LoanBrokerCoverDeposit` fails
  (SPEC.md §4.2, §10). Depositors carry every loss.
- **Mini explorer, not an indexer.** The app records every transaction it submits in this run (hash,
  role, step) and stores the full validated JSON and metadata at submit time. The team node keeps
  only a few hours of history, so lookups by hash fail later. Two views of the same records:
  public (raw ciphertexts) and decrypted (done when each transaction lands, about 1.7 s per balance
  at 500,000 supply). The decrypted view likely reuses the broker's key; if so, label it "Broker
  view", since the token's separate auditor key is a different party.
- **LoanBroker creation moves to the UI**, so `scripts/create-vault.ts` should create only the
  vault.

## Open, needs Willem

SPEC.md answers which LoanBroker fields are encrypted and the shapes of `LoanBrokerSet`,
`LoanBrokerDraw` and `LoanBrokerMergeInbox`. Still open:

- Does `ConfidentialLoanPay` advance `NextPaymentDueDate`? Today `LoanManage` impair needs the loan
  to be overdue on chain (`tecTOO_SOON` before) and default needs due date + grace.
- `LoanSet` fields (§11 is a commented-out draft) and `ConfidentialLoanPay` fields and proofs (§12
  is a stub). Whether the auditor gets the amount owed and periodic payment: §3 says yes, the §11
  draft has no auditor fields for them.
- `LoanBrokerSettle` (§8 is a stub): is the settled amount public, like a draw?
- How a default and loan interest reach the vault's totals on a confidential loan.
