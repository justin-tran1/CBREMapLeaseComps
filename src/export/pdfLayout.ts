import { coverageLead, type ChartId, type ChartSpec } from '../lib/dashboardModel'
import { chartIdOf, generatedLabel, tableHeading, type ExportInput, type ExportTable } from './input'
import metrics from './pdfMetrics.json'
import { pdfSafe } from './text'

/**
 * Where everything goes in the PDF report, worked out before anything is drawn.
 *
 * The planner is pure geometry. It takes a text-measuring function so the export dialog can run
 * it, before the PDF library has loaded, to say how many pages a report will have, and the writer
 * can run it with jsPDF's own measure to place every block. The dialog's measure reads the same
 * font metrics jsPDF does, and the table's rows are paged by the table library's own rules, so the
 * count the dialog shows is the count the file has.
 */

/** US Letter, landscape, in points. A dashboard is wider than it is tall, and so is its table. */
export const PAGE = { width: 792, height: 612 } as const
export const MARGIN_X = 36
export const CONTENT_WIDTH = PAGE.width - MARGIN_X * 2

/** The first page opens with the title block; later pages carry a running header instead. */
export const RUNNING_HEADER_BOTTOM = 52
export const CONTENT_TOP = 62
export const CONTENT_BOTTOM = PAGE.height - 46
export const FOOTER_RULE_Y = PAGE.height - 36
export const FOOTER_TEXT_Y = PAGE.height - 24

export const GUTTER = 16
export const HALF_WIDTH = (CONTENT_WIDTH - GUTTER) / 2

/**
 * Chart plot sizes. A chart is drawn off screen at 4/3 of these in pixels, the screen's ratio.
 * Two rows of half-width charts fill a page after the first, with room for a ranked chart's
 * dozen bars to keep their labels apart.
 */
export const WIDE_CHART_HEIGHT = 190
export const HALF_CHART_HEIGHT = 200
const CHART_TITLE_ROW = 18
const LEGEND_ROW = 14
const BLOCK_GAP = 16

export const KPI_HEIGHT = 58
export const KPI_GAP = 8

export const COVERAGE_COLUMNS = 4
export const COVERAGE_ROW = 15

/** Table metrics, shared by the writer's table and the planner's account of where its rows fall. */
export const TABLE_FONT = 7.5
export const TABLE_PADDING = 3
/** jsPDF's default line height, which the table library sizes rows by. */
const LINE_HEIGHT_FACTOR = 1.15

/** display: titles. body, bodyBold: text. figure: condensed numerals. table: condensed cells. */
export type FontRole = 'display' | 'body' | 'bodyBold' | 'figure' | 'table'

export type Measure = (text: string, role: FontRole, size: number) => number

// ------------------------------------------------------------- metrics

const CHAR_INDEX = new Map(Array.from(metrics.chars, (ch, i) => [ch, i]))
const WIDTHS: Record<FontRole, number[]> = metrics.widths
const KERNING: Partial<Record<FontRole, Record<string, number>>> = metrics.kerning

/** Most cells are plain ASCII, which the PDF fonts draw as is. */
const PLAIN = /^[ -~]*$/

function drawable(text: string): string {
  return PLAIN.test(text) ? text : pdfSafe(text)
}

/** A character's advance in thousandths of an em. Every drawable character is listed. */
function advance(ch: string, role: FontRole): number {
  const i = CHAR_INDEX.get(ch)
  return i === undefined ? WIDTHS[role][CHAR_INDEX.get('?') ?? 0] : WIDTHS[role][i]
}

/**
 * A line's width in points as jsPDF measures it: each character's advance from the font, plus
 * the kerning pairs of the built-in faces. The numbers are read from jsPDF by
 * tools/pdf-metrics.cjs, so this agrees with the writer's own measure without loading jsPDF.
 */
export const metricMeasure: Measure = (text, role, size) => {
  const kerning = KERNING[role]
  let total = 0
  let prior = ''
  for (const ch of drawable(text)) {
    total += advance(ch, role)
    if (kerning && prior) total += kerning[prior + ch] ?? 0
    prior = ch
  }
  return (total * size) / 1000
}

/**
 * How many lines jsPDF's splitTextToSize breaks a cell's text into, which is how the table
 * library wraps it. Words go on a line while they fit; a word wider than the cell is cut into
 * pieces, its first piece hanging on the line before. Only for the condensed face, which has no
 * kerning, so a word measures as the sum of its letters.
 */
