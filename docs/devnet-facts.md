# Devnet facts

Measured facts about the devnet and the libraries the demo app depends on.

## Decrypt cost

`decryptAmount(ciphertext, privateKey, rangeHigh)` in `@xrplf/mpt-crypto` 0.1.1 takes time
linear in `rangeHigh`, not in the encrypted value. A value above `rangeHigh` fails with
`mpt_decrypt_amount failed` after the same time as a full search. This contradicts the source
comment in `dist/primitives.js:12-14`, which says the search stops at the recovered value.

`frontend/packages/core/src/amount.ts` relies on this: it searches bounds 1000, 2000, 4000 and
so on up to the amount's bound, so the total cost stays within about 4 times a search bounded at
the value.

Median of 5 runs, Node 22.23.1, Apple M5 Pro, 2026-10-25:

| Value   | `rangeHigh` | ms    | Result                      |
| ------: | ----------: | ----: | :-------------------------- |
| 105     | 1,000       | 3.9   | found                       |
| 105     | 10,000      | 38.3  | found                       |
| 105     | 100,000     | 383.7 | found                       |
| 9,000   | 10,000      | 37.5  | found                       |
| 99,000  | 100,000     | 375.9 | found                       |
| 2,000   | 1,000       | 4.0   | `mpt_decrypt_amount failed` |
| 20,000  | 10,000      | 36.6  | `mpt_decrypt_amount failed` |
| 200,000 | 100,000     | 380.5 | `mpt_decrypt_amount failed` |

These are Node timings. The browser timing under Vite still needs to be measured.

## The xrpl.js fork under Vite

Measured 2026-10-25 with the fork at e0e36b3, Vite 8.3.5, with a throwaway entry that imports
`@confidential-loans/core/amount` and `@confidential-loans/core/confidential` dynamically and
decrypts one ciphertext.

| Chunk                       | Size        | Gzip        |
| :-------------------------- | ----------: | ----------: |
| `index` (React app)         | 229.80 kB   | 72.14 kB    |
| `confidential` (xrpl)       | 600.92 kB   | 160.93 kB   |
| `mpt_crypto.web` (glue)     | 39.75 kB    | 13.94 kB    |
| `mpt_crypto.wasm`           | 2,111.98 kB | 1,549.57 kB |

- The emitted WASM is byte-identical to the fork's patched
  `packages/mpt-crypto/wasm/mpt_crypto.wasm`. Vite picks the `browser` export, so it ships one
  WASM and fetches it with `new URL(..., import.meta.url)`; no Vite config is needed.
- In headless Chrome (agent-browser) the built page loaded the chunk and the WASM and decrypted
  105 under bound 1,000 in 19 ms, WASM fetch from localhost included.
- Hazard: `/Users/lucian/Code/xrp/node_modules/xrpl` (stock 5.3.0) sits above the repo. A bare
  `import 'xrpl'` from `apps/web`, which does not depend on xrpl, resolves there and ships a
  second, unpatched WASM (2,110.54 kB). Reach xrpl only through `@confidential-loans/core`.

## A full demo run through `openDemo`

Measured 2026-10-25 05:51-06:01 UTC on the team devnet with the xrpl.js fork, Node 22.23.1,
Apple M5 Pro: a fresh `scripts/.env`, then all 10 steps driven through `openDemo` and `act` in
screen order, each action started as soon as `gate()` opened.

Setup, in `frontend/`:

```sh
node scripts/setup.ts --subscription 120 --investment 300
node scripts/export-kit.ts > <a path outside the repo>/kit.json
```

- `setup.ts` on a fresh `.env` took 112 s: six faucet wallets, the token and its keys, five
  authorizations, four issuer payments, two borrower converts and merges, then the vault. The
  vault comes last, so the subscription window starts after the rest of setup.
- `--subscription 120` left 106 s of the window unused after steps 1 and 2. The defaults (300 s
  and 600 s) suit a run at human pace.

`act` from call to resolve, which includes the proof, validation and the reread that follows:

| Step | Action                                 | ms    |
| ---: | :------------------------------------- | ----: |
| 1    | LoanBrokerSet                          | 4,403 |
| 2    | VaultDeposit A, B                      | 5,355, 6,583 |
| 3    | LoanBrokerDraw                         | 3,389 |
| 3    | LoanBrokerMergeInbox                   | 4,336 |
| 4    | LoanSetSign A, B (nothing submitted)   | 2,361, 2,294 |
| 4    | LoanSetCosign A, B                     | 5,410, 5,695 |
| 6    | ConfidentialMPTMergeInbox (borrower A) | 5,438 |
| 6    | ConfidentialLoanPay A                  | 5,981 |
| 7    | LoanBrokerMergeInbox                   | 7,128 |
| 7    | LoanBrokerSettle                       | 4,841 |
| 8    | LoanManage impair, default B           | 3,302, 3,264 |
| 10   | VaultWithdraw A                        | 3,290 |
| 10   | VaultWithdraw B (`tecINSUFFICIENT_FUNDS`) | 6,385 |

- Each gated action ran at the first ledger `gate()` opened and succeeded: Draw at
  SubscriptionDate + 1 s, impair at NextPaymentDueDate + 1 s, default at NextPaymentDueDate +
  GracePeriod + 1 s, withdrawals at RedemptionDate. None was rejected for timing.
- Whole run, first `act` to the last: 410 s, of which 87 s waited for Investment, 93 s for
  impair and default, and 135 s for Redemption.
- `openDemo` on the finished run (16 demo transactions): 234 ms to the first snapshot.
- Decrypts at the end of the run, with ConfidentialOutstandingAmount 295,000 as the bound: from a
  fresh `openDemo` until no amount was pending, Auditor 7.7 s (9 amounts), Broker A 6.0 s (11)
  and Borrower A 4.3 s (7), one viewer after the other. Screens show pending amounts meanwhile.

Outcome, as screen 10 shows it:

- Settle of 105,000 cut DebtTotal from 200,000 to 95,000 and left AssetsTotal at 300,000: the
  amount settled went to debt first, so the 5,000 interest is not yet vault yield.
- The default of loan B booked no loss: LossUnrealized 0, AssetsTotal 300,000.
- Depositor A redeemed 150,000 shares for 150,000. Depositor B's VaultWithdraw failed with
  `tecINSUFFICIENT_FUNDS`: AssetsAvailable was 55,000.
- A VaultWithdraw's metadata cannot give the payout from the depositor's MPToken: rippled omits
  `MPTAmount` at 0, so a wallet the deposit emptied shows `PreviousFields: {}`. The payout is the
  drop in the Vault's AssetsTotal.
