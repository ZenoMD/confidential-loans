import { useId } from 'react'
import type { ReactNode } from 'react'
import './Value.css'
import { useDecrypting } from './lens.tsx'
import { PrivacyIcon } from './PrivacyIcon.tsx'
import { PUBLIC, valueView } from './value.ts'
import type { Privacy } from './value.ts'
import type { Seen } from '@confidential-loans/core/demo-ledger'

/**
 * A labelled value with its privacy icon. Hover or focus shows who can read it. An empty or missing
 * label is not rendered.
 */
function Labelled({
  label,
  privacy,
  children,
}: {
  label: string | undefined
  privacy: Privacy
  children: ReactNode
}) {
  const noteId = useId()
  return (
    <span className="value" tabIndex={0} aria-describedby={noteId}>
      {label !== undefined && label !== '' && <span className="value-label">{label}</span>}
      <span className="value-line">
        <PrivacyIcon kind={privacy.icon} />
        {children}
      </span>
      <span id={noteId} role="tooltip" className="value-note">
        {privacy.note}
      </span>
    </span>
  )
}

/**
 * One amount, styled by who can see it. The polite live region announces the amount when a
 * pending decrypt resolves.
 */
export function Value({ label, shown: seen }: { label?: string; shown: Seen }) {
  const replaying = useDecrypting() && seen.visibility === 'decrypted'
  const shown: Seen = replaying ? { visibility: 'pending', readers: seen.readers ?? [] } : seen
  const view = valueView(shown)
  return (
    <Labelled label={label} privacy={view}>
      <span aria-live="polite" aria-busy={shown.visibility === 'pending'}>
        {view.kind === 'amount' && (
          <span className="value-amount" data-tone={view.tone}>
            {view.text}
          </span>
        )}
        {view.kind === 'redacted' && (
          <span className="value-bar" role="img" aria-label="Encrypted amount" />
        )}
      </span>
    </Labelled>
  )
}

/** A public fact that is not an amount, such as a share count or a due date. */
export function FactValue({ label, text }: { label: string; text: string }) {
  return (
    <Labelled label={label} privacy={PUBLIC}>
      <span className="value-amount">{text}</span>
    </Labelled>
  )
}