export function pdfLineCount(text: string, width: number, role: 'figure' | 'table', size: number): number {
  const max = (width / size) * 1000
  const space = advance(' ', role)
  let lines = 1
  let lineLength = 0
  let separator = 0
  for (const word of drawable(text).split(' ')) {
    const widths = Array.from(word, (ch) => advance(ch, role))
    let wordLength = 0
    for (const w of widths) wordLength += w
    if (lineLength + separator + wordLength <= max) {
      lineLength += separator + wordLength
      separator = space
      continue
    }
    if (wordLength > max) {
      // The piece that fits on the current line stays there, the rest is cut into full lines.
      let i = 0
      let working = 0
      const hanging = max - (lineLength + separator)
      while (i < widths.length && working + widths[i] < hanging) working += widths[i++]
      working = 0
      for (; i < widths.length; i++) {
        if (working + widths[i] > max) {
          lines++
          working = 0
        }
        working += widths[i]
      }
      lines++
      lineLength = working
    } else {
      lines++
      lineLength = wordLength
    }
    separator = space
  }
  return lines
}

/** The cover title, wrapped to at most three lines. The dialog asks for it too: it moves the page breaks. */
export function coverTitleLines(title: string, measure: Measure): string[] {
  return wrapText(title, CONTENT_WIDTH, 'display', 24, measure).slice(0, 3)
}

export function wrapText(text: string, width: number, role: FontRole, size: number, measure: Measure): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (!line || measure(next, role, size) <= width) {
      line = next
    } else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

// ---------------------------------------------------------------- blocks

export interface CoverBlock {
  kind: 'cover'
  y: number
  height: number
  titleLines: string[]
  /** Baseline of the first title line. */
  titleY: number
  selectionY: number
  generated: string
}

export interface SummaryBlock {
  kind: 'summary'
  y: number
  height: number
  rows: Array<{ label: string; lines: string[] }>
}

export interface KpiBlock {
  kind: 'kpis'
  y: number
  height: number
  set: 'headline' | 'signing'
  columns: number
}

export interface ChartBlock {
  kind: 'chart'
  x: number
  y: number
  width: number
  height: number
  chartId: ChartId
  /** The plot itself, below the title row. */
  plotHeight: number
  legend: boolean
  /** Subtitle drawn under the title when the two will not share a line. */
  subtitleBelow: boolean
}

export interface HeadingBlock {
  kind: 'heading'
  y: number
  height: number
  text: string
  noteLines: string[]
}

export interface CoverageBlock {
  kind: 'coverage'
  y: number
  height: number
  subtitleLines: string[]
}

export interface TableHeadBlock {
  kind: 'tableHead'
  y: number
  height: number
  heading: string
  subtitleLines: string[]
}

export type Block = CoverBlock | SummaryBlock | KpiBlock | ChartBlock | HeadingBlock | CoverageBlock | TableHeadBlock

export interface PdfPlan {
  pages: Block[][]
  /** Where the table's first row goes, if there is a table. */
  tableStart: { page: number; y: number } | null
  /** Pages the whole report is expected to run to, the table included. */
  estimatedPages: number
}

// --------------------------------------------------------------- planner

function chartBlockHeight(spec: ChartSpec, wide: boolean): { plot: number; total: number; legend: boolean } {
  const plot = wide ? WIDE_CHART_HEIGHT : HALF_CHART_HEIGHT
  const legend = spec.kind === 'stacked' && spec.stackKeys.length >= 2
  return { plot, legend, total: CHART_TITLE_ROW + plot + (legend ? LEGEND_ROW : 0) + BLOCK_GAP }
}

function subtitleFits(spec: ChartSpec, width: number, measure: Measure): boolean {
  return measure(spec.title, 'body', 10.5) + measure(spec.subtitle, 'body', 7.5) + 18 <= width
}

