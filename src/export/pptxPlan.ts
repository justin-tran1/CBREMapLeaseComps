import type { ChartId } from '../lib/dashboardModel'
import { chartIdOf, type ExportInput, type ExportTable } from './input'

/**
 * The slides a deck will have, in order, decided before PowerPoint's library loads.
 *
 * One chart to a slide, because a deck is assembled slide by slide and a chart that has a slide
 * to itself can be lifted into another deck whole.
 */

// ------------------------------------------------------------------- table

/** Slide geometry the table is fitted to, in inches. */
export const TABLE_X = 0.6
export const TABLE_WIDTH = 13.333 - TABLE_X * 2
export const TABLE_TOP = 1.55
/** The footer rule sits at 6.86 inches; the table stops short of it. */
export const TABLE_BOTTOM = 6.7
const CELL_MARGIN_X = 0.06
const CELL_MARGIN_Y = 0.03
const MIN_ROW = 0.3
const LINE_FACTOR = 1.24
/** Short columns are kept on one line. Wider than this, a column takes its share and wraps. */
const RIGID_MAX = 1.3
const FONT_SIZES = [10, 9, 8, 7]

export interface PptxTableLayout {
  fontSize: number
  /** Column widths in inches, summing to the table width. */
  colW: number[]
  headHeight: number
  rowHeights: number[]
  /** Row indexes on each slide, in order. */
  slides: number[][]
  /**
   * Every cell's text, row by row, as the slide prints it: the column's own formatting, with a
   * value too long for any slide cut short at an ellipsis.
   */
  cells: string[][]
}

/**
 * A character's advance as a share of the font size, by class. Calibre is narrower than this, but a
 * deck travels: opened where Calibre is not installed, PowerPoint substitutes a wider face. These
 * widths keep a date or an ID on one line in Arial and Inter as well. Capitals and figures are
 * measured wider than lowercase, so "CMP-481061" gets the room it needs without every name
 * claiming the same.
 */
function charEm(ch: string): number {
  if (ch === ' ') return 0.3
  if (ch >= 'A' && ch <= 'Z') return ch === 'I' ? 0.34 : ch === 'M' || ch === 'W' ? 0.92 : 0.72
  if (ch >= '0' && ch <= '9') return 0.63
  if (ch >= 'a' && ch <= 'z') return 'fijlrt'.includes(ch) ? 0.36 : ch === 'm' || ch === 'w' ? 0.88 : 0.58
  if ('.,:;\'|!'.includes(ch)) return 0.3
  if ('-/()'.includes(ch)) return 0.4
  return 0.65
}

/** The widest character, an M or a W: no column is narrower than one of them and its margins. */
const WIDEST_EM = 0.92

/** Header cells are set in bold, which runs wider than the regular weight. */
const BOLD_FACTOR = 1.1

const inches = (ems: number, fontSize: number) => (ems * fontSize) / 72

function emsOf(text: string): number {
  let ems = 0
  for (const ch of text) ems += charEm(ch)
  return ems
}

function longestWordEms(text: string): number {
  let max = 0
  for (const word of text.split(/\s+/)) max = Math.max(max, emsOf(word))
  return max
}

/**
 * Lines a cell's text wraps to, the way a slide wraps it: whole words per line, and a word too
 * wide for the cell started on a line of its own and broken between characters.
 */
export function linesIn(text: string, width: number, fontSize: number, bold = false): number {
  const weight = bold ? BOLD_FACTOR : 1
  // Measured exactly as the column widths are, with a hair of tolerance, so a value that sets a
  // column's width fits it rather than losing a rounding error.
  const usable = Math.max(0.01, width - CELL_MARGIN_X * 2) + 1e-9
  const space = inches(charEm(' ') * weight, fontSize)
  let lines = 1
  let line = 0
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const w = inches(emsOf(word) * weight, fontSize)
    if (w <= usable) {
      const next = line === 0 ? w : line + space + w
      if (next <= usable) {
        line = next
      } else {
        lines++
        line = w
      }
      continue
    }
    if (line > 0) lines++
    line = 0
    for (const ch of word) {
      const c = inches(charEm(ch) * weight, fontSize)
      if (line > 0 && line + c > usable) {
        lines++
        line = c
      } else {
        line += c
      }
    }
  }
  return lines
}

function rowHeight(lines: number, fontSize: number): number {
  return Math.max(MIN_ROW, (lines * fontSize * LINE_FACTOR) / 72 + CELL_MARGIN_Y * 2 + 0.04)
}

/** The most lines a body row can hold and still fit on a slide under the header. */
function maxLinesUnder(headHeight: number, fontSize: number): number {
  const room = TABLE_BOTTOM - TABLE_TOP - headHeight - CELL_MARGIN_Y * 2 - 0.04
  return Math.max(1, Math.floor((room * 72) / (fontSize * LINE_FACTOR)))
}

