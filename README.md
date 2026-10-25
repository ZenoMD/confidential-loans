# XRPL Confidential Loans

A new XRPL protocol amendment that allows loans to be issued in confidential MPTs and sensitive aspects of the loan to remain confidential between the broker and borrower. Created for XRPL Swell 2026 hackathon.

## About

Confidential Loans is an XRPL protocol amendment that combines features of XLS-66 (LendingProtocol) and XLS-96 (ConfidentialTransfers) to construct a lending protocol that keeps the principal, amount owed, periodic payment amount, and repayments confidential. It also allows borrowers to receive their loans directly into their confidential MPT balance.

In conventional banking it is very unusual for loans to be public information. One reason for this is that a public loan exposes the borrower to additional risk by revealing whether they are under financial stress or restricted in some way due to an outstanding loan. Other financial actors may exploit this information to force a borrower to pay a higher price for assets or risk a default.

Case study: A small business takes out an on-chain loan to buy inventory before its busy season. If the loan is public, suppliers can see the debt and tighten payment terms, and competitors get advance insight into the business's plans. Borrowing privately allows the business to receive the loan confidentially and prevents negative exposure.

Confidential loans on XRPL bring borrowers the level of confidentiality they expect from traditional banking while providing the benefits of a global ledger.

The submission has a number of components:

- [XLS-style spec](https://zeno-confidential-loans.pages.dev/#/spec)
- [Public demo app](https://zeno-confidential-loans.pages.dev/)
- [Rippled fork implementing the spec](https://github.com/ZenoMD/rippled/tree/confidential-loans)
- [xrpl.js fork](https://github.com/ZenoMD/xrpl.js/tree/confidential-loans)
- public devnet with ConfidentialLendingProtocol amendment enabled
    - WS: wss://xrpl-confidential-loans.zeno.md
    - RPC: https://rpc.xrpl-confidential-loans.zeno.md
    - explorer : https://custom.xrpl.org/xrpl-confidential-loans.zeno.md:443

## Technical Description

Confidential transfers on XRPL (added in the ConfidentialTransfer amendment) work by introducing a separate confidential balance per MPT per account. This balance is encrypted via ElGamal encryption which is additively homomorphic (i.e. `Enc(A) + Enc(B) = Enc(A + B)`). This property plus some ZK range proofs allow the ledger to correctly perform accounting even when working over encrypted balances. Confidential MPT holders can send payments to other confidential accounts without revealing the amount or their balance before and after.

The majority of accounting operations performed by the XRPL lending protocol are additive (with some exceptions, more on that later) making it possible to also perform them over encrypted values. This was our key insight that lead to the development of the confidential lending protocol.

See [the spec](https://zeno-confidential-loans.pages.dev/#/spec) for full technical details.

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
