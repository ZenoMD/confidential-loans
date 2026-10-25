import { Marked } from 'marked'
import type { Token, Tokens } from 'marked'

/** A `##` or `###` heading, as the table of contents lists it. */
export interface SpecHeading {
  readonly id: string
  /** The heading without its markdown, e.g. `4. Ledger Entry: LoanBroker`. */
  readonly text: string
  readonly depth: 2 | 3
}

export interface Spec {
  /** The `#` heading. */
  readonly title: string
  /** The preamble's fields that have a value, in order, e.g. `['status', 'Draft']`. */
  readonly meta: ReadonlyArray<readonly [string, string]>
  /** The body after the preamble and the title. */
  readonly html: string
  readonly toc: readonly SpecHeading[]
}

const PREAMBLE = /^\s*<pre>\n([\s\S]*?)\n<\/pre>/
const FIELD = /^\s*([\w-]+):\s*(.*?)\s*$/

function preamble(markdown: string): { meta: [string, string][]; body: string } {
  const match = PREAMBLE.exec(markdown)
  if (match === null) return { meta: [], body: markdown }
  const meta: [string, string][] = []
  for (const line of (match[1] ?? '').split('\n')) {
    const field = FIELD.exec(line)
    if (field?.[1] !== undefined && field[2] !== undefined && field[2] !== '') {
      meta.push([field[1], field[2]])
    }
  }
  return { meta, body: markdown.slice(match[0].length) }
}

/** GitHub's heading anchor: `A.1. \`LoanSet\` Context Hash` becomes `a1-loanset-context-hash`. */
function slug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-')
}

function plain(text: string): string {
  return text.replaceAll('`', '')
}

/**
 * Renders a spec written in the XLS format: a `<pre>` preamble of `key: value` lines, a `#`
 * title, then `##` sections. Headings get GitHub's anchors, so the spec's own `#section` links
 * keep working once `href` maps them onto the app's routes.
 *
 * Args:
 *   markdown: The spec's source, trusted: raw HTML in it passes through.
 *   href: The link for a heading anchor.
 *
 * Returns:
 *   The title, the preamble fields, the body as HTML and its table of contents.
 */
export function renderSpec(markdown: string, href: (id: string) => string): Spec {
  const { meta, body } = preamble(markdown)
  const marked = new Marked()
  const tokens = marked.lexer(body)
  const titleAt = tokens.findIndex((t) => t.type === 'heading' && t.depth === 1)
  const title = titleAt === -1 ? '' : plain((tokens[titleAt] as Tokens.Heading).text)
  if (titleAt !== -1) tokens.splice(titleAt, 1)

  const ids = new Map<Token, string>()
  const seen = new Map<string, number>()
  const toc: SpecHeading[] = []
  marked.walkTokens(tokens, (token) => {
    if (token.type === 'link' && token.href.startsWith('#')) token.href = href(token.href.slice(1))
    if (token.type !== 'heading') return
    const base = slug(plain(token.text))
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    const id = count === 0 ? base : `${base}-${count}`
    ids.set(token, id)
    if (token.depth === 2 || token.depth === 3) {
      toc.push({ id, text: plain(token.text), depth: token.depth })
    }
  })

  marked.use({
    renderer: {
      // Each heading ends in a `#` link to itself, to copy a section's address from.
      heading(token) {
        const id = ids.get(token) ?? ''
        const inner = this.parser.parseInline(token.tokens)
        const anchor = `<a class="spec-anchor" href="${href(id)}" aria-label="Link to this section">#</a>`
        return `<h${token.depth} id="${id}">${inner} ${anchor}</h${token.depth}>\n`
      },
    },
  })
  return { title, meta, html: marked.parser(tokens), toc }
}

/** Splits an XLS `author` field, `Name <email>, Name <email>`, into its authors. */
export function authors(field: string): { readonly name: string; readonly email?: string }[] {
  return field.split(',').map((author) => {
    const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(author)
    return match?.[1] === undefined || match[2] === undefined
      ? { name: author.trim() }
      : { name: match[1], email: match[2] }
  })
}