/** A value cut at an ellipsis to fit in so many lines, by whole characters. */
function clip(text: string, width: number, fontSize: number, maxLines: number): string {
  const chars = Array.from(text)
  const cut = (n: number) => `${chars.slice(0, n).join('').trimEnd()}…`
  let lo = 0
  let hi = chars.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (linesIn(cut(mid), width, fontSize) <= maxLines) lo = mid
    else hi = mid - 1
  }
  return cut(lo)
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)

/**
 * Column widths at one font size, from each column's widest value and longest word in ems, or
 * null when the columns cannot fit without breaking words or wrapping a short column.
 *
 * A short column (a date, an ID, a figure) gets the width its longest entry needs and never
 * wraps. The rest start at the width of their longest word, so a name wraps between words but
 * never through one, and then share whatever is left in proportion to how much more they want.
 */
function fitColumns(naturalEms: number[], minimumEms: number[], fontSize: number): number[] | null {
  const pad = CELL_MARGIN_X * 2
  const natural = naturalEms.map((ems) => inches(ems, fontSize) + pad)
  const minimum = minimumEms.map((ems) => inches(ems, fontSize) + pad)
  const rigid = natural.map((w) => w <= RIGID_MAX)
  const floor = natural.map((w, i) => (rigid[i] ? w : minimum[i]))
  const floorTotal = sum(floor)
  if (floorTotal > TABLE_WIDTH) return null

  const naturalTotal = sum(natural)
  if (naturalTotal <= TABLE_WIDTH) {
    // Everything fits on one line: spread the spare width evenly.
    const spare = (TABLE_WIDTH - naturalTotal) / natural.length
    return natural.map((w) => w + spare)
  }

  // The long columns share the room above their floors in proportion to what they still want.
  const spare = TABLE_WIDTH - floorTotal
  const wants = natural.map((w, i) => (rigid[i] ? 0 : w - floor[i]))
  const wantTotal = sum(wants)
  return floor.map((w, i) => (wantTotal > 0 ? w + (wants[i] / wantTotal) * spare : w + spare / floor.length))
}

/** What one cell, or the header, needs of its column's width, and how much it counts. */
type Need = [width: number, weight: number]

/**
 * Take `excess` inches out of the columns a step at a time, each step where it costs the fewest
 * cells per inch: narrowing a column below a width costs every cell that needs that width.
 * No column goes below its floor. Returns what could not be taken.
 */
function shave(widths: number[], needs: Array<Need[] | null>, floors: number[], excess: number): number {
  const steps = needs.map((list, i) => {
    if (!list) return []
    const weightAt = new Map<number, number>()
    for (const [need, weight] of list) {
      if (need > floors[i] && need <= widths[i]) weightAt.set(need, (weightAt.get(need) ?? 0) + weight)
    }
    const values = [...weightAt.keys()].sort((a, b) => b - a)
    // Going below a width costs the cells that need it; the step stops at the next width down.
    return values.map((value, k) => ({ to: k + 1 < values.length ? values[k + 1] : floors[i], cost: weightAt.get(value) ?? 0 }))
  })
  const at = steps.map(() => 0)

  while (excess > 1e-9) {
    let best = -1
    let bestRate = Infinity
    steps.forEach((list, i) => {
      const step = list[at[i]]
      if (!step) return
      const rate = step.cost / Math.min(widths[i] - step.to, excess)
      if (rate < bestRate) {
        bestRate = rate
        best = i
      }
    })
    if (best < 0) break
    const step = steps[best][at[best]]
    const freed = widths[best] - step.to
    if (freed <= excess) {
      widths[best] = step.to
      excess -= freed
      at[best]++
    } else {
      widths[best] -= excess
      excess = 0
    }
  }
  return excess
}

/**
 * Widths for a table too wide to keep every short column on one line, even at the smallest size.
 *
 * Width comes out of the short columns first, which then wrap between words, and only after that
 * out of the longest words, which break. Each step goes where it touches the fewest cells, so one
 * long name breaks before every comp ID does. A header counts once for each slide it repeats on
 * when it wraps, and more than a whole column of cells when a word in it would break. No column
 * goes narrower than one wide character and its margins.
 */
function relaxColumns(header: string[], cells: string[][], fontSize: number): number[] {
  const pad = CELL_MARGIN_X * 2
  const least = pad + inches(WIDEST_EM, fontSize)
  const width = (ems: number) => inches(ems, fontSize) + pad
  // A header that wraps does so on every slide; one broken through a word is the last resort.
  const headerWraps = Math.max(1, Math.ceil(cells.length / 14))
  const headerBreaks = cells.length + headerWraps

  const columns = header.map((h, i) => {
    const line: Need[] = [[width(emsOf(h) * BOLD_FACTOR), headerWraps]]
    const word: Need[] = [[width(longestWordEms(h) * BOLD_FACTOR), headerBreaks]]
    let natural = line[0][0]
    let minimum = word[0][0]
    for (const row of cells) {
      const l = width(emsOf(row[i]))
      const w = width(longestWordEms(row[i]))
      line.push([l, 1])
      word.push([w, 1])
      natural = Math.max(natural, l)
      minimum = Math.max(minimum, w)
    }
    return { line, word, natural, minimum: Math.max(least, minimum) }
  })
  const rigid = columns.map((c) => c.natural <= RIGID_MAX)
  const widths = columns.map((c, i) => (rigid[i] ? Math.max(c.natural, c.minimum) : c.minimum))

  let excess = sum(widths) - TABLE_WIDTH
  excess = shave(widths, columns.map((c, i) => (rigid[i] ? c.line : null)), columns.map((c) => c.minimum), excess)
  if (excess > 1e-9) excess = shave(widths, columns.map((c) => c.word), columns.map(() => least), excess)
  if (excess > 1e-9) {
    const total = sum(widths)
    return widths.map((w) => (w / total) * TABLE_WIDTH)
  }
  return widths
}

