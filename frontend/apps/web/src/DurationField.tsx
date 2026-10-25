import { parseWhole } from './value.ts'
import { UNITS } from './duration.ts'
import type { DurationInput, Unit } from './duration.ts'

interface DurationFieldProps {
  readonly id: string
  readonly label: string
  readonly value: DurationInput
  readonly onChange: (value: DurationInput) => void
}

/** A labelled duration: a whole amount and its unit, on one underline. */
export function DurationField({ id, label, value, onChange }: DurationFieldProps) {
  return (
    <div className="field">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className="field-line">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={parseWhole(value.amount).text}
          onChange={(event) => onChange({ ...value, amount: event.target.value })}
          className="field-input"
        />
        <select
          aria-label={`${label} unit`}
          value={value.unit}
          onChange={(event) => onChange({ ...value, unit: event.target.value as Unit })}
          className="field-unit-select"
        >
          {UNITS.map(({ unit, label: name }) => (
            <option key={unit} value={unit}>
              {name}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
