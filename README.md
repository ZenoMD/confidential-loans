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
`pnpm install`; each script is safe to re-run. Seeds live in `frontend/scripts/.env`, which git
ignores.

| Command | What it does |
|---|---|
| `node scripts/setup-wallets.ts` | Creates and faucet-funds two accounts per role (broker, depositor, borrower) plus the issuer and treasury |
| `node scripts/issue-token.ts` | Issues CUSD, an MPT that can hold confidential balances, and registers the issuer and auditor decryption keys |
| `node scripts/fund-holders.ts` | Opts every account in to CUSD, pays depositors public balances for vault deposits, and gives borrowers confidential balances |
