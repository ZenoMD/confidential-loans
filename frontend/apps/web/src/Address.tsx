import './Address.css'
import { accountLink } from '@confidential-loans/core/network'

/** A classic address that opens its account in the explorer, in a new tab. */
export function Address({ address }: { address: string }) {
  return (
    <a
      className="address"
      href={accountLink(address)}
      target="_blank"
      rel="noreferrer"
      title="Open in the explorer"
    >
      {address}
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M4 2h6v6M10 2L3 9" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </a>
  )
}
