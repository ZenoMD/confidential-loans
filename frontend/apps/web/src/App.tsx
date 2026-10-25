import { useEffect, useSyncExternalStore } from 'react'
import { KitPage } from './KitPage.tsx'
import { Page } from './Page.tsx'
import { parseRoute } from './route.ts'
import type { Route } from './route.ts'
import { FlowMap } from './screens/00-flow-map.tsx'

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

function useRoute(): Route {
  return useSyncExternalStore(subscribe, () => parseRoute(window.location.hash))
}

/** Routes `#/` to the flow map, `#/1` to `#/10` to their step screens and `#/kit` to the kit. */
export function App() {
  const route = useRoute()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route])
  if (route === 'kit') return <KitPage />
  return route === 0 ? <FlowMap /> : <Page step={route} />
}
