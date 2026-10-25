import type { ReactNode } from 'react'
import './00-flow-map.css'
import { RoleIcon } from '#web/Role.tsx'
import { StepNav } from '#web/StepNav.tsx'
import { flowMap } from '#web/screens/00-flow-map.model.ts'
import type { Exposure } from '#web/screens/00-flow-map.model.ts'

const EXPOSURE_TEXT: Readonly<Record<Exposure, string>> = {
  encrypted: 'Encrypted amounts',
  public: 'Public on ledger',
  readOnly: 'Read-only view, no transaction',
}

const EXPOSURE_PATHS: Readonly<Record<Exposure, ReactNode>> = {
  encrypted: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  public: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  readOnly: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>
  ),
}

/** Legend icon; named when `label` is set, decorative otherwise. */
function ExposureIcon({
  exposure,
  size,
  label,
}: {
  exposure: Exposure
  size: number
  label?: string
}) {
  return (
    <svg
      className="flow-exposure"
      data-exposure={exposure}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(label === undefined ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}
    >
      {EXPOSURE_PATHS[exposure]}
    </svg>
  )
}

const LANE_ROW_OFFSET = 2

function Board() {
  const { lanes, phases, cards } = flowMap()
  return (
    <div className="flow-board">
      {phases.map(({ phase, first, last }) => (
        <div
          key={phase}
          className="flow-phase"
          style={{ gridColumn: `${first + 1} / ${last + 2}` }}
        >
          {phase}
        </div>
      ))}
      {lanes.map((lane, i) => (
        <div
          key={lane.role}
          className="flow-lane"
          data-shaded={i % 2 === 1 || undefined}
          data-last={i === lanes.length - 1 || undefined}
          style={{ gridRow: i + 1 + LANE_ROW_OFFSET }}
        >
          <span className="flow-lane-title">
            <RoleIcon role={lane.role} size={24} stroke={2.5} />
            {lane.title}
          </span>
          <span className="flow-lane-members">{lane.members}</span>
        </div>
      ))}
      {cards.map((card) => (
        <a
          key={card.step}
          className="flow-card"
          href={card.href}
          style={{
            gridColumn: card.step + 1,
            gridRow: `${card.row.start + LANE_ROW_OFFSET} / span ${card.row.span}`,
          }}
        >
          <span className="flow-card-number">
            {card.label}
            <ExposureIcon exposure={card.exposure} size={14} label={EXPOSURE_TEXT[card.exposure]} />
          </span>
          <span className="flow-card-title">{card.title}</span>
          <span className="flow-card-transactions">{card.transactions}</span>
        </a>
      ))}
    </div>
  )
}

/** Screen 0: the flow map, and the entry point from the brand link. */
export function FlowMap() {
  const exposures = Object.keys(EXPOSURE_TEXT) as Exposure[]
  return (
    <div className="page">
      <StepNav step={0} />
      <main className="flow">
        <div className="flow-head">
          <h1 className="flow-title">Demo user flow: ten screens, two loans</h1>
          <ul className="flow-legend" aria-label="Legend">
            {exposures.map((exposure) => (
              <li key={exposure}>
                <ExposureIcon exposure={exposure} size={16} />
                {EXPOSURE_TEXT[exposure]}
              </li>
            ))}
          </ul>
        </div>
        <div className="flow-scroll">
          <Board />
        </div>
      </main>
    </div>
  )
}
