import { parseWhole } from './value.ts'

export type Unit = 's' | 'min' | 'h' | 'd'

/** The units a duration field offers, smallest first. */
export const UNITS: readonly {
  readonly unit: Unit
  readonly label: string
  readonly seconds: number
}[] = [
  { unit: 's', label: 'seconds', seconds: 1 },
  { unit: 'min', label: 'minutes', seconds: 60 },
  { unit: 'h', label: 'hours', seconds: 3600 },
  { unit: 'd', label: 'days', seconds: 86_400 },
]

/** One duration field: the amount as typed, and its unit. */
export interface DurationInput {
  readonly amount: string
  readonly unit: Unit
}

function unitSeconds(unit: Unit): number {
  return UNITS.find((u) => u.unit === unit)?.seconds ?? 1
}

/** Shows whole seconds in the largest unit that divides them: 180 reads as 3 minutes. */
export function inputOf(seconds: number): DurationInput {
  const unit = UNITS.findLast((u) => seconds % u.seconds === 0) ?? UNITS[0]
  return { amount: String(seconds / (unit?.seconds ?? 1)), unit: unit?.unit ?? 's' }
}

/** The seconds a duration field holds; an empty amount reads as 0. */
export function secondsOf({ amount, unit }: DurationInput): number {
  return Number(parseWhole(amount).value) * unitSeconds(unit)
}
