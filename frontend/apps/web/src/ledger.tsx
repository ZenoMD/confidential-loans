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
import { forgetKit, readKit, saveKit } from './kit-store.ts'
import type { KitStorage, StoredKit } from './kit-store.ts'

/** Where the demo is: no usable kit yet, connecting, failed to open, or running. */
export type LedgerStatus =
  | { readonly status: 'noKit' }
  | { readonly status: 'badKit'; readonly error: string }
  | { readonly status: 'connecting' }
  | { readonly status: 'failed'; readonly error: string }
  | { readonly status: 'ready'; readonly demo: Demo }

interface LedgerContext {
  readonly status: LedgerStatus
  readonly stored: StoredKit
  /** Validates and stores pasted kit text, then reconnects. Throws what `parseKit` throws. */
  readonly save: (text: string) => void
  readonly forget: () => void
}

const Context = createContext<LedgerContext | null>(null)

function sessionStore(): KitStorage {
  return window.sessionStorage
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

interface Opened {
  readonly ledger: Ledger
  readonly demo: Demo
}

async function open(kit: Kit): Promise<Opened> {
  const ledger = await connectLedger()
  try {
    return { ledger, demo: await openDemo(kit, ledger) }
  } catch (error) {
    await ledger.close()
    throw error
  }
}

function close({ ledger, demo }: Opened): void {
  demo.close()
  void ledger.close()
}

type Result = { readonly status: 'failed'; readonly error: string } | Opened

interface Outcome {
  readonly kit: Kit
  readonly result: Result
}

function statusOf(stored: StoredKit, outcome: Outcome | undefined): LedgerStatus {
  if (stored.status === 'missing') return { status: 'noKit' }
  if (stored.status === 'invalid') return { status: 'badKit', error: stored.error }
  if (outcome?.kit !== stored.kit) return { status: 'connecting' }
  if ('demo' in outcome.result) return { status: 'ready', demo: outcome.result.demo }
  return outcome.result
}

/**
 * Opens the demo on the devnet for the kit in this tab's `sessionStorage`, and reopens it when
 * the kit changes. Mount it once, around the app.
 */
export function LedgerProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState(() => readKit(sessionStore))
  const [outcome, setOutcome] = useState<Outcome>()

  useEffect(() => {
    if (stored.status !== 'ready') return
    const { kit } = stored
    let active = true
    const opening = open(kit)
    opening.then(
      (opened) => {
        if (active) setOutcome({ kit, result: opened })
      },
      (error: unknown) => {
        if (active) setOutcome({ kit, result: { status: 'failed', error: describe(error) } })
      },
    )
    return () => {
      active = false
      // A failed open has nothing to close and was reported above.
      opening.then(close, () => undefined)
    }
  }, [stored])

  const save = useCallback((text: string) => setStored(saveKit(sessionStore, text)), [])
  const forget = useCallback(() => setStored(forgetKit(sessionStore)), [])
  const value = useMemo(
    () => ({ status: statusOf(stored, outcome), stored, save, forget }),
    [stored, outcome, save, forget],
  )
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

/** The stored kit and the functions that replace or remove it, for the kit page. */
export function useKit(): Pick<LedgerContext, 'stored' | 'save' | 'forget'> {
  const { stored, save, forget } = useLedgerContext()
  return { stored, save, forget }
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