export function planPdf(input: ExportInput, measure: Measure): PdfPlan {
  const pages: Block[][] = [[]]
  let y = 0

  const page = () => pages[pages.length - 1]
  const newPage = () => {
    pages.push([])
    y = CONTENT_TOP
  }
  const ensure = (height: number) => {
    // A block taller than a whole page still starts at the top of one rather than looping.
    if (y + height > CONTENT_BOTTOM && y > CONTENT_TOP) newPage()
  }

  // -- Title block: always present, it is what makes the file identifiable.
  const titleLines = coverTitleLines(input.title, measure)
  const titleY = 86
  const selectionY = titleY + (titleLines.length - 1) * 28 + 20
  const coverHeight = selectionY + 16
  page().push({
    kind: 'cover',
    y: 0,
    height: coverHeight,
    titleLines,
    titleY,
    selectionY,
    generated: generatedLabel(input.generatedAt),
  })
  y = coverHeight + 6

  const selected = new Set(input.sections)

  // -- Selection and filters.
  if (selected.has('summary')) {
    const textWidth = CONTENT_WIDTH - 70
    const rows: SummaryBlock['rows'] = [
      { label: 'Source', lines: wrapText(input.sourceFile || 'Uploaded lease comps', textWidth, 'body', 8.5, measure) },
      {
        label: 'Filters',
        lines:
          input.filters.length === 0
            ? ['None. Every uploaded deal is included.']
            : input.filters.flatMap((f) => wrapText(f, textWidth, 'body', 8.5, measure)),
      },
    ]
    const lineCount = rows.reduce((n, r) => n + r.lines.length, 0)
    const height = lineCount * 12 + (rows.length - 1) * 4 + 14
    ensure(height)
    page().push({ kind: 'summary', y, height, rows })
    y += height
  }

  // -- Headline numbers.
  if (selected.has('kpis')) {
    const height = KPI_HEIGHT + BLOCK_GAP
    ensure(height)
    page().push({ kind: 'kpis', y, height, set: 'headline', columns: input.headline.length })
    y += height
  }

  // -- A run of charts, laid out two to a row with wide charts on rows of their own.
  const chartRows = (ids: ChartId[]) => {
    const rows: Array<{ left: ChartSpec; right: ChartSpec | null; wide: boolean }> = []
    let pending: ChartSpec | null = null
    for (const id of ids) {
      const spec = input.specs[id]
      if (spec.wide) {
        if (pending) rows.push({ left: pending, right: null, wide: false })
        pending = null
        rows.push({ left: spec, right: null, wide: true })
      } else if (pending) {
        rows.push({ left: pending, right: spec, wide: false })
        pending = null
      } else {
        pending = spec
      }
    }
    if (pending) rows.push({ left: pending, right: null, wide: false })

    return rows.map((row) => {
      const a = chartBlockHeight(row.left, row.wide)
      const b = row.right ? chartBlockHeight(row.right, false) : null
      const leftWidth = row.wide ? CONTENT_WIDTH : HALF_WIDTH
      const subtitleBelow =
        !subtitleFits(row.left, leftWidth, measure) || (!!row.right && !subtitleFits(row.right, HALF_WIDTH, measure))
      return { ...row, a, b, leftWidth, subtitleBelow, height: Math.max(a.total, b?.total ?? 0) + (subtitleBelow ? 11 : 0) }
    })
  }

  const placeCharts = (rows: ReturnType<typeof chartRows>) => {
    for (const row of rows) {
      ensure(row.height)
      page().push({
        kind: 'chart',
        x: MARGIN_X,
        y,
        width: row.leftWidth,
        height: row.height,
        chartId: row.left.id,
        plotHeight: row.a.plot,
        legend: row.a.legend,
        subtitleBelow: row.subtitleBelow,
      })
      if (row.right && row.b) {
        page().push({
          kind: 'chart',
          x: MARGIN_X + HALF_WIDTH + GUTTER,
          y,
          width: HALF_WIDTH,
          height: row.height,
          chartId: row.right.id,
          plotHeight: row.b.plot,
          legend: row.b.legend,
          subtitleBelow: row.subtitleBelow,
        })
      }
      y += row.height
    }
  }

  const chartsIn = (group: 'main' | 'signed'): ChartId[] =>
    input.sections
      .map(chartIdOf)
      .filter((id): id is ChartId => !!id && (group === 'signed' ? id === 'signedByPeriod' || id === 'signingLag' : id !== 'signedByPeriod' && id !== 'signingLag'))

  placeCharts(chartRows(chartsIn('main')))

  // -- The signed date section: a heading kept with whatever follows it.
  const signedRows = chartRows(chartsIn('signed'))
  if (selected.has('signedKpis') || signedRows.length > 0) {
    const note = `When deals were executed, from the Signed Date column, rather than when they commenced. ${input.signingNote}`
    const noteLines = wrapText(note, CONTENT_WIDTH, 'body', 8.5, measure)
    const height = 24 + noteLines.length * 11 + 10
    // The heading moves with the block under it: the signing numbers, or else the first chart row.
    const next = selected.has('signedKpis') ? KPI_HEIGHT + BLOCK_GAP : (signedRows[0]?.height ?? 0)
    ensure(height + next)
    page().push({ kind: 'heading', y, height, text: 'Signed date', noteLines })
    y += height

    if (selected.has('signedKpis')) {
      const kpiHeight = KPI_HEIGHT + BLOCK_GAP
      ensure(kpiHeight)
      page().push({ kind: 'kpis', y, height: kpiHeight, set: 'signing', columns: input.signing.length })
      y += kpiHeight
    }
    placeCharts(signedRows)
  }

  // -- Field coverage.
  if (selected.has('coverage')) {
    const subtitle = `${coverageLead(input.matching)}. Gaps here explain empty popup rows and thin charts.`
    const subtitleLines = wrapText(subtitle, CONTENT_WIDTH, 'body', 8, measure)
    const rows = Math.ceil(input.coverage.length / COVERAGE_COLUMNS)
    const height = 18 + subtitleLines.length * 10.5 + 6 + rows * COVERAGE_ROW + BLOCK_GAP
    ensure(height)
    page().push({ kind: 'coverage', y, height, subtitleLines })
    y += height
  }

  // -- The deal table: its heading here, its rows wherever the table library breaks them.
  let tableStart: PdfPlan['tableStart'] = null
  let tablePages = 0
  if (input.table) {
    const t = input.table
    const notes = [`${t.rows.length.toLocaleString('en-US')} ${t.rows.length === 1 ? 'row' : 'rows'}, sorted by ${t.sortLabel}.`]
    if (t.rows.length < t.availableRows) {
      notes.push(`The first ${t.rows.length.toLocaleString('en-US')} of ${t.availableRows.toLocaleString('en-US')} rows in that order.`)
    }
    if (t.omittedConfidential > 0) {
      notes.push(
        `${t.omittedConfidential.toLocaleString('en-US')} ${t.omittedConfidential === 1 ? 'deal' : 'deals'} marked confidential left out of this table, though not out of the totals and charts.`,
      )
    }
    const subtitleLines = wrapText(notes.join(' '), CONTENT_WIDTH, 'body', 8, measure)
    const height = 18 + subtitleLines.length * 10.5 + 6
    const rows = pdfTableRows(t)
    // Keep the heading with the column headers and the first few rows rather than stranding it.
    const opening = rows.head + rows.body.slice(0, 3).reduce((sum, h) => sum + h, 0)
    ensure(height + Math.min(opening, CONTENT_BOTTOM - CONTENT_TOP - height))
    page().push({ kind: 'tableHead', y, height, heading: tableHeading(t), subtitleLines })
    y += height
    tableStart = { page: pages.length - 1, y }
    tablePages = tablePagesAfter(rows, y)
  }

  return { pages, tableStart, estimatedPages: pages.length + tablePages }
}

