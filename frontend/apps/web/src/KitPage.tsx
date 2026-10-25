import { useState } from 'react'
import type { FormEvent } from 'react'
import './Cta.css'
import './KitPage.css'
import './Page.css'
import { useKit, useLedgerStatus } from './ledger.tsx'
import type { LedgerStatus } from './ledger.tsx'
import { screenHref } from './route.ts'
import { StepNav } from './StepNav.tsx'

const STATUS_TEXT: Readonly<Record<LedgerStatus['status'], string>> = {
  noKit: '',
  badKit: '',
  connecting: 'Reading the ledger.',
  failed: 'The demo did not open.',
  ready: 'The demo is open on the devnet.',
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** The unlisted `#/kit` page: paste the exported kit into this tab's session storage. */
export function KitPage() {
  const { stored, save, forget } = useKit()
  const status = useLedgerStatus()
  const [text, setText] = useState('')
  const [error, setError] = useState<string>()

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    try {
      save(text)
      setText('')
      setError(undefined)
    } catch (caught) {
      setError(describe(caught))
    }
  }

  return (
    <div className="page">
      <StepNav step={0} />
      <div className="page-body">
        <main className="page-main kit">
          <h1 className="kit-title">Demo kit</h1>
          <p className="kit-text">
            Paste the JSON that <code>node scripts/export-kit.ts</code> prints. It holds the demo
            seeds and stays in this tab&apos;s session storage only.
          </p>
          {stored.status === 'ready' && (
            <div className="kit-loaded" role="status">
              <p className="kit-text">
                Kit loaded for vault <code>{stored.kit.vaultID}</code>. {STATUS_TEXT[status.status]}
              </p>
              {status.status === 'failed' && (
                <p className="kit-text" data-kind="alert" role="alert">
                  {status.error}
                </p>
              )}
              <div className="kit-actions">
                <a className="kit-secondary" href={screenHref(0)}>
                  Open the flow map
                </a>
                <button type="button" className="kit-secondary" onClick={forget}>
                  Forget the kit
                </button>
              </div>
            </div>
          )}
          {stored.status === 'invalid' && (
            <p className="kit-text" data-kind="alert" role="alert">
              The stored kit is unusable: {stored.error}
            </p>
          )}
          <form className="kit-form" onSubmit={submit}>
            <label className="kit-label" htmlFor="kit-json">
              Kit JSON
            </label>
            <textarea
              id="kit-json"
              className="kit-input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              spellCheck={false}
              autoComplete="off"
              required
            />
            {error !== undefined && (
              <p className="kit-text" data-kind="alert" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="cta-button">
              Load the kit
            </button>
          </form>
        </main>
      </div>
    </div>
  )
}
