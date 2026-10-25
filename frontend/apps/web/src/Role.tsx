import type { ReactNode } from 'react'
import './Role.css'

export type RoleKind = 'broker' | 'depositor' | 'borrower'

const ICON_PATHS: Readonly<Record<RoleKind, ReactNode>> = {
  broker: (
    <>
      <path d="M6 18L24 7l18 11H6z" />
      <path d="M8 21h32M12 21v13M20 21v13M28 21v13M36 21v13M8 37h32M6 41h36" />
    </>
  ),
  depositor: (
    <>
      <rect x="4" y="20" width="32" height="18" rx="2" />
      <circle cx="20" cy="29" r="4" />
      <path d="M8 16h32v18M12 12h32v18" />
    </>
  ),
  borrower: (
    <>
      <path d="M6 16l4-8h28l4 8" />
      <path d="M6 16q4.5 6 9 0q4.5 6 9 0q4.5 6 9 0q4.5 6 9 0" />
      <path d="M10 21v20M38 21v20M8 41h32M10 31h28" />
      <circle cx="17" cy="28" r="3" />
      <circle cx="24" cy="28" r="3" />
      <circle cx="31" cy="28" r="3" />
    </>
  ),
}

/** Decorative role icon in the current text color. */
export function RoleIcon({ role, size, stroke }: { role: RoleKind; size: number; stroke: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[role]}
    </svg>
  )
}

/** Who acts on the screen: icon, name as the page heading, and what they do. */
export function Role({ role, who, action }: { role: RoleKind; who: string; action: string }) {
  return (
    <div className="role">
      <RoleIcon role={role} size={64} stroke={1.5} />
      <div className="role-text">
        <h1 className="role-who">{who}</h1>
        <p className="role-action">{action}</p>
      </div>
    </div>
  )
}
