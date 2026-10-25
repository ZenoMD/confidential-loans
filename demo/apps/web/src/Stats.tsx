import type { Fact, LabelledAmount } from './value.ts'
import { FactValue, Value } from './Value.tsx'

/** A wrapping row of labelled amounts, then labelled facts. */
export function Stats({
  amounts = [],
  facts = [],
}: {
  amounts?: readonly LabelledAmount[]
  facts?: readonly Fact[]
}) {
  return (
    <div className="stats">
      {amounts.map(({ label, shown }) => (
        <Value key={label} label={label} shown={shown} />
      ))}
      {facts.map(({ label, text }) => (
        <FactValue key={label} label={label} text={text} />
      ))}
    </div>
  )
}
