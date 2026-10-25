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
