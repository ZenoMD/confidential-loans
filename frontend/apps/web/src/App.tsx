import { useEffect, useState } from 'react'
import { NETWORK_WSS, connectLedger, readServerStatus } from '@confidential-loans/core/network'
import type { ServerStatus } from '@confidential-loans/core/network'

type Status =
  | { kind: 'loading' }
  | { kind: 'ok'; server: ServerStatus }
  | { kind: 'error'; message: string }

export function App() {
  const [status, setStatus] = useState<Status>({ kind: 'loading' })

  useEffect(() => {
    let active = true
    const opening = connectLedger()
    opening
      .then((ledger) => readServerStatus(ledger.client))
      .then(
        (server) => active && setStatus({ kind: 'ok', server }),
        (error: unknown) => active && setStatus({ kind: 'error', message: String(error) }),
      )
    return () => {
      active = false
      opening
        .then(
          (ledger) => ledger.close(),
          () => undefined,
        )
        .catch((error: unknown) => console.error('Closing the ledger connection failed', error))
    }
  }, [])

  return (
    <main>
      <h1>Confidential Loans</h1>
      <p>Network: {NETWORK_WSS}</p>
      {status.kind === 'loading' && <p>Connecting...</p>}
      {status.kind === 'error' && <p role="alert">Connection failed: {status.message}</p>}
      {status.kind === 'ok' && (
        <p>
          rippled {status.server.buildVersion}, network {status.server.networkId}, validated ledger{' '}
          {status.server.validatedLedger}
        </p>
      )}
    </main>
  )
}
