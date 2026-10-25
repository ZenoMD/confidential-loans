/** A demo step, as numbered on the canvas and in the step navigation. */
export type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

const STEP_HASH = /^#\/([1-9]|10)$/

/** Reads the step from `location.hash`. Any hash that names no step opens step 1. */
export function parseRoute(hash: string): Step {
  const match = STEP_HASH.exec(hash)
  return match === null ? 1 : (Number(match[1]) as Step)
}

export function stepHref(step: Step): string {
  return `#/${step}`
}
