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
- Never commit seeds, keys or ledger state: `frontend/scripts/.env` and `state.json` stay
  gitignored, and seeds never enter the web bundle, a `VITE_*` variable or a URL.
- The app loads the kit from `/demo-kit`, which the dev and preview servers build from
  `scripts/.env` (the user chose this over pasting a kit). Do not reintroduce a paste step.

## Layout

- `frontend/`: pnpm workspace (Node 22.23.1 via Volta, pnpm 11.3.0).
  - `apps/web/`: Vite + React single-page app. Components (`.tsx`) stay thin over pure `.ts`
    models.
  - `packages/core/`: the only package that imports `xrpl`. All ledger access goes through it.
  - `scripts/`: Node setup scripts for the steps that have no screen.
- `design/`: canvas boards (`canvas/project/*.dc.html`), `ui-plan.md`, `demo-plan.md`.
- `docs/devnet-facts.md`: measured facts about the devnet and the libraries.

## The xrpl.js fork

Core depends on Willem's xrpl.js fork through `"xrpl": "link:../../../xrpl.js/packages/xrpl"`.
`xrpl.js` at the repo root is a gitignored symlink to a built checkout of the fork. Create it in
every checkout and worktree before `pnpm install`:

```sh
ln -sfn "${XRPL_JS:-$HOME/Code/xrp/worktrees/protocol/xrpl.js}" xrpl.js
```

- The fork must be built (`packages/xrpl/dist/npm` exists). Its patched WASM is tracked in
  `packages/mpt-crypto/wasm`.
- Never run `npm run fetch:wasm` in the fork: it replaces the patched WASM with a release that
  lacks the lending exports.

## Commands (run in `frontend/`)

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
- The devnet can be reset. The setup scripts are idempotent and recreate what is missing.
