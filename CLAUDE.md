# Confidential Loans

Hackathon repo for confidential lending on the XRP Ledger: the Lending Protocol (XLS-66) with
Confidential MPTs (XLS-96). `SPEC.md` defines the protocol changes. `design/` holds the demo designs and plans.

## Constraints

- Keep dependencies minimal. Every new dependency needs a reason a reviewer would accept; prefer
  the platform and what is already installed. Pin exact versions.
- Create nothing superfluous: no placeholder files, empty packages, speculative config, or code
  that nothing uses yet. Replace old code instead of keeping both.
- Small diffs, flat structure, one obvious place for each thing.
- Ask before opening a pull request. Permission to edit a file is not permission to open a PR.
- Never commit seeds or keys. The app generates them and keeps the deployment in `localStorage`
  only; seeds never enter the web bundle, a `VITE_*` variable or a URL.
- The app deploys the demo itself from its Initialize dialog (the user chose this over setup
  scripts and over pasting a kit). Do not reintroduce either.

## Layout

- `demo/`: pnpm workspace (Node 22.23.1 via Volta, pnpm 11.3.0).
  - `apps/web/`: Vite + React single-page app. Components (`.tsx`) stay thin over pure `.ts`
    models.
  - `packages/core/`: the only package that imports `xrpl`. All ledger access goes through it.
- `design/`: canvas boards (`canvas/project/*.dc.html`), `ui-plan.md`, `demo-plan.md`.
- `docs/devnet-facts.md`: measured facts about the devnet and the libraries.

## The xrpl.js fork

Willem's xrpl.js fork is vendored as packed tarballs in `demo/vendor/`: `xrpl`, plus the
two packages it patches, `ripple-binary-codec` and `@xrplf/mpt-crypto`. Core depends on the
`xrpl` tarball; `overrides` in `pnpm-workspace.yaml` swap in the other two. The rest of xrpl's
dependencies come from npm.

To update them, build the fork, then repack from its `packages/` directory and reinstall, which
records the new hashes in `pnpm-lock.yaml`:

```sh
for p in xrpl ripple-binary-codec mpt-crypto; do
  (cd "$p" && npm pack --ignore-scripts --pack-destination "$DEMO/vendor")
done
```

- Never run `npm run fetch:wasm` in the fork: it replaces the patched WASM in
  `packages/mpt-crypto/wasm` with a release that lacks the lending exports.

## Commands (run in `demo/`)

- `pnpm install --frozen-lockfile --offline`: install from the local store; ask before any
  install that needs the network.
- `pnpm check`: typecheck, oxlint, oxfmt check.
- `pnpm test`: Node's built-in test runner over `packages/*/src/**/*.test.ts` and
  `apps/*/src/**/*.test.ts`.
- `pnpm build`: production build to `apps/web/dist`.
- `pnpm dev`: web app on http://localhost:5173.

## Tests

- Test behavior through public functions. Fake only the network (the xrpl `Client`) and time.
- Tests and everything they import are `.ts` with erasable syntax only; the runner does not
  compile JSX.
- Break the code once to see each new test fail, then restore it.

## Style

- oxfmt: 100-character lines, no semicolons, single quotes. `./x.ts` imports inside a package;
  `@confidential-loans/core/<module>` across packages.
- Functions of 100 lines or fewer. Google-style doc comments on non-trivial exports.
- No emojis and no em dashes, in code, docs and commit messages.

## Network

- Team devnet: `wss://xrpl-confidential-loans.zeno.md` (valid TLS). Faucet:
  `https://faucet.xrpl-confidential-loans.zeno.md/accounts`.
- The devnet can be reset. Deployment is idempotent: Initialize recreates what is missing.
