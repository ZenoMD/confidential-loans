# XRPL Confidential Loans

A new XRPL protocol amendment that allows loans to be issued in confidential MPTs and sensitive aspects of the loan to remain confidential between the broker and borrower. Created for XRPL Swell 2026 hackathon.

The submission has a number of components:

- [XLS-style spec](https://zeno-confidential-loans.pages.dev/#/spec)
- [Public demo app](https://zeno-confidential-loans.pages.dev/)
- [Rippled fork implementing the spec](https://github.com/ZenoMD/rippled/tree/confidential-loans)
- [xrpl.js fork](https://github.com/ZenoMD/xrpl.js/tree/confidential-loans)
- public devnet with ConfidentialLendingProtocol amendment enabled
    - WS: wss://xrpl-confidential-loans.zeno.md
    - RPC: https://rpc.xrpl-confidential-loans.zeno.md
    - explorer : https://custom.xrpl.org/xrpl-confidential-loans.zeno.md:443

## Ledger hardware signing (proof of concept)

[`ledger/`](./ledger/README.md), on the `test/ledger` branch: a Ledger Nano S Plus holds the loan
broker's master key and signs impair, default and delete. Verified on the public XRPL Devnet with
non-confidential loans; it is not merged into the demo app and has not run on the team devnet. Its
README has the device results, the signing test suite behind them, and the integration steps.

## Run the demo

You can use a [public deployment of the demo](https://zeno-confidential-loans.pages.dev/)

or

Run from `demo/` with Node 22.

```sh
pnpm install
pnpm run dev
```

## License

Released under ISC. See [LICENSE](./LICENSE).
