import type { Borrower } from '@confidential-loans/core/demo-ledger'
import { Cta } from '#web/Cta.tsx'
import { useViewSnapshot } from '#web/lens.tsx'
import { LoanCard } from '#web/LoanCard.tsx'
import { NAMES } from '#web/names.ts'
import { Page } from '#web/Page.tsx'
import { Role } from '#web/Role.tsx'
import { Stats } from '#web/Stats.tsx'
import { Toggle } from '#web/Toggle.tsx'
import { borrowerTab } from '#web/tabs/borrower.model.ts'

interface BorrowerTabProps {
  readonly borrower: Borrower
  readonly onBorrower: (borrower: Borrower) => void
}

/** The borrowers: their confidential balance, the offer to co-sign, and their loans. */
export function BorrowerTab({ borrower, onBorrower }: BorrowerTabProps) {
  const snapshot = useViewSnapshot(borrower)
  const m = snapshot === null ? null : borrowerTab(snapshot, borrower)
  const aside = (
    <>
      <Role
        role="borrower"
        who={NAMES[borrower]}
        action="Borrows and repays confidentially"
        address={snapshot?.addresses[borrower]}
      />
      <Toggle
        label="Borrower"
        options={[
          { value: 'borrowerA', label: NAMES.borrowerA },
          { value: 'borrowerB', label: NAMES.borrowerB },
        ]}
        selected={borrower}
        onSelect={onBorrower}
      />
    </>
  )
  return (
    <Page tab="borrower" aside={aside}>
      {m !== null && (
        <>
          <section className="section" aria-labelledby="balance">
            <h2 id="balance" className="section-heading">
              Confidential balance
            </h2>
            <Stats amounts={m.balances} />
            <Cta action={m.merge.action} label={m.merge.label} small />
          </section>
          {m.offer !== undefined && (
            <section className="section" aria-labelledby="offer">
              <h2 id="offer" className="section-heading">
                Offer from the Broker
              </h2>
              <Stats amounts={m.offer.amounts} facts={m.offer.facts} />
              <Cta action={m.offer.cosign.action} label={m.offer.cosign.label} />
            </section>
          )}
          <section className="section" aria-labelledby="loans">
            <h2 id="loans" className="section-heading">
              Loans
            </h2>
            {m.loans.length === 0 && <p className="section-note">No loans yet.</p>}
            {m.loans.map((loan) => (
              <LoanCard key={loan.loanID} card={loan}>
                <Cta action={loan.installment.action} label={loan.installment.label} small />
                <Cta action={loan.full.action} label={loan.full.label} small />
              </LoanCard>
            ))}
          </section>
        </>
      )}
    </Page>
  )
}
