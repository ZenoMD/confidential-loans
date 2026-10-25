import type { Action, Depositor, Public, Snapshot } from '@confidential-loans/core/demo-ledger'
import { formatAmount } from '#web/value.ts'

/** The label color of a breakdown row: `--mute`, `--loss`, or `--ink` for the total. */
export type RowTone = 'mute' | 'loss' | 'ink'

export interface RedeemRow {
  readonly label: 'Deposited' | 'Interest earned' | 'Default shortfall' | 'Payout'
  readonly shown: Public
  readonly tone: RowTone
}

export interface RedeemModel {
  /** The Role name, also the Toggle's pressed option. */
  readonly who: 'Depositor A' | 'Depositor B'
  readonly rows: readonly [RedeemRow, RedeemRow, RedeemRow, RedeemRow]
  readonly cta: { readonly action: Action; readonly label: 'Redeem all shares' }
  /** Why the depositor's last redemption failed, read from the ledger. */
  readonly failure: string | undefined
}

function pub(value: bigint): Public {
  return { visibility: 'public', value }
}

function clampAtZero(value: bigint): bigint {
  return value > 0n ? value : 0n
}

/**
 * What redeeming `shares` pays now: rippled `sharesToAssetsWithdraw`, which values shares at
 * `AssetsTotal - LossUnrealized` over the outstanding shares.
 */
function shareValue(s: Snapshot, shares: bigint): bigint {
  const { assetsTotal, lossUnrealized, sharesTotal } = s.vault
  if (sharesTotal === 0n) return 0n
  return ((assetsTotal.value - lossUnrealized.value) * shares) / sharesTotal
}

/**
 * Screen 10: the selected depositor's redemption, from the ledger alone. Payout is the redeemed
 * amount once the shares are gone, and the current value of the shares before that. Interest and
 * shortfall are the payout's difference from the deposit, so with no loss booked the shortfall
 * reads $0 and a redemption the vault cannot cover shows its engine code.
 *
 * @param s - The snapshot seen by `ui.depositor`; every amount here is public.
 * @param ui - The depositor the toggle selects.
 * @returns Everything the board shows.
 */
export function redeemModel(s: Snapshot, ui: { readonly depositor: Depositor }): RedeemModel {
  const { depositor } = ui
  const { shares, deposited, redeemed, redeemFailure } = s.depositors[depositor]
  const paidIn = deposited?.value ?? 0n
  const payout = shares === 0n && redeemed !== undefined ? redeemed.value : shareValue(s, shares)
  const available = formatAmount(s.vault.assetsAvailable.value)
  return {
    who: depositor === 'depositorA' ? 'Depositor A' : 'Depositor B',
    rows: [
      { label: 'Deposited', shown: pub(paidIn), tone: 'mute' },
      { label: 'Interest earned', shown: pub(clampAtZero(payout - paidIn)), tone: 'mute' },
      { label: 'Default shortfall', shown: pub(clampAtZero(paidIn - payout)), tone: 'loss' },
      { label: 'Payout', shown: pub(payout), tone: 'ink' },
    ],
    cta: { action: { type: 'VaultWithdraw', depositor }, label: 'Redeem all shares' },
    failure:
      redeemFailure === undefined
        ? undefined
        : `Redemption failed with ${redeemFailure}: the vault has ${available} available.`,
  }
}
