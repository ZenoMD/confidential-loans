/** A demo step, as numbered on the canvas and in the step navigation. */
export type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

/** A routable screen: 0 is the flow map, the rest are the demo steps. */
export type Screen = 0 | Step

/** Every route: the screens, plus the unlisted page that loads the kit. */
export type Route = Screen | 'kit'

export const KIT_HREF = '#/kit'

const STEP_HASH = /^#\/([1-9]|10)$/

/** Reads the route from `location.hash`. Any hash that names no route opens the flow map. */
export function parseRoute(hash: string): Route {
  if (hash === KIT_HREF) return 'kit'
  const match = STEP_HASH.exec(hash)
  return match === null ? 0 : (Number(match[1]) as Step)
}

export function screenHref(screen: Screen): string {
  return screen === 0 ? '#/' : `#/${screen}`
}