/**
 * Fit the table's columns to their content, then split its rows across slides by height.
 *
 * The largest font at which no word has to break and every short column keeps one line is used.
 * At the smallest size, a table that still does not fit wraps its short columns, then breaks its
 * longest words. Rows are then dealt onto slides until the next one would cross the footer, so a
 * row that wraps to three lines cannot push the table off the bottom of its slide, and a value
 * too long for any slide is cut at an ellipsis.
 */
export function layoutPptxTable(table: ExportTable): PptxTableLayout {
  const header = table.columns.map((c) => c.label)
  const cells = table.rows.map((deal) => table.columns.map((c) => c.render(deal)))

  // Widths scale with the font size, so each column is measured once, in ems. A loop rather than
  // a spread, so a long table cannot overflow the stack.
  const widest = (measure: (text: string) => number) =>
    header.map((h, i) => {
      let max = measure(h) * BOLD_FACTOR
      for (const row of cells) max = Math.max(max, measure(row[i]))
      return max
    })
  const naturalEms = widest(emsOf)
  const minimumEms = widest(longestWordEms)

  const smallest = FONT_SIZES[FONT_SIZES.length - 1]
  for (const fontSize of FONT_SIZES) {
    let colW = fitColumns(naturalEms, minimumEms, fontSize)
    if (!colW) {
      if (fontSize !== smallest) continue
      colW = relaxColumns(header, cells, fontSize)
    }

    const headHeight = rowHeight(Math.max(...header.map((h, i) => linesIn(h, colW[i], fontSize, true))), fontSize)
    const maxLines = maxLinesUnder(headHeight, fontSize)
    const rowHeights = cells.map((row) => {
      let lines = 1
      row.forEach((cell, i) => {
        let n = linesIn(cell, colW[i], fontSize)
        if (n > maxLines) {
          row[i] = clip(cell, colW[i], fontSize, maxLines)
          n = linesIn(row[i], colW[i], fontSize)
        }
        lines = Math.max(lines, n)
      })
      return rowHeight(lines, fontSize)
    })

    const budget = TABLE_BOTTOM - TABLE_TOP - headHeight
    const slides: number[][] = []
    let current: number[] = []
    let used = 0
    rowHeights.forEach((h, index) => {
      if (current.length > 0 && used + h > budget) {
        slides.push(current)
        current = []
        used = 0
      }
      current.push(index)
      used += h
    })
    if (current.length) slides.push(current)

    return { fontSize, colW, headHeight, rowHeights, slides, cells }
  }

  // Unreachable: the smallest size always fits.
  throw new Error('The table could not be laid out.')
}

// ------------------------------------------------------------------ slides

export type SlidePlan =
  | { kind: 'title' }
  | { kind: 'summary' }
  | { kind: 'kpis'; set: 'headline' | 'signing' }
  | { kind: 'chart'; chartId: ChartId }
  | { kind: 'coverage' }
  | { kind: 'table'; rows: number[]; part: number; parts: number; layout: PptxTableLayout }

const SIGNED: ChartId[] = ['signedByPeriod', 'signingLag']

export function planSlides(input: ExportInput): SlidePlan[] {
  const selected = new Set(input.sections)
  const charts = input.sections.map(chartIdOf).filter((id): id is ChartId => !!id)
  const slides: SlidePlan[] = [{ kind: 'title' }]

  if (selected.has('summary')) slides.push({ kind: 'summary' })
  if (selected.has('kpis')) slides.push({ kind: 'kpis', set: 'headline' })
  for (const chartId of charts.filter((id) => !SIGNED.includes(id))) slides.push({ kind: 'chart', chartId })
  if (selected.has('signedKpis')) slides.push({ kind: 'kpis', set: 'signing' })
  for (const chartId of charts.filter((id) => SIGNED.includes(id))) slides.push({ kind: 'chart', chartId })
  if (selected.has('coverage')) slides.push({ kind: 'coverage' })

  if (input.table && input.table.rows.length > 0) {
    const layout = layoutPptxTable(input.table)
    layout.slides.forEach((rows, i) => {
      slides.push({ kind: 'table', rows, part: i + 1, parts: layout.slides.length, layout })
    })
  }

  return slides
}
