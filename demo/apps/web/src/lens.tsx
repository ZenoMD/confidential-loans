import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Snapshot, Viewer } from '@confidential-loans/core/demo-ledger'
import { useSnapshot } from './ledger.tsx'

interface Lens {
  /** Every tab shows what anyone reading the ledger sees, instead of what its actor sees. */
  readonly publicView: boolean
  readonly setPublicView: (publicView: boolean) => void
}

const Context = createContext<Lens | null>(null)

/** Holds the Public ledger lens for every tab. Mount it once, inside `<LedgerProvider>`. */
export function LensProvider({ children }: { children: ReactNode }) {
  const [publicView, setPublicView] = useState(false)
  const value = useMemo(() => ({ publicView, setPublicView }), [publicView])
  return <Context value={value}>{children}</Context>
}

export function useLens(): Lens {
  const lens = useContext(Context)
  if (lens === null) throw new Error('Wrap the app in <LensProvider>')
  return lens
}

/** The snapshot a tab renders: its actor's, or an outsider's under the Public ledger lens. */
export function useViewSnapshot(viewer: Viewer): Snapshot | null {
  const { publicView } = useLens()
  return useSnapshot(publicView ? 'outsider' : viewer)
}

const DECRYPT_MS = 600

const Decrypting = createContext(false)

/**
 * Shows decrypted amounts as decrypting for a moment whenever `view` changes, such as a tab or
 * account switch, so each switch reads as the new viewer decrypting with their own key.
 */
export function DecryptOnSwitch({ view, children }: { view: string; children: ReactNode }) {
  const [shown, setShown] = useState(view)
  useEffect(() => {
    const timer = setTimeout(() => setShown(view), DECRYPT_MS)
    return () => clearTimeout(timer)
  }, [view])
  return <Decrypting value={shown !== view}>{children}</Decrypting>
}

/** True while a switch replays the decrypt. */
export function useDecrypting(): boolean {
  return useContext(Decrypting)
}
