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

/** Header cells are set in bold, which runs wider than the regular weight. */
const BOLD_FACTOR = 1.1

function textWidth(text: string, fontSize: number, bold = false): number {
  let ems = 0
  for (const ch of text) ems += charEm(ch)
  return (ems * fontSize * (bold ? BOLD_FACTOR : 1)) / 72
}

/** Lines a cell's text wraps to: whole words per line, and a word too wide for the cell broken. */
export function linesIn(text: string, width: number, fontSize: number, bold = false): number {
  const usable = Math.max(0.1, width - CELL_MARGIN_X * 2)
  const space = textWidth(' ', fontSize, bold)
  let lines = 1
  let line = 0
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const w = textWidth(word, fontSize, bold)
    if (w > usable) {
      if (line > 0) lines++
      const pieces = Math.ceil(w / usable)
      lines += pieces - 1
      line = w - (pieces - 1) * usable
      continue
    }
    const next = line === 0 ? w : line + space + w
    if (next <= usable) {
      line = next
    } else {
      lines++
      line = w
    }
  }
  return lines
}

function rowHeight(lines: number, fontSize: number): number {
  return Math.max(MIN_ROW, (lines * fontSize * LINE_FACTOR) / 72 + CELL_MARGIN_Y * 2 + 0.04)
}

function longestWord(text: string, fontSize: number, bold = false): number {
  let max = 0
  for (const word of text.split(/\s+/)) max = Math.max(max, textWidth(word, fontSize, bold))
  return max
}

/**
 * The widest value a column holds, by a measure of each cell, the bold header included. A loop,
 * so a long table cannot overflow the stack.
 */
function widest(header: string, cells: string[][], i: number, measure: (text: string, bold: boolean) => number): number {
  let max = measure(header, true)
  for (const row of cells) max = Math.max(max, measure(row[i], false))
  return max
}

/**
 * Column widths at one font size, or null when the columns cannot fit without breaking words.
 *
 * A short column (a date, an ID, a figure) gets the width its longest entry needs and never
 * wraps. The rest start at the width of their longest word, so a name wraps between words but
 * never through one, and then share whatever is left in proportion to how much more they want.
 */
function fitColumns(header: string[], cells: string[][], fontSize: number): number[] | null {
  const pad = CELL_MARGIN_X * 2
  const natural = header.map((h, i) => widest(h, cells, i, (t, bold) => textWidth(t, fontSize, bold)) + pad)
  const minimum = header.map((h, i) => widest(h, cells, i, (t, bold) => longestWord(t, fontSize, bold)) + pad)
  const rigid = natural.map((w) => w <= RIGID_MAX)
  const floor = natural.map((w, i) => (rigid[i] ? w : minimum[i]))
  const floorTotal = floor.reduce((a, b) => a + b, 0)
  if (floorTotal > TABLE_WIDTH) return null

  const naturalTotal = natural.reduce((a, b) => a + b, 0)
  if (naturalTotal <= TABLE_WIDTH) {
    // Everything fits on one line: spread the spare width evenly.
    const spare = (TABLE_WIDTH - naturalTotal) / natural.length
    return natural.map((w) => w + spare)
  }

  // The long columns share the room above their floors in proportion to what they still want.
  const spare = TABLE_WIDTH - floorTotal
  const wants = natural.map((w, i) => (rigid[i] ? 0 : w - floor[i]))
  const wantTotal = wants.reduce((a, b) => a + b, 0)
  return floor.map((w, i) => (wantTotal > 0 ? w + (wants[i] / wantTotal) * spare : w + spare / floor.length))
}

/**
 * Fit the table's columns to their content, then split its rows across slides by height.
 *
 * The largest font at which no word has to break is used. Rows are then dealt onto slides until
 * the next one would cross the footer, so a row that wraps to three lines cannot push the table
 * off the bottom of its slide.
 */
export function layoutPptxTable(table: ExportTable): PptxTableLayout {
  const header = table.columns.map((c) => c.label)
  const cells = table.rows.map((deal) => table.columns.map((c) => c.render(deal)))

  for (const fontSize of FONT_SIZES) {
    let colW = fitColumns(header, cells, fontSize)
    if (!colW) {
      if (fontSize !== FONT_SIZES[FONT_SIZES.length - 1]) continue
      // Too many columns for any size: share the width by content, and let long words break.
      const natural = header.map((h, i) => widest(h, cells, i, (t, bold) => textWidth(t, fontSize, bold)))
      const total = natural.reduce((a, b) => a + b, 0) || 1
      colW = natural.map((w) => (w / total) * TABLE_WIDTH)
    }
    const widths = colW

    const headHeight = rowHeight(Math.max(...header.map((h, i) => linesIn(h, widths[i], fontSize, true))), fontSize)
    const rowHeights = cells.map((row) => rowHeight(Math.max(...row.map((cell, i) => linesIn(cell, widths[i], fontSize))), fontSize))

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

    return { fontSize, colW: widths, headHeight, rowHeights, slides }
  }

  // Unreachable: the smallest size always returns.
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
