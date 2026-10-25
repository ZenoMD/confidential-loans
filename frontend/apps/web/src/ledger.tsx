import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type { ReactNode } from 'react'
import { deploy, STAGES } from '@confidential-loans/core/deploy'
import type { DeployHooks, Durations } from '@confidential-loans/core/deploy'
import { openDemo } from '@confidential-loans/core/demo-ledger'
import type { Demo, Snapshot, Viewer } from '@confidential-loans/core/demo-ledger'
import { kitOf, newDeployment } from '@confidential-loans/core/kit'
import type { Deployment } from '@confidential-loans/core/kit'
import { connectLedger } from '@confidential-loans/core/network'
import type { Ledger } from '@confidential-loans/core/network'
import { clearDeployment, loadDeployment, saveDeployment } from './deployment-store.ts'
import { fail, finish, IDLE, startStage } from './setup.ts'
import type { Progress } from './setup.ts'

/** Where the demo is: connecting, failed to connect, waiting for a setup, or running. */
export type LedgerStatus =
  | { readonly status: 'connecting' }
  | { readonly status: 'failed'; readonly error: string }
  | {
      readonly status: 'setup'
      /** Why the saved deployment could not be opened, if one was. */
      readonly note: string | undefined
    }
  | { readonly status: 'ready'; readonly demo: Demo }

/** A transaction the deployment submitted and the ledger validated. */
export interface SentTransaction {
  readonly type: string
  readonly hash: string
}

export interface SetupControls {
  readonly progress: Progress
  /** False when the browser refused to save the deployment: it lasts only until a reload. */
  readonly saved: boolean
  /** The deployment's validated transactions so far, oldest first. */
  readonly transactions: readonly SentTransaction[]
  /** Deploys whatever the ledger lacks, then opens the demo. */
  readonly initialize: (durations: Durations) => void
  /**
   * Closes the run and erases the saved deployment, so the next `initialize` deploys fresh
   * accounts. What the old accounts hold stays on the ledger, unreachable.
   */
  readonly clearData: () => void
}

interface LedgerContext extends SetupControls {
  readonly status: LedgerStatus
}

/** The connection and what runs on it, outliving renders. */
interface Session {
  ledger: Ledger | undefined
  deployment: Deployment | undefined
  demo: Demo | undefined
  busy: boolean
  closed: boolean
}

const Context = createContext<LedgerContext | null>(null)

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function browserStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

/** Opens the demo on the deployment's run, or says why it cannot. */
async function openRun(session: Session, ledger: Ledger): Promise<Demo> {
  const kit = session.deployment === undefined ? undefined : kitOf(session.deployment)
  if (kit === undefined) throw new Error('The deployment has no token or vault')
  return openDemo(kit, ledger)
}

/**
 * Connects to the devnet and opens the demo on the deployment this browser saved. Without one, or
 * when the ledger no longer holds it, the app waits for `initialize`. Mount it once, around the app.
 */
export function LedgerProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<LedgerStatus>({ status: 'connecting' })
  const [progress, setProgress] = useState<Progress>(IDLE)
  const [saved, setSaved] = useState(true)
  const [transactions, setTransactions] = useState<readonly SentTransaction[]>([])
  const sessionRef = useRef<Session | null>(null)

  useEffect(() => {
    const session: Session = {
      ledger: undefined,
      deployment: undefined,
      demo: undefined,
      busy: false,
      closed: false,
    }
    sessionRef.current = session
    const setup = (note?: string) => setStatus({ status: 'setup', note })
    void (async () => {
      let ledger: Ledger
      try {
        ledger = await connectLedger()
      } catch (error) {
        if (!session.closed) setStatus({ status: 'failed', error: describe(error) })
        return
      }
      if (session.closed) return void ledger.close()
      session.ledger = ledger
      session.deployment = loadDeployment(browserStorage())
      if (session.deployment === undefined || kitOf(session.deployment) === undefined)
        return setup()
      try {
        const demo = await openRun(session, ledger)
        if (session.closed) return demo.close()
        session.demo = demo
        setStatus({ status: 'ready', demo })
      } catch (error) {
        if (session.closed) return
        setup(`The saved deployment could not be opened: ${describe(error)}.`)
      }
    })()
    return () => {
      session.closed = true
      session.demo?.close()
      void session.ledger?.close()
    }
  }, [])

  const initialize = useCallback((durations: Durations) => {
    const session = sessionRef.current
    const ledger = session?.ledger
    if (session === null || ledger === undefined || session.busy) return
    session.busy = true
    session.demo?.close()
    session.demo = undefined
    setStatus({ status: 'setup', note: undefined })
    let current: Progress = { ...IDLE, stages: STAGES }
    const update = (next: Progress) => {
      current = next
      setProgress(next)
    }
    update(current)
    setTransactions([])
    const store = (deployment: Deployment) => {
      session.deployment = deployment
      setSaved(saveDeployment(browserStorage(), deployment))
    }
    // Saved before anything is funded, so a reload mid-way reuses the same accounts.
    const deployment = session.deployment ?? newDeployment()
    store(deployment)
    const hooks: DeployHooks = {
      onStage: (stage) => update(startStage(current, stage)),
      onSave: store,
      onTransaction: (type, hash) => setTransactions((sent) => [...sent, { type, hash }]),
    }
    deploy(ledger.client, deployment, durations, hooks)
      .then(async () => {
        const demo = await openRun(session, ledger)
        if (session.closed) return demo.close()
        session.demo = demo
        update(finish(current))
        setStatus({ status: 'ready', demo })
      })
      .catch((error: unknown) => {
        if (!session.closed) update(fail(current, describe(error)))
      })
      .finally(() => {
        session.busy = false
      })
  }, [])

  const clearData = useCallback(() => {
    const session = sessionRef.current
    if (session === null || session.busy) return
    session.demo?.close()
    session.demo = undefined
    session.deployment = undefined
    clearDeployment(browserStorage())
    setProgress(IDLE)
    setTransactions([])
    setSaved(true)
    setStatus({ status: 'setup', note: undefined })
  }, [])

  const value = useMemo(
    () => ({ status, progress, saved, transactions, initialize, clearData }),
    [status, progress, saved, transactions, initialize, clearData],
  )
  return <Context value={value}>{children}</Context>
}

function useLedgerContext(): LedgerContext {
  const context = useContext(Context)
  if (context === null) throw new Error('Wrap the app in <LedgerProvider>')
  return context
}

/** The demo's status, for the loading and failure lines and the setup screen. */
export function useLedgerStatus(): LedgerStatus {
  return useLedgerContext().status
}

/** The setup progress and the buttons that start a deployment or a new run. */
export function useSetup(): SetupControls {
  return useLedgerContext()
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
