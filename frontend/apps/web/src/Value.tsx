import './Value.css'
import { valueView } from './value.ts'
import type { Shown } from './value.ts'

/** One amount, styled by who can see it. An empty or missing label is not rendered. */
export function Value({ label, shown }: { label?: string; shown: Shown }) {
  const view = valueView(shown)
  return (
    <span className="value">
      {label !== undefined && label !== '' && <span className="value-label">{label}</span>}
      {view.kind === 'amount' && (
        <span className="value-amount" data-tone={view.tone}>
          {view.text}
        </span>
      )}
      {view.kind === 'redacted' && (
        <span className="value-bar" role="img" aria-label="Encrypted amount" />
      )}
      {view.kind === 'pending' && (
        <span className="value-bar" data-pending role="img" aria-label="Decrypting amount" />
      )}
    </span>
  )
}
