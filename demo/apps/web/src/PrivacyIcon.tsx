import type { PrivacyIcon as Kind } from './value.ts'

const PATHS: Readonly<Record<Kind, string>> = {
  // A globe: anyone can read it.
  public:
    'M8 1.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13M1.5 8h13M8 1.5c2 2 2 11 0 13M8 1.5c-2 2-2 11 0 13',
  // An open lock: encrypted, and this viewer holds a key.
  decrypted: 'M3.5 7.5h9v7h-9zM5.5 7.5V5a2.5 2.5 0 0 1 5-.5',
  // A closed lock: encrypted, and this viewer holds no key.
  locked: 'M3.5 7.5h9v7h-9zM5.5 7.5V5a2.5 2.5 0 0 1 5 0v2.5',
}

/** The icon that says whether a value is public, decrypted with the viewer's key, or locked. */
export function PrivacyIcon({ kind }: { kind: Kind }) {
  return (
    <svg
      className="privacy-icon"
      data-kind={kind}
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[kind]} />
    </svg>
  )
}
