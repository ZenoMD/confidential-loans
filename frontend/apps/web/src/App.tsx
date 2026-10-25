import { useEffect, useSyncExternalStore } from 'react'
import { Page } from './Page.tsx'
import { parseRoute } from './route.ts'
import type { Screen } from './route.ts'
import { FlowMap } from './screens/00-flow-map.tsx'

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

function useRoute(): Screen {
  return useSyncExternalStore(subscribe, () => parseRoute(window.location.hash))
}

/** Routes `#/` to the flow map and `#/1` to `#/10` to their step screens. */
export function App() {
  const screen = useRoute()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [screen])
  return screen === 0 ? <FlowMap /> : <Page step={screen} />
}
