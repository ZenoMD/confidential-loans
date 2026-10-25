import './Value.css'
import { valueView } from './value.ts'
import type { Shown } from '@confidential-loans/core/amount'

/**
 * One amount, styled by who can see it. An empty or missing label is not rendered.
 * The polite live region announces the amount when a pending decrypt resolves.
 */
export function Value({ label, shown }: { label?: string; shown: Shown }) {
  const view = valueView(shown)
  return (
    <span className="value" aria-live="polite" aria-busy={shown.visibility === 'pending'}>
      {label !== undefined && label !== '' && <span className="value-label">{label}</span>}
      {view.kind === 'amount' && (
        <span className="value-amount" data-tone={view.tone}>
          {view.text}
        </span>
      )}
      {view.kind === 'redacted' && (
        <span className="value-bar" role="img" aria-label="Encrypted amount" />
      )}
    </span>
  )
}
