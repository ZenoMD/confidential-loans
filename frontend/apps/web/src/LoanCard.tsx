import type { ReactNode } from 'react'
import type { LoanCardModel } from './loan.ts'
import { Stats } from './Stats.tsx'

/** One loan: its title, borrower and status, its amounts and schedule, then the tab's actions. */
export function LoanCard({ card, children }: { card: LoanCardModel; children: ReactNode }) {
  return (
    <article className="card" aria-label={card.title}>
      <header className="card-head">
        <h3 className="card-title">{card.title}</h3>
        <span className="card-meta">{card.borrower}</span>
        <span className="card-status" data-troubled={card.troubled}>
          {card.status}
        </span>
      </header>
      <Stats amounts={card.amounts} facts={card.facts} />
      <div className="actions">{children}</div>
    </article>
  )
}
