import type { ReactNode } from 'react'

interface WholeFieldProps {
  readonly id: string
  readonly label: string
  /** `$` before an amount, `s` after a duration, nothing for a count. */
  readonly unit: '$' | 's' | ''
  readonly text: string
  readonly onChange: (typed: string) => void
  /** Controls beside the field, such as a Max button. */
  readonly children?: ReactNode
}

/** A labelled whole-number input on an underline. */
export function WholeField({ id, label, unit, text, onChange, children }: WholeFieldProps) {
  return (
    <div className="field">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className="field-row">
        <div className="field-line">
          {unit === '$' && (
            <span aria-hidden="true" className="field-unit">
              $
            </span>
          )}
          <input
            id={id}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={text}
            onChange={(event) => onChange(event.target.value)}
            className="field-input"
          />
          {unit === 's' && (
            <span aria-hidden="true" className="field-unit">
              s
            </span>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}
