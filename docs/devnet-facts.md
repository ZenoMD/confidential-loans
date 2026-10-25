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
