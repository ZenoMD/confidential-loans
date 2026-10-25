import { useEffect, useSyncExternalStore } from 'react'
import type { ComponentType } from 'react'
import { parseRoute } from './route.ts'
import type { Screen, Step } from './route.ts'
import { FlowMap } from './screens/00-flow-map.tsx'
import { Step01 } from './screens/01-broker-setup.tsx'
import { Step02 } from './screens/02-deposit.tsx'
import { Step03 } from './screens/03-draw.tsx'
import { Step04 } from './screens/04-originate.tsx'
import { Step05 } from './screens/05-explorer-loans.tsx'
import { Step06 } from './screens/06-repay.tsx'
import { Step07 } from './screens/07-settle.tsx'
import { Step08 } from './screens/08-impair-default.tsx'
import { Step09 } from './screens/09-explorer-default.tsx'
import { Step10 } from './screens/10-redeem.tsx'

const STEP_SCREENS: Record<Step, ComponentType> = {
  1: Step01,
  2: Step02,
  3: Step03,
  4: Step04,
  5: Step05,
  6: Step06,
  7: Step07,
  8: Step08,
  9: Step09,
  10: Step10,
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

function useRoute(): Screen {
  return useSyncExternalStore(subscribe, () => parseRoute(window.location.hash))
}

/** Routes `#/` to the flow map and `#/1` to `#/10` to their step screens. */
export function App() {
  const route = useRoute()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route])
  if (route === 0) return <FlowMap />
  const StepScreen = STEP_SCREENS[route]
  return <StepScreen />
}
