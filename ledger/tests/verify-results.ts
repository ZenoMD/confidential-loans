// Checks the recorded app runs in results/2026-10-25-app-runs.tsv against the public Devnet: each
// transaction must exist with the recorded result, and its SigningPubKey must belong to the signer
// the row claims. A signature from the broker account's master key could only come from the Ledger.
// Devnet resets periodically; after a reset the transactions are gone and this check fails.

import { readFileSync } from 'node:fs'

import { deriveAddress } from 'xrpl'

import { withClient } from '#lib/network'

const BROKER = 'rHUSjy2T64P3J78Lo4bxbyJKQHwMYZJCyH'
const RUNS = new URL('../results/2026-10-25-app-runs.tsv', import.meta.url)

const rows = readFileSync(RUNS, 'utf8').trim().split('\n').slice(1)
let failures = 0
await withClient(async (client) => {
  for (const row of rows) {
    const [, label, result, signedBy, hash] = row.split('\t')
    const tx = await client.request({ command: 'tx', transaction: hash ?? '' })
    const json = tx.result.tx_json as Record<string, unknown>
    const meta = tx.result.meta as { TransactionResult: string }
    const signer = deriveAddress(String(json['SigningPubKey']))
    const actual = signer === BROKER ? 'Ledger (master key)' : `software regular key ${signer}`
    const ok = actual === signedBy && meta.TransactionResult === result
    if (!ok) failures++
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${meta.TransactionResult}, signed by ${actual}`)
  }
})
console.log(`${rows.length - failures}/${rows.length} rows match Devnet`)
if (failures > 0) process.exitCode = 1
