/**
 * Prepares the devnet for a demo run, creating only what is missing: wallets, the confidential
 * token with its issuer and MPT Auditor keys, holder balances and the run's vault. Run it again
 * after a devnet reset. Then print the kit with `node scripts/export-kit.ts`.
 */
for (const step of ['setup-wallets', 'issue-token', 'fund-holders', 'create-vault']) {
  console.log(`== ${step}`)
  await import(`./${step}.ts`)
}

// Top-level await needs a module.
export {}
