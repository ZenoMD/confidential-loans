import { useState } from 'react'
import type { Borrower } from '@confidential-loans/core/demo-ledger'
import { Cta } from '#web/Cta.tsx'
import { useSnapshot } from '#web/ledger.tsx'
import { useViewSnapshot } from '#web/lens.tsx'
import { LoanCard } from '#web/LoanCard.tsx'
import { Modal } from '#web/Modal.tsx'
import { NAMES } from '#web/names.ts'
import { Page } from '#web/Page.tsx'
import { Role } from '#web/Role.tsx'
import { Stats } from '#web/Stats.tsx'
import { Toggle } from '#web/Toggle.tsx'
import { WholeField } from '#web/WholeField.tsx'
import { borrowerTab, repayDialog } from '#web/tabs/borrower.model.ts'
import type { RepayModel } from '#web/tabs/borrower.model.ts'

interface BorrowerTabProps {
  readonly borrower: Borrower
  readonly onBorrower: (borrower: Borrower) => void
}

/** A regular payment of a chosen amount, in a dialog. The payment landing closes it. */
function RepayDialog({
  m,
  onType,
  onClose,
}: {
  m: RepayModel
  onType: (typed: string) => void
  onClose: () => void
}) {
  return (
    <Modal labelledBy="repay" onClose={onClose}>
      <h2 id="repay" className="section-heading">
        {m.title}
      </h2>
      <Stats amounts={m.terms} />
      <WholeField
        id="repay-amount"
        label="Repayment amount"
        unit="$"
        text={m.text}
        onChange={onType}
      />
      <div className="actions">
        <Cta action={m.action} label={m.label} invalid={m.invalid} />
        <button type="button" className="pill" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  )
}

/** The borrowers: their confidential balance, the offer to co-sign, and their loans. */
export function BorrowerTab({ borrower, onBorrower }: BorrowerTabProps) {
  const snapshot = useViewSnapshot(borrower)
  // The dialog reads the terms with the borrower's key even under the Public ledger lens: the
  // borrower decrypts them to pay.
  const own = useSnapshot(borrower)
  const [repaying, setRepaying] = useState<{ loanID: string; version: string } | null>(null)
  const [typed, setTyped] = useState<string | undefined>(undefined)
  const m = snapshot === null ? null : borrowerTab(snapshot, borrower)
  const dialog =
    repaying === null || own === null ? undefined : repayDialog(own, repaying.loanID, typed)
  const open = (loanID: string): void => {
    const version = own === null ? undefined : repayDialog(own, loanID, undefined)?.version
    if (version === undefined) return
    setTyped(undefined)
    setRepaying({ loanID, version })
  }
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
                <Cta
                  action={loan.repay.action}
                  label={loan.repay.label}
                  small
                  onOpen={() => open(loan.loanID)}
                />
                <Cta action={loan.full.action} label={loan.full.label} small />
              </LoanCard>
            ))}
          </section>
          {dialog !== undefined && dialog.version === repaying?.version && (
            <RepayDialog m={dialog} onType={setTyped} onClose={() => setRepaying(null)} />
          )}
        </>
      )}
    </Page>
  )
}
