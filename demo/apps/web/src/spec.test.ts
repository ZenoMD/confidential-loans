import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { authors, renderSpec } from './spec.ts'

const href = (id: string) => `#/spec/${id}`

const SAMPLE = `<pre>
  xls: XLS-00XX
  title: Sample
  status: Draft
  created:
</pre>

# Sample Spec

## 1. Abstract

See [A.1](#a1-loanset-context-hash) and [XLS-96](https://example.com/#x).

## Appendix A: Context Hashes

### A.1. \`LoanSet\` Context Hash

### A.1. \`LoanSet\` Context Hash
`

describe('renderSpec', () => {
  it('reads the preamble fields that have a value', () => {
    assert.deepEqual(renderSpec(SAMPLE, href).meta, [
      ['xls', 'XLS-00XX'],
      ['title', 'Sample'],
      ['status', 'Draft'],
    ])
  })

  it('takes the title out of the body', () => {
    const spec = renderSpec(SAMPLE, href)
    assert.equal(spec.title, 'Sample Spec')
    assert.doesNotMatch(spec.html, /<h1|<pre>/)
  })

  it('lists the sections with GitHub anchors, numbering repeats', () => {
    assert.deepEqual(renderSpec(SAMPLE, href).toc, [
      { id: '1-abstract', text: '1. Abstract', depth: 2 },
      { id: 'appendix-a-context-hashes', text: 'Appendix A: Context Hashes', depth: 2 },
      { id: 'a1-loanset-context-hash', text: 'A.1. LoanSet Context Hash', depth: 3 },
      { id: 'a1-loanset-context-hash-1', text: 'A.1. LoanSet Context Hash', depth: 3 },
    ])
  })

  it('gives headings their anchors and a link to themselves', () => {
    const { html } = renderSpec(SAMPLE, href)
    assert.match(
      html,
      /<h3 id="a1-loanset-context-hash">A\.1\. <code>LoanSet<\/code> Context Hash <a class="spec-anchor" href="#\/spec\/a1-loanset-context-hash"/,
    )
  })

  it('routes in-page links, leaving others', () => {
    const { html } = renderSpec(SAMPLE, href)
    assert.match(html, /<a href="#\/spec\/a1-loanset-context-hash">A\.1<\/a>/)
    assert.match(html, /<a href="https:\/\/example\.com\/#x">/)
  })

  it('resolves every in-page link of SPEC.md to a heading', () => {
    const markdown = readFileSync(new URL('../../../../SPEC.md', import.meta.url), 'utf8')
    const spec = renderSpec(markdown, href)
    const ids = new Set(spec.toc.map((heading) => heading.id))
    const links = [...spec.html.matchAll(/href="#\/spec\/([^"]+)"/g)].map((m) => m[1] ?? '')
    assert.ok(links.length > 0)
    for (const link of links) assert.ok(ids.has(link), link)
  })
})

describe('authors', () => {
  it('splits names from emails', () => {
    assert.deepEqual(authors('Ann Lee <ann@x.org>, Bo <bo@y.org>, Cy'), [
      { name: 'Ann Lee', email: 'ann@x.org' },
      { name: 'Bo', email: 'bo@y.org' },
      { name: 'Cy' },
    ])
  })
})
