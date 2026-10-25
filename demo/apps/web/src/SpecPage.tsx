import { useEffect, useRef, useState } from 'react'
import markdown from '../../../../SPEC.md?raw'
import './Page.css'
import './Tab.css'
import './Spec.css'
import { specHref, tabHref } from './route.ts'
import { authors, renderSpec } from './spec.ts'
import type { SpecHeading } from './spec.ts'

const spec = renderSpec(markdown, specHref)
const meta = new Map(spec.meta)

/** The preamble fields the page heading already shows. */
const IN_HEADING = new Set(['xls', 'title', 'description', 'status'])

/** Each `##` with the `###` under it. */
const SECTIONS = spec.toc.reduce<{ heading: SpecHeading; children: SpecHeading[] }[]>(
  (sections, heading) => {
    const last = sections.at(-1)
    if (heading.depth === 3 && last !== undefined) last.children.push(heading)
    else sections.push({ heading, children: [] })
    return sections
  },
  [],
)

/** How far below the top of the window a heading counts as the one being read. */
const READING_LINE = 96

/** The last heading above the reading line, as the window scrolls. */
function useReading(): string | undefined {
  const [reading, setReading] = useState<string | undefined>(undefined)
  useEffect(() => {
    const headings = spec.toc.flatMap(({ id }) => document.getElementById(id) ?? [])
    const onScroll = () => {
      let current: string | undefined
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top > READING_LINE) break
        current = heading.id
      }
      setReading(current)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return reading
}

function TocLink({ heading, reading }: { heading: SpecHeading; reading: string | undefined }) {
  return (
    <a href={specHref(heading.id)} aria-current={heading.id === reading ? 'location' : undefined}>
      {heading.text}
    </a>
  )
}

function MetaValue({ field, value }: { field: string; value: string }) {
  if (field === 'author') {
    return authors(value).map(({ name, email }, i) => (
      <span key={name}>
        {i > 0 && ', '}
        {email === undefined ? name : <a href={`mailto:${email}`}>{name}</a>}
      </span>
    ))
  }
  return value.startsWith('https://') ? <a href={value}>{value}</a> : value
}

/**
 * SPEC.md as an XLS page: the preamble as a heading, then the body beside a table of contents
 * that marks the section being read. `#/spec/<anchor>` opens it at that heading.
 */
export function SpecPage({ section }: { section: string | undefined }) {
  const reading = useReading()
  const toc = useRef<HTMLElement>(null)
  useEffect(() => {
    if (section === undefined) window.scrollTo(0, 0)
    else document.getElementById(section)?.scrollIntoView()
  }, [section])
  // Where the contents scroll beside the body, keep the section being read in sight. The sticky
  // contents are the links' offset parent.
  useEffect(() => {
    const list = toc.current
    const link = list?.querySelector<HTMLElement>('[aria-current="location"]')
    if (list == null || link == null || list.scrollHeight <= list.clientHeight) return
    const above = link.offsetTop < list.scrollTop
    const below = link.offsetTop + link.offsetHeight > list.scrollTop + list.clientHeight
    if (above || below) list.scrollTop = link.offsetTop - list.clientHeight / 3
  }, [reading])
  const status = meta.get('status')
  return (
    <div className="page">
      <header className="page-header spec-header">
        <div className="page-top">
          <a className="page-brand" href={tabHref('depositor')}>
            Zeno Confidential Loans
          </a>
          <a className="pill" href={tabHref('depositor')}>
            Open the demo
          </a>
        </div>
      </header>
      <div className="spec">
        <header className="spec-head">
          <div className="spec-badges">
            {meta.has('xls') && <span className="spec-number">{meta.get('xls')}</span>}
            {status !== undefined && <span className="spec-status">{status}</span>}
          </div>
          <h1>{spec.title}</h1>
          {meta.has('description') && <p className="spec-lede">{meta.get('description')}</p>}
          <dl className="spec-meta">
            {spec.meta
              .filter(([field]) => !IN_HEADING.has(field))
              .map(([field, value]) => (
                <div key={field}>
                  <dt>{field.replaceAll('-', ' ')}</dt>
                  <dd>
                    <MetaValue field={field} value={value} />
                  </dd>
                </div>
              ))}
          </dl>
        </header>
        <nav className="spec-toc" aria-label="Table of contents" ref={toc}>
          <p className="spec-toc-title">Contents</p>
          <ol>
            {SECTIONS.map(({ heading, children }) => (
              <li key={heading.id}>
                <TocLink heading={heading} reading={reading} />
                {children.length > 0 && (
                  <ol>
                    {children.map((child) => (
                      <li key={child.id}>
                        <TocLink heading={child} reading={reading} />
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ol>
        </nav>
        {/* SPEC.md is this repository's own file, bundled at build time, so its HTML is trusted. */}
        <article className="spec-content" dangerouslySetInnerHTML={{ __html: spec.html }} />
      </div>
    </div>
  )
}
