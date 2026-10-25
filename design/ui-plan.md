# UI plan

Superseded 2026-10-25: the web app now has one tab per actor instead of the 10-step flow, and no
explorer screens. The canvas below still shows the step flow.

Draft 2026-10-25. Two runs, each in a cloud agent. Run 1 updates the design canvas; run 2 builds
the web app from the approved canvas. Flow and timing: `demo-plan.md`. Spec: `SPEC.md` at
`3f88252`.

Canvas: https://claude.ai/artifact/1Lbon5tGoHW8xxNkraef2M. Version 27 carries the `2c68d1f`
spec. `3f88252` then changed three things the canvas still contradicts: a regular payment is at
least the Periodic Payment and at most the Amount Owed (overpaying is allowed), the Loan Auditor
receives each payment's ciphertext, and the broker can settle at any time.

## Run 1: design pass

### Rules

1. **Show, not tell.** The video carries the story. Every text element must earn its place: keep a
   label if it names a value, keep a sentence only if a viewer would otherwise misread the screen.
   Delete explanations of protocol mechanics, timings, error codes and "open with Willem" notes.
   Open questions live only in the canvas note.
2. **Right column = who acts and what they do.** Role icon, role name and one action line. Nothing
   else.
3. **No "Visible to" section** on any screen. Visibility is shown only by the explorer screens (5
   and 9) through their view toggle.
4. **Amounts are small and labelled.** One modest size for every amount, a `$` prefix, no "CUSD"
   labels. Encrypted amounts keep the blue key color; that color is the only encryption cue.
5. **The spec is `3f88252`.** Keep version 27's spec content that still holds (merge before
   settle, public settle, unbooked default loss); apply the three `3f88252` changes above; cut the
   explanatory copy under rule 1. In the canvas note, mark overpayment and settle timing answered.

### Modules

A `<dc-import>` child takes props but has no slot, so no module can wrap a screen's content. Each
screen composes three modules and keeps only its own content (inputs, buttons, toggles, explorer
rows). Each module file is also an artboard, listed in a "Modules" row on the canvas.

| Module | Interface | Hides |
| :-- | :-- | :-- |
| `StepNav.dc.html` | `step`: 0 (flow map) to 10 | Header, the 10-step nav with done, current and upcoming styles, step icons and links, and the vault phase derived from the step (1-2 Subscription, 3-9 Investment, 10 Redemption). No countdown: the video is sped up. |
| `Role.dc.html` | `role`: `broker`, `depositor`, `borrower` or `explorer`; `who`: display name; `action`: one line | The role icon, type scale and right-column alignment. |
| `Value.dc.html` | `label` (optional); `amount`: digits or a placeholder; `visibility`: `public`, `decrypted` or `redacted` | The one amount size, the `$` prefix, blue for `decrypted`, and the grey redaction bar for `redacted` (explorer outsider view). Rule 4 lives here. |

`who` replaces `name`, which `<dc-import>` reserves. Rejected: one `Shell` holding header, nav and
role, which needs slots the format lacks; an `encrypted` boolean on `Value`, which leaves the
explorer redaction bar to each screen.

### Tasks

One subagent per task, then one review subagent per screen that checks it against the rules above
and against `SPEC.md`. Shared modules first, screens in parallel after.

1. Build `Shell` and `Value`.
2. Screens 1-3, 4, 5, 6, 7, 8, 9, 10 and the flow map: one task each.
3. Per-screen review: rules 1-5, spec accuracy, accessibility (real buttons and labels, 4.5:1
   text contrast).
4. Update the canvas note; publish.

## Run 2: web app (after run 1 is approved)

Blocked on protocol work. Not started.

- Willem's xrpl.js fork with confidential `LoanBrokerSet`, `LoanBrokerDraw`,
  `LoanBrokerMergeInbox`, confidential `LoanSet`, `ConfidentialLoanPay` and `LoanBrokerSettle`.
- The team devnet running the amendment.
- Provers for the new proof parts (`LoanSet` parts 2-7, `ConfidentialLoanPay` parts 2-4,
  `LoanBrokerSettle`).

What can be built before then: the screens, ledger reads, and the published transactions
(`VaultDeposit`, `VaultWithdraw`, `LoanManage`, `ConfidentialMPTMergeInbox`). The new
transactions would go behind `packages/core/src/lending.ts`, with a fake until the fork lands.

## Open

- Explorer toggle: Outsider and Auditor (per `demo-plan.md`), or also Broker?
- Can a cloud agent read and publish the canvas? Test with a one-file probe before run 1. If not,
  export the canvas files to the repo on a branch, edit there, and publish locally.
