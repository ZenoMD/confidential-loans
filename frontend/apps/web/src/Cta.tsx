import { useRef, useState } from 'react'
import './Cta.css'
import { gate } from '@confidential-loans/core/demo-ledger'
import type { Action } from '@confidential-loans/core/demo-ledger'
import { actionKey, ctaView, failureText } from './cta.ts'
import { useDemo, useSnapshot } from './ledger.tsx'

/**
 * The primary button that runs one demo action, with its pending, failed, gated and
 * missing-prerequisite states. Screens submit only through it.
 */
export function Cta({ action, label }: { action: Action; label: string }) {
  const demo = useDemo()
  const snapshot = useSnapshot('outsider')
  const [failure, setFailure] = useState<{ key: string; text: string }>()
  const running = useRef(false)
  const key = actionKey(action)
  const view = ctaView({
    label,
    action,
    gate: snapshot === null ? undefined : gate(snapshot, action),
    submitting: snapshot?.submitting,
    failure: failure?.key === key ? failure.text : undefined,
  })

  const run = (): void => {
    if (demo === null || running.current) return
    running.current = true
    setFailure(undefined)
    demo
      .act(action)
      .catch((error: unknown) => setFailure({ key, text: failureText(error) }))
      .finally(() => {
        running.current = false
      })
  }

  const { line } = view
  return (
    <div className="cta">
      <button type="button" className="cta-button" disabled={view.disabled} onClick={run}>
        {view.text}
      </button>
      {line?.kind === 'alert' && (
        <p className="cta-line" data-kind="alert" role="alert">
          {line.text}
        </p>
      )}
      {line?.kind === 'note' && <p className="cta-line">{line.text}</p>}
      {line?.kind === 'link' && (
        <p className="cta-line">
          <a href={line.href}>{line.text}</a>
        </p>
      )}
    </div>
  )
}
