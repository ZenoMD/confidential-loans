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
