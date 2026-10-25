# Confidential Loans

Institutional lending on the XRP Ledger where loan balances stay encrypted. The project combines the
[Lending Protocol (XLS-66)](https://xls.xrpl.org/xls/XLS-0066-lending-protocol.html) with
[Confidential MPTs (XLS-96)](https://xls.xrpl.org/xls/XLS-0096-confidential-mpt.html): depositors fund
a vault, a loan broker lends from it, and each loan's principal and repayments move as ElGamal
ciphertexts. The broker, the borrower and the token's auditor can decrypt them; the issuer can
decrypt the principal but not repayments. The ledger checks each repayment against the amount due
with zero-knowledge proofs, without reading it. [SPEC.md](SPEC.md) defines the protocol changes.

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
`pnpm install`. Every script skips what is already on the ledger, so after a devnet reset
`node scripts/setup.ts` recreates whatever is missing. Seeds live in `frontend/scripts/.env` and
ledger IDs in `frontend/scripts/state.json`; git ignores both.

| Command | What it does |
|---|---|
| `node scripts/setup.ts` | Runs the four scripts below in order |
| `node scripts/setup-wallets.ts` | Creates and faucet-funds the issuer, Broker A, two depositors and two borrowers |
| `node scripts/issue-token.ts` | Issues CUSD, an MPT that can hold confidential balances, and registers the issuer and MPT Auditor keys |
| `node scripts/fund-holders.ts` | Opts every account in to CUSD, tops depositors up to 150,000 public CUSD and borrowers up to 100,000 confidential CUSD |
| `node scripts/create-vault.ts` | Creates the run's closed-ended vault (300 s Subscription, 600 s Investment by default) unless the saved one still takes deposits; `--help` lists the options |
| `node scripts/export-kit.ts` | Prints the kit, the JSON the app needs to play every role: addresses, seeds and ledger IDs |

Step 1 of the app creates the confidential LoanBroker, so no script does. The kit holds every
demo seed: never commit it, and never put it in the bundle, a `VITE_*` variable or a URL.

## Run the demo

Run from `frontend/` with Node 22. Steps 1 to 8 need a fresh vault that is still taking deposits.
Setup creates the vault last, so its 300 s deposit window opens once the rest of setup is done.

```sh
pnpm install --frozen-lockfile --offline
node scripts/setup.ts
node scripts/export-kit.ts > /path/outside/the/repo/kit.json
pnpm dev
```

1. Open http://localhost:5173/#/kit.
2. Paste the contents of `kit.json` and save it. The app stores the kit in this tab's
   `sessionStorage` only.
3. Open `#/` for the flow map, or go to `#/1` and work through to step 10.

The defaults (300 s Subscription, 600 s Investment) suit a demo at human pace. For a quick run,
pass `--subscription 120 --investment 300` to `setup.ts`. Once a vault reaches its Redemption
phase, run setup and export again to start a new run. The kit holds every demo seed, so keep it
outside the repo and delete it after the demo.
