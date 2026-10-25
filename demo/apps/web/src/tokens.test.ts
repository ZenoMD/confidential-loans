import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

type Rgb = readonly [number, number, number]

const css = readFileSync(new URL('tokens.css', import.meta.url), 'utf8')

function token(name: string): string {
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(css)
  if (match?.[1] === undefined) throw new Error(`tokens.css defines no --${name}`)
  return match[1].trim()
}

/** Parses #rrggbb or rgba(r, g, b, a), compositing alpha over `under`. */
function color(value: string, under: Rgb = [0, 0, 0]): Rgb {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value)
  if (hex !== null) return [1, 2, 3].map((i) => parseInt(hex[i] ?? '', 16)) as unknown as Rgb
  const rgba = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(value)
  if (rgba === null) throw new Error(`Cannot parse color ${value}`)
  const alpha = Number(rgba[4])
  return [0, 1, 2].map(
    (i) => Number(rgba[i + 1]) * alpha + (under[i] ?? 0) * (1 - alpha),
  ) as unknown as Rgb
}

function luminance(rgb: Rgb): number {
  const [r = 0, g = 0, b = 0] = rgb.map((c) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(text: string, background: string): number {
  const bg = color(token(background))
  const [hi, lo] = [luminance(color(token(text), bg)), luminance(bg)].sort((a, b) => b - a)
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)
}

describe('tokens.css', () => {
  const pairs = [
    ['ink', 'canvas'],
    ['mute', 'canvas'],
    ['dim', 'canvas'],
    ['key', 'canvas'],
    ['loss', 'canvas'],
    ['stone', 'canvas'],
    ['stone', 'surface-deep'],
    ['ink', 'surface-elevated'],
    ['mute', 'surface-elevated'],
    ['stone', 'surface-elevated'],
  ] as const

  for (const [text, background] of pairs) {
    it(`gives --${text} text on --${background} a contrast of at least 4.5:1`, () => {
      assert.ok(contrast(text, background) >= 4.5, `${contrast(text, background).toFixed(2)}:1`)
    })
  }
})
