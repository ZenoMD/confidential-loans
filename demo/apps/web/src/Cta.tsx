import { useRef, useState } from 'react'
import './Cta.css'
import { gate } from '@confidential-loans/core/demo-ledger'
import type { Action } from '@confidential-loans/core/demo-ledger'
import { actionKey, ctaView, failureText } from './cta.ts'
import { useDemo, useSnapshot } from './ledger.tsx'
import { failureToast, successToast } from './toast.ts'
import { useToast } from './Toasts.tsx'

interface CtaProps {
  readonly action: Action
  readonly label: string
  readonly small?: boolean
  /** Why the form's input cannot be sent, when the gate cannot tell without a decrypt. */
  readonly invalid?: string | undefined
  /** Opens a form for the action instead of running it; the button still shows its gate. */
  readonly onOpen?: () => void
}

/**
 * The primary button that runs one demo action, with its pending, failed, gated and
 * blocked states. Tabs submit only through it.
 */
export function Cta({ action, label, small, invalid, onOpen }: CtaProps) {
  const demo = useDemo()
  const notify = useToast()
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
    invalid,
  })

  const run = (): void => {
    if (onOpen !== undefined) {
      onOpen()
      return
    }
    if (demo === null || running.current) return
    running.current = true
    setFailure(undefined)
    demo
      .act(action)
      .then((hash) => {
        const toast = successToast(action, hash)
        if (toast !== undefined) notify(toast)
      })
      .catch((error: unknown) => {
        setFailure({ key, text: failureText(error) })
        const toast = failureToast(action, error)
        if (toast !== undefined) notify(toast)
      })
      .finally(() => {
        running.current = false
      })
  }

  const { line } = view
  return (
    <div className="cta" data-size={small === true ? 'small' : undefined}>
      <button type="button" className="cta-button" disabled={view.disabled} onClick={run}>
        {view.text}
      </button>
      {line?.kind === 'alert' && (
        <p className="cta-line" data-kind="alert" role="alert">
          {line.text}
        </p>
      )}
      {line?.kind === 'note' && <p className="cta-line">{line.text}</p>}
    </div>
  )
}
