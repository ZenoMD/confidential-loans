import './StepNav.css'
import { RoleIcon } from './Role.tsx'
import { screenHref } from './route.ts'
import type { Screen } from './route.ts'
import { stepNav } from './stepNav.ts'

/** Brand link to the flow map, the vault phase, and the ten demo steps. */
export function StepNav({ step }: { step: Screen }) {
  const { items, phase } = stepNav(step)
  return (
    <header className="stepnav">
      <div className="stepnav-top">
        <a className="stepnav-brand" href={screenHref(0)}>
          <span className="stepnav-logo">
            zeno<span className="stepnav-dot">.</span>
          </span>
          <span className="stepnav-product">Confidential Loans</span>
        </a>
        {phase !== undefined && <span className="stepnav-phase">{phase}</span>}
      </div>
      <nav className="stepnav-steps" aria-label="Demo steps">
        <ol>
          {items.map((it) => (
            <li key={it.n}>
              <a
                href={it.href}
                aria-current={it.ariaCurrent}
                aria-label={it.ariaLabel}
                data-state={it.state}
              >
                <span className="stepnav-icons" aria-hidden="true">
                  {it.icons.map((role) => (
                    <RoleIcon key={role} role={role} size={16} stroke={3} />
                  ))}
                </span>
                <span className="stepnav-progress" />
                <span className="stepnav-text">{it.text}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </header>
  )
}
