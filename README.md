# Confidential Loans

Institutional lending on the XRP Ledger where loan balances stay encrypted. The project combines the
[Lending Protocol (XLS-66)](https://xls.xrpl.org/xls/XLS-0066-lending-protocol.html) with
[Confidential MPTs (XLS-96)](https://xls.xrpl.org/xls/XLS-0096-confidential-mpt.html): depositors fund
a vault, a loan broker lends from it, and the borrower's principal and repayments move as ElGamal
ciphertexts that only the parties, the issuer and an auditor can decrypt.

## Network

Everything here runs against the team devnet, a rippled node with the lending and confidential
transfer amendments enabled.

| Service | Endpoint |
|---|---|
| WebSocket | `wss://xrpl-confidential-loans.zeno.md` |
| JSON-RPC | `https://rpc.xrpl-confidential-loans.zeno.md` |
| Faucet | `https://faucet.xrpl-confidential-loans.zeno.md/accounts` |

## Layout

| Path | Contents |
|---|---|
| `frontend/apps/web` | Web app (Vite + React) |
| `frontend/packages/core` | All ledger access; the only package that imports `xrpl` |
| `frontend/scripts` | Command-line setup scripts |

## Scripts

Setup for the steps that have no screen in the demo. Run from `frontend/` with Node 22 after
`pnpm install`. The setup scripts skip work that is already on the ledger; `create-vault` makes a
fresh vault each run, because a vault's phase dates are fixed when it is created. Seeds live in `frontend/scripts/.env`, which git
ignores.

| Command | What it does |
|---|---|
| `node scripts/setup-wallets.ts` | Creates and faucet-funds two accounts per role (broker, depositor, borrower) plus the issuer and treasury |
| `node scripts/issue-token.ts` | Issues CUSD, an MPT that can hold confidential balances, and registers the issuer and auditor decryption keys |
| `node scripts/fund-holders.ts` | Opts every account in to CUSD, pays depositors public balances for vault deposits, and gives borrowers confidential balances |
| `node scripts/create-vault.ts` | Creates a closed-ended vault with a loan broker and first-loss cover; `--help` lists the phase-timing options |

## Future work

- **On-chain enforcement of confidential repayments.** The ledger cannot read a confidential
  repayment, so it does not reject one that is short or late. In this project the loan broker
  decrypts each repayment with its private key and decides when a loan is delinquent (impaired) or
  foreclosed (defaulted), then records that decision on chain with `LoanManage`. A complete version
  would have the borrower attach a zero-knowledge proof that the payment covers the amount due, so
  the ledger enforces it the way it does for public `LoanPay` (`tecINSUFFICIENT_PAYMENT`,
  `tecEXPIRED`).
