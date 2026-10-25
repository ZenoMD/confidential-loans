import { useState } from 'react'
import { DEMO_AMOUNTS } from '@confidential-loans/core/demo-ledger'
import type { Depositor } from '@confidential-loans/core/demo-ledger'
import { Cta } from '#web/Cta.tsx'
import { useViewSnapshot } from '#web/lens.tsx'
import { NAMES } from '#web/names.ts'
import { Page } from '#web/Page.tsx'
import { Role } from '#web/Role.tsx'
import { Stats } from '#web/Stats.tsx'
import { Toggle } from '#web/Toggle.tsx'
import { WholeField } from '#web/WholeField.tsx'
import { depositorTab } from '#web/tabs/depositor.model.ts'

interface DepositorTabProps {
  readonly depositor: Depositor
  readonly onDepositor: (depositor: Depositor) => void
}

/** The depositors: their holdings and the vault, with deposit and redeem. */
export function DepositorTab({ depositor, onDepositor }: DepositorTabProps) {
  const [amount, setAmount] = useState(String(DEMO_AMOUNTS.deposit))
  const snapshot = useViewSnapshot(depositor)
  const m = snapshot === null ? null : depositorTab(snapshot, depositor, amount)
  const aside = (
    <>
      <Role
        role="depositor"
        who={NAMES[depositor]}
        action="Deposits into the vault"
        address={snapshot?.addresses[depositor]}
      />
      <Toggle
        label="Depositor"
        options={[
          { value: 'depositorA', label: NAMES.depositorA },
          { value: 'depositorB', label: NAMES.depositorB },
        ]}
        selected={depositor}
        onSelect={onDepositor}
      />
    </>
  )
  return (
    <Page tab="depositor" aside={aside}>
      {m !== null && (
        <>
          <section className="section" aria-labelledby="holdings">
            <h2 id="holdings" className="section-heading">
              Holdings
            </h2>
            <Stats amounts={m.holdings.amounts} facts={m.holdings.facts} />
          </section>
          <section className="section" aria-labelledby="deposit">
            <h2 id="deposit" className="section-heading">
              Deposit
            </h2>
            <WholeField
              id="deposit-amount"
              label="Deposit amount"
              unit="$"
              text={m.deposit.text}
              onChange={setAmount}
            >
              <button type="button" className="pill" onClick={() => setAmount(m.deposit.max)}>
                Max
              </button>
            </WholeField>
            <Cta action={m.deposit.action} label={m.deposit.label} />
          </section>
          <section className="section" aria-labelledby="redeem">
            <h2 id="redeem" className="section-heading">
              Redeem
            </h2>
            <Cta action={m.redeem.action} label={m.redeem.label} />
          </section>
          <section className="section" aria-labelledby="vault">
            <h2 id="vault" className="section-heading">
              Vault
            </h2>
            <Stats amounts={m.vault} />
          </section>
        </>
      )}
    </Page>
  )
}
