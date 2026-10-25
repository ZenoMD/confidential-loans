import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import type { ReactNode } from 'react'
import { openDemo } from '@confidential-loans/core/demo-ledger'
import type { Demo, Kit, Snapshot, Viewer } from '@confidential-loans/core/demo-ledger'
import { connectLedger } from '@confidential-loans/core/network'
import type { Ledger } from '@confidential-loans/core/network'
import { loadKit } from './kit-source.ts'

/** Where the demo is: no kit from the local server, connecting, failed to open, or running. */
export type LedgerStatus =
  | { readonly status: 'noKit'; readonly error: string }
  | { readonly status: 'connecting' }
  | { readonly status: 'failed'; readonly error: string }
  | { readonly status: 'ready'; readonly demo: Demo }

interface LedgerContext {
  readonly status: LedgerStatus
}

const Context = createContext<LedgerContext | null>(null)

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

interface Opened {
  readonly ledger: Ledger
  readonly demo: Demo
}

async function open(): Promise<Opened> {
  let kit: Kit
  try {
    kit = await loadKit((url) => window.fetch(url))
  } catch (error) {
    throw new KitUnavailable(describe(error))
  }
  const ledger = await connectLedger()
  try {
    return { ledger, demo: await openDemo(kit, ledger) }
  } catch (error) {
    await ledger.close()
    throw error
  }
}

class KitUnavailable extends Error {}

function close({ ledger, demo }: Opened): void {
  demo.close()
  void ledger.close()
}

/**
 * Loads the kit from the local dev or preview server, then opens the demo on the devnet. Mount it
 * once, around the app.
 */
export function LedgerProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<LedgerStatus>({ status: 'connecting' })

  useEffect(() => {
    let active = true
    const opening = open()
    opening.then(
      (opened) => {
        if (active) setStatus({ status: 'ready', demo: opened.demo })
      },
      (error: unknown) => {
        if (!active) return
        const message = describe(error)
        setStatus(
          error instanceof KitUnavailable
            ? { status: 'noKit', error: message }
            : { status: 'failed', error: message },
        )
      },
    )
    return () => {
      active = false
      // A failed open has nothing to close and was reported above.
      opening.then(close, () => undefined)
    }
  }, [])

  const value = useMemo(() => ({ status }), [status])
  return <Context value={value}>{children}</Context>
}

function useLedgerContext(): LedgerContext {
  const context = useContext(Context)
  if (context === null) throw new Error('Wrap the app in <LedgerProvider>')
  return context
}

/** The demo's status, for the loading, missing-kit and failure lines. */
export function useLedgerStatus(): LedgerStatus {
  return useLedgerContext().status
}

/** The running demo, or null until it opens. */
export function useDemo(): Demo | null {
  const { status } = useLedgerContext()
  return status.status === 'ready' ? status.demo : null
}

function noSubscription(): () => void {
  return () => undefined
}

/**
 * The latest snapshot as `viewer` sees it, re-rendering on every ledger close, decrypt and
 * action. Null while the demo loads.
 */
export function useSnapshot(viewer: Viewer): Snapshot | null {
  const demo = useDemo()
  const subscribe = useCallback(
    (listener: () => void) => (demo === null ? noSubscription() : demo.subscribe(listener)),
    [demo],
  )
  return useSyncExternalStore(subscribe, () => (demo === null ? null : demo.snapshot(viewer)))
}
