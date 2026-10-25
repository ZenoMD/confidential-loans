import type { Action, Depositor, Snapshot } from '@confidential-loans/core/demo-ledger'
import { NAMES } from '#web/names.ts'
import { formatCount, parseWhole } from '#web/value.ts'
import type { Fact, LabelledAmount } from '#web/value.ts'

export interface DepositorModel {
  readonly holdings: {
    readonly amounts: readonly LabelledAmount[]
    readonly facts: readonly Fact[]
  }
  readonly vault: readonly LabelledAmount[]
  readonly deposit: {
    /** The amount field, digits only. */
    readonly text: string
    /** What Max puts in the field: the whole wallet. */
    readonly max: string
    readonly action: Action
    readonly label: string
  }
  readonly redeem: { readonly action: Action; readonly label: string }
}

/**
 * The Depositor tab: the depositor's wallet and shares, the vault they share, and the deposit and
 * redemption they can make. Depositors hold no key, so every amount is public.
 *
 * @param s - Any viewer's snapshot.
 * @param depositor - The account the picker selects.
 * @param amount - The deposit amount as typed.
 */
export function depositorTab(s: Snapshot, depositor: Depositor, amount: string): DepositorModel {
  const { wallet, shares, value } = s.depositors[depositor]
  const typed = parseWhole(amount)
  const { assetsTotal, assetsAvailable, lossUnrealized } = s.vault
  return {
    holdings: {
      amounts: [
        { label: 'Wallet', shown: wallet },
        { label: 'Share value', shown: value },
      ],
      facts: [{ label: 'Shares', text: formatCount(shares) }],
    },
    vault: [
      { label: 'Total assets', shown: assetsTotal },
      { label: 'Available to lend', shown: assetsAvailable },
      { label: 'Unrealized loss', shown: lossUnrealized },
    ],
    deposit: {
      text: typed.text,
      max: String(wallet.value),
      action: { type: 'VaultDeposit', depositor, amount: typed.value },
      label: `Deposit as ${NAMES[depositor]}`,
    },
    redeem: {
      action: { type: 'VaultWithdraw', depositor },
      label: 'Redeem all shares',
    },
  }
}
