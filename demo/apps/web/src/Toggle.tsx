import './Toggle.css'

export interface ToggleOption<T extends string> {
  readonly value: T
  readonly label: string
}

interface ToggleProps<T extends string> {
  /** Accessible name of the group, such as "Depositor". */
  readonly label: string
  readonly options: readonly [ToggleOption<T>, ToggleOption<T>]
  readonly selected: T
  readonly onSelect: (value: T) => void
}

/** Two pressed-state buttons; exactly one is pressed. */
export function Toggle<T extends string>({ label, options, selected, onSelect }: ToggleProps<T>) {
  return (
    <div className="toggle" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === selected}
          onClick={() => onSelect(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
