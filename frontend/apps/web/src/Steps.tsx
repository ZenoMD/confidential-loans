import type { CSSProperties } from 'react'
import './Steps.css'

export interface StepsItem {
  readonly label: string
  readonly note: string
  readonly state: 'done' | 'current' | 'todo'
}

/** The progress row of a multi-transaction screen: one bar, name and note per transaction. */
export function Steps({ items }: { items: readonly StepsItem[] }) {
  const columns = { '--steps-columns': items.length } as CSSProperties
  return (
    <ol className="steps" style={columns}>
      {items.map((item) => (
        <li key={item.label} className="steps-item">
          <span className="steps-bar" data-state={item.state} aria-hidden="true" />
          <span className="steps-label">{item.label}</span>
          <span className="steps-note">{item.note}</span>
        </li>
      ))}
    </ol>
  )
}
