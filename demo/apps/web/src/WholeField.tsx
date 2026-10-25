import type { ReactNode } from 'react'

interface WholeFieldProps {
  readonly id: string
  readonly label: string
  /** `$` before an amount, `%` after a rate, which also takes decimals, nothing for a count. */
  readonly unit: '$' | '%' | ''
  readonly text: string
  readonly onChange: (typed: string) => void
  /** Controls beside the field, such as a Max button. */
  readonly children?: ReactNode
}

/** A labelled number input on an underline: whole, except a `%` rate. */
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
            inputMode={unit === '%' ? 'decimal' : 'numeric'}
            autoComplete="off"
            value={text}
            onChange={(event) => onChange(event.target.value)}
            className="field-input"
          />
          {unit === '%' && (
            <span aria-hidden="true" className="field-unit">
              %
            </span>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}
