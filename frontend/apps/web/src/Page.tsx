import type { ReactNode } from 'react'
import './Page.css'
import type { Step } from './route.ts'
import { StepNav } from './StepNav.tsx'

interface PageProps {
  readonly step: Step
  /** The role column: a Role, plus a Toggle on some screens. */
  readonly aside?: ReactNode
  readonly children?: ReactNode
}

/** A step screen: step navigation, then the main column with the role column on its right. */
export function Page({ step, aside, children }: PageProps) {
  return (
    <div className="page">
      <StepNav step={step} />
      <div className="page-body">
        {aside !== undefined && (
          <aside className="page-aside" aria-label="Role">
            {aside}
          </aside>
        )}
        <main className="page-main">{children}</main>
      </div>
    </div>
  )
}
