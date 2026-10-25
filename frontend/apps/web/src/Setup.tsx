import { useState } from 'react'
import './Cta.css'
import { DEFAULT_DURATIONS } from '@confidential-loans/core/deploy'
import { txLink } from '@confidential-loans/core/network'
import { useSetup } from './ledger.tsx'
import { DurationField } from './DurationField.tsx'
import { Modal } from './Modal.tsx'
import { inputOf } from './duration.ts'
import { durationsOf, stageRows } from './setup.ts'
import type { DurationInputs, StageRow } from './setup.ts'
import { shortHash } from './toast.ts'

const INTRO =
  'Deploys the demo to the devnet: funded accounts, the confidential token, starting balances ' +
  ', the Vault, and the LoanBroker'

const MARKS: Readonly<Record<StageRow['state'], string>> = {
  done: 'Done',
  running: 'Running',
  failed: 'Failed',
  todo: 'Waiting',
}

/**
 * The modal dialog that deploys the demo, with the vault durations and progress. It shades and
 * blocks the page, and Escape does not close it: the tabs need a deployment.
 */
export function Setup({ note }: { note: string | undefined }) {
  const { progress, saved, transactions, initialize } = useSetup()
  const [inputs, setInputs] = useState<DurationInputs>({
    subscription: inputOf(DEFAULT_DURATIONS.subscription),
    investment: inputOf(DEFAULT_DURATIONS.investment),
  })
  const { durations, problem } = durationsOf(inputs)
  const busy = progress.running !== undefined
  return (
    <Modal labelledBy="setup">
      <h2 id="setup" className="section-heading">
        Initialize demo
      </h2>
      <p className="section-note">{INTRO}</p>
      {note !== undefined && <p className="section-note">{note}</p>}
      <div className="fields">
        <DurationField
          id="subscription"
          label="Vault Deposit Period"
          value={inputs.subscription}
          onChange={(subscription) => setInputs({ ...inputs, subscription })}
        />
        <DurationField
          id="investment"
          label="Vault Lending Period"
          value={inputs.investment}
          onChange={(investment) => setInputs({ ...inputs, investment })}
        />
      </div>
      <div className="actions">
        <div className="cta">
          <button
            type="button"
            className="cta-button"
            disabled={busy || problem !== undefined}
            onClick={() => initialize(durations)}
          >
            {busy ? 'Deploying' : progress.failure === undefined ? 'Initialize demo' : 'Retry'}
          </button>
          {problem !== undefined && <p className="cta-line">{problem}</p>}
        </div>
      </div>
      {progress.stages.length > 0 && (
        <ol className="stages">
          {stageRows(progress).map((row) => (
            <li key={row.stage} className="stage" data-state={row.state}>
              <span className="stage-mark">{MARKS[row.state]}</span>
              {row.label}
            </li>
          ))}
        </ol>
      )}
      {transactions.length > 0 && (
        <ol className="tx-list" aria-label="Transactions">
          {transactions.map(({ type, hash }) => (
            <li key={hash}>
              <a href={txLink(hash)} target="_blank" rel="noreferrer">
                <span className="tx-type">{type}</span>
                <span className="tx-hash">{shortHash(hash)}</span>
              </a>
            </li>
          ))}
        </ol>
      )}
      {progress.failure !== undefined && (
        <p className="cta-line" data-kind="alert" role="alert">
          {progress.failure.error}
        </p>
      )}
      {!saved && (
        <p className="section-note" role="alert">
          This browser blocks storage, so the deployment lasts only until a reload.
        </p>
      )}
    </Modal>
  )
}