/** Row heights of the deal table, in points, as the table library will size them. */
export interface PdfTableRows {
  head: number
  body: number[]
}

/**
 * The table's row heights, by the table library's own rules: each column its share of the width,
 * each cell's text broken as jsPDF's splitTextToSize breaks it (into a cell one point wider than
 * its text space, as the library allows against rounding), each row as tall as its most wrapped
 * cell.
 */
export function pdfTableRows(table: ExportTable): PdfTableRows {
  const totalWeight = table.columns.reduce((sum, c) => sum + c.weight, 0)
  const space = table.columns.map((c) => (CONTENT_WIDTH * c.weight) / totalWeight - TABLE_PADDING * 2 + 1)
  const lineHeight = TABLE_FONT * LINE_HEIGHT_FACTOR
  const heightOf = (lines: number) => lines * lineHeight + TABLE_PADDING * 2
  const tallest = (texts: string[], role: 'figure' | 'table') => {
    let lines = 1
    texts.forEach((text, i) => {
      lines = Math.max(lines, pdfLineCount(text, space[i], role, TABLE_FONT))
    })
    return heightOf(lines)
  }
  return {
    head: tallest(table.columns.map((c) => c.label), 'figure'),
    body: table.rows.map((deal) => tallest(table.columns.map((c) => c.render(deal)), 'table')),
  }
}

/**
 * Pages the table adds after the one it starts on, by the table library's paging: the header
 * repeated at the top of each page, a row that does not fit moved whole to the next page, and a
 * row taller than a page split across as many as it needs.
 */
export function tablePagesAfter(rows: PdfTableRows, startY: number): number {
  const oneLine = TABLE_FONT * LINE_HEIGHT_FACTOR + TABLE_PADDING * 2
  const pageRoom = CONTENT_BOTTOM - CONTENT_TOP - rows.head
  let pages = 0
  let y = startY
  const nextPage = () => {
    pages++
    y = CONTENT_TOP + rows.head
  }

  // The library starts on a new page when not even the header fits under the heading.
  if (y + rows.head > CONTENT_BOTTOM) {
    pages++
    y = CONTENT_TOP
  }
  y += rows.head

  for (const height of rows.body) {
    if (height <= CONTENT_BOTTOM - y) {
      y += height
      continue
    }
    // Moved whole to the next page, unless it is taller than a page and a line of it fits here.
    if (!(height > pageRoom && oneLine < CONTENT_BOTTOM - y)) nextPage()
    let rest = height
    while (rest > CONTENT_BOTTOM - y) {
      rest -= CONTENT_BOTTOM - y
      nextPage()
    }
    y += rest
  }
  return pages
}
