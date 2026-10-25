import type { Action, Depositor, Public, Snapshot } from '@confidential-loans/core/demo-ledger'
import { formatAmount } from '#web/value.ts'

/** The label color of a breakdown row: `--mute`, `--loss`, or `--ink` for the total. */
export type RowTone = 'mute' | 'loss' | 'ink'

export interface RedeemRow {
  readonly label: 'Deposited' | 'Interest earned' | 'Default shortfall' | 'Payout'
  readonly shown: Public
  readonly tone: RowTone
}

/** The Role name of a depositor, also its Toggle label. */
export function depositorName(depositor: Depositor): 'Depositor A' | 'Depositor B' {
  return depositor === 'depositorA' ? 'Depositor A' : 'Depositor B'
}

/** The aside Toggle's options, which render before the ledger is read. */
export const DEPOSITOR_OPTIONS = [
  { value: 'depositorA', label: depositorName('depositorA') },
  { value: 'depositorB', label: depositorName('depositorB') },
] as const

export interface RedeemModel {
  readonly rows: readonly [RedeemRow, RedeemRow, RedeemRow, RedeemRow]
  readonly cta: { readonly action: Action; readonly label: 'Redeem all shares' }
  /** Why the depositor's last redemption failed, read from the ledger. */
  readonly failure: string | undefined
  /**
   * The depositor's VaultWithdraw records on the ledger, failed ones included. The view keys its
   * Cta on it, so a click's transient alert gives way to `failure` once the ledger records it.
   */
  readonly attempts: number
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
    rows: [
      { label: 'Deposited', shown: pub(paidIn), tone: 'mute' },
      { label: 'Interest earned', shown: pub(clampAtZero(payout - paidIn)), tone: 'mute' },
      { label: 'Default shortfall', shown: pub(clampAtZero(paidIn - payout)), tone: 'loss' },
      { label: 'Payout', shown: pub(payout), tone: 'ink' },
    ],
    cta: { action: { type: 'VaultWithdraw', depositor }, label: 'Redeem all shares' },
    attempts: s.log.filter((r) => r.type === 'VaultWithdraw' && r.signers[0] === depositor).length,
    failure:
      redeemFailure === undefined
        ? undefined
        : `Redemption failed with ${redeemFailure}: the vault has ${available} available.`,
  }
}
