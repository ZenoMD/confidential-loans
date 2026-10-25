# Ledger hardware signing: proof of concept

**Status: proof of concept on branch `test/ledger`, not merged into the demo app.** It is a
separate Node package that runs against the **public XRPL Devnet**, where the published lending
protocol (XLS-66) is live, with ordinary (non-confidential) loans. It has not been run on the team
devnet with the confidential lending amendment. The demo app in `demo/` does not use a Ledger;
[Integration](#integration-into-the-demo-app) lists the steps to add it.

A Ledger Nano S Plus holds the loan broker account's master key and signs the broker's credit
decisions: impair a loan, default it, delete it. A software regular key signs every other broker
step. The page reuses the demo app's stylesheets and shows the Broker tab's loan cards with
"with Ledger" actions.

## Results

Device: Ledger Nano S Plus, XRP app 2.8.2. Transactions are on the public Devnet
(`https://devnet.xrpl.org/transactions/<hash>`), which resets periodically.

### Verified on the device

| What                                                                                                                                                                                               | Evidence                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| This app: the Ledger signed impair, default and delete of one loan, and impair and default of a second; all five `tesSUCCESS` (2026-10-25)                                                         | [`results/2026-10-25-app-runs.tsv`](results/2026-10-25-app-runs.tsv): each hash and who signed it. `pnpm verify-results` re-checks every row on Devnet: the five Ledger rows carry the broker account's master public key, which only the device holds. The other six rows are dry runs signed by the software key. |
| Signing test, first run: 9 published transaction types sent to the device with blind signing off; 6 refused while parsing (`0x680b`), 3 needed blind signing (`0x6985`), as predicted (2026-10-23) | [`results/2026-10-23-signing-matrix.log`](results/2026-10-23-signing-matrix.log)                                                                                                                                                                                                                                    |
| The Ledger clear-signed `SetRegularKey`, then blind-signed impair, default and delete of a loan the regular key created; all `tesSUCCESS` (2026-10-23)                                             | [`results/2026-10-23-broker-split.log`](results/2026-10-23-broker-split.log)                                                                                                                                                                                                                                        |
| The Ledger clear-signed a 1 XRP `Payment`; `tesSUCCESS` (2026-10-23)                                                                                                                               | [`results/2026-10-23-payment.log`](results/2026-10-23-payment.log)                                                                                                                                                                                                                                                  |

The 2026-10-23 runs and the device run of the app used scripts in the authors' prep workspace;
this folder is their port. After porting, the app was re-verified here with `pnpm dry-run`
(software key) and the signing test with `--encode-only`; the ported code has not been re-run on the
device.

### Not supported by XRP app 2.8.2

Any transaction with an MPT issuance ID (`UInt192`), an MPT amount, or a `Number` field is refused
while parsing (`0x680b`). The app's source rejects these before its blind-signing check, so turning
blind signing on does not help (inferred from the source; the device run above had it off). That
rules out the public `LoanSet`, `LoanPay`, `VaultCreate`, `VaultDeposit` and `MPTokenAuthorize`: the
Ledger cannot originate a public loan, and depositors and borrowers need software keys.

### Confidential lending transactions: predicted, not yet run on a device

`tests/signing-matrix.ts` includes this repo's confidential transactions, encoded with the xrpl.js
fork in `demo/vendor`. They encode and fit the app's buffer (`pnpm signing-test --encode-only`),
but the device run has not been done. Predictions from the app's parser:

| Transaction                          | Prediction    | Why                                                                                      |
| ------------------------------------ | ------------- | ---------------------------------------------------------------------------------------- |
| `LoanBrokerSet` (confidential)       | Blind signing | Blob fields only                                                                         |
| `LoanSet` (confidential, broker)     | Blind signing | No `Number` fields: amounts are encrypted Blobs. 4,093 bytes fits the 10,000-byte buffer |
| `LoanBrokerMergeInbox`               | Blind signing | Account and hash fields only                                                             |
| `ConfidentialLoanPay`                | Blind signing | Blob and hash fields only                                                                |
| `LoanBrokerDraw`, `LoanBrokerSettle` | Refused       | MPT `Amount`                                                                             |

If the device confirms them, the confidential amendment would let a Ledger-held broker originate
loans, which the public `LoanSet` does not allow.

## How it was developed

Each step used the previous step's results.

1. **Read the device's parser.** `LedgerHQ/app-xrp` at `7b5185f` (XRP app 2.8.2),
   `src/xrp/xrp_parse.c`: a field of an unreadable type (`UInt192`, `Number`, `UInt64`) is refused;
   an unknown transaction type, flag or field name requires blind signing; `src/limitations.h`
   caps a transaction at 10,000 bytes. This gave a prediction for each transaction in the flow.
2. **Signing test on the device.** Each transaction type is built offline and sent to the Ledger;
   nothing is submitted. The first run matched all nine predictions for the published types.
3. **Live run on Devnet** with the regular-key split (below).
4. **This app.** A dry run signed with the software key, proving the page, server and transactions
   before the device was involved; then the device run.
5. **Hardening.** Devnet dropped the websocket several times during setup, and xrpl.js's
   `disconnect()` never settles on a socket that is still closing, which killed the process.
   `reconnecting` in `lib/network.ts` retries reads across drops and resubmits a signed blob
   safely. `tests/reconnect.test.ts` reproduces the stuck socket and fails if `disconnect()` is
   called during recovery; `pnpm reconnect-test` drops a live connection twice.

## How it works

```
browser page ──HTTP──> app/server.ts ──USB HID──> Ledger (XRP app)
(app/public)  127.0.0.1     │
                            └──websocket──> XRPL Devnet
```

- **Regular-key split.** The Ledger clear-signs one `SetRegularKey`, authorizing a software key,
  which signs what the device cannot parse (vault, broker, cover, `LoanSet`). The Ledger signs the
  credit actions.
- **Review time.** `autofillForLedger` sets `LastLedgerSequence` 200 ledgers ahead (about 12
  minutes) instead of xrpl.js's 20, so an on-device review does not expire the transaction.
- **State check before signing.** The server checks the loan's state first, so the user is not
  asked to approve an action the loan's state rules out.
- **Device errors in plain words.** Locked device, blind signing off, an earlier review still on
  screen, app not open: the page says what to do and offers Try again.
- **Local only.** The server listens on 127.0.0.1 and accepts only JSON POSTs, so other web pages
  cannot trigger signing.

## Integration into the demo app

1. **Signer seam in core.** `demo/packages/core/src/demo-actions.ts` signs every action with a
   software `Wallet` in `send(tx, by)`. Add a signer interface (address, sign) with two adapters:
   the existing wallet and a Ledger signer built on `lib/ledger.ts`. Route the broker's
   `LoanManage` through the Ledger signer; `LoanDelete` would be a new demo action.
2. **Browser transport.** This POC reaches the device from Node over USB HID. In the hosted web app,
   swap `@ledgerhq/hw-transport-node-hid` for `@ledgerhq/hw-transport-webhid` (Chrome, Edge or
   Opera; HTTPS or localhost). `@ledgerhq/hw-app-xrp` is unchanged.
3. **Broker account.** The demo creates a fresh broker account per browser deployment (`kit.ts`).
   With a Ledger, the broker account is the device's account instead: it `SetRegularKey`s to the
   kit's broker seed, and the deploy keeps signing setup with that key. The Broker Key (ElGamal)
   already has its own seed in `kit.ts`, separate from the account key, so confidential proofs are
   unaffected. A borrower on a Ledger would need the same separation: today a borrower's ElGamal
   key derives from its account seed.
4. **Confidential transactions.** Run `pnpm signing-test` on the device and enable Ledger signing
   only for the transactions it confirms.
5. **UI.** Reuse this page's review dialog and error messages in the Broker tab's `Cta`.

## Run it

Node 22.18 or later (runs `.ts` directly; Volta pins 22.23.1) and pnpm 11. `node-hid` builds native
code on install: Xcode command line tools on macOS, `libudev` headers on Linux. From `ledger/`:

```sh
pnpm install
pnpm test                          # unit test, no network or device
pnpm signing-test --encode-only    # no device: every case encodes and fits the app's buffer
pnpm signing-test                  # Ledger connected, XRP app open; approve each review
pnpm create-loans                  # vault, broker and two loans owned by the Ledger account (~7 min)
pnpm start                         # http://localhost:5180, signing on the Ledger
pnpm dry-run                       # same page, the software regular key signs instead
pnpm verify-results                # re-check results/2026-10-25-app-runs.tsv on Devnet
pnpm reconnect-test                # drops a live Devnet connection twice
pnpm check                         # typecheck, lint, format
```

- `pnpm signing-test` writes `results/signing-matrix.md`. Add `--blind-signing-off` when the XRP
  app's Blind signing setting is off; blind-sign cases are then expected to be rejected.
- `pnpm create-loans` reads the Ledger's address and asks for one clear signature (`SetRegularKey`)
  the first time. Wallet seeds, including the regular key's, go in `ledger/.env`; ledger IDs go in
  `ledger/fixtures/`. Both are git-ignored. Losing `.env` means a new regular key, which the Ledger
  must authorize again.
- Signing a loan action needs Blind signing on in the XRP app and Ledger Live closed.
- `XRPL_NETWORK=team` points the scripts at the team devnet; this POC has not been run there.

## Limits

- **The Ledger is an additional signer, not an enforced one.** On the XRPL a regular key can sign
  anything the account can, so the software regular key could also impair, default and delete
  (`pnpm dry-run` does exactly that). Making the Ledger mandatory would mean removing the regular
  key after setup, which the public `LoanSet` rules out because the device cannot sign it.
- Blind signing shows only a hash on the device, so the user trusts the page for what the
  transaction does. Clear signing for these types needs support in the Ledger XRP app.
- One device and app version: Nano S Plus, XRP app 2.8.2.
- The page copies the demo's CSS (`app/public/demo.css`), not its React components. Its title is
  the demo's, but the loans it shows are public.
- The loans have two 60-second payment periods, so interest rounds to about $1.
