import type { ChartId, ChartSpec } from '../lib/dashboardModel'
import { chartIdOf, generatedLabel, tableHeading, type ExportInput, type ExportTable } from './input'

/**
 * Where everything goes in the PDF report, worked out before anything is drawn.
 *
 * The planner is pure geometry. It takes a text-measuring function so the export dialog can run
 * it with an estimate to say how many pages a report will have, and the writer can run it with
 * the real font metrics to place every block. Both read the same rules, so the estimate and the
 * file agree on where the page breaks fall, apart from the table, whose rows the table library
 * breaks once it knows how far each cell wraps.
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

/** Table metrics. The table library sizes rows itself; these feed the estimate and the margins. */
export const TABLE_FONT = 7.5
export const TABLE_PADDING = 3
export const TABLE_ROW_ESTIMATE = 14.6
export const TABLE_HEAD_ESTIMATE = 17

/** display: titles. body, bodyBold: text. figure: condensed numerals. table: condensed cells. */
export type FontRole = 'display' | 'body' | 'bodyBold' | 'figure' | 'table'

export type Measure = (text: string, role: FontRole, size: number) => number

/** Average advance widths as a share of the font size, close enough to estimate line breaks. */
const APPROX_EM: Record<FontRole, number> = { display: 0.46, body: 0.5, bodyBold: 0.55, figure: 0.42, table: 0.41 }

export const approxMeasure: Measure = (text, role, size) => text.length * size * APPROX_EM[role]

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
  const titleLines = wrapText(input.title, CONTENT_WIDTH, 'display', 24, measure).slice(0, 3)
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
  const placeCharts = (ids: ChartId[], keepWith = 0) => {
    let pending: ChartSpec | null = null
    let first = true

    const placeRow = (left: ChartSpec, right: ChartSpec | null, wide: boolean) => {
      const a = chartBlockHeight(left, wide)
      const b = right ? chartBlockHeight(right, false) : null
      const leftWidth = wide ? CONTENT_WIDTH : HALF_WIDTH
      const subtitleBelow = !subtitleFits(left, leftWidth, measure) || (!!right && !subtitleFits(right, HALF_WIDTH, measure))
      const extra = subtitleBelow ? 11 : 0
      const rowHeight = Math.max(a.total, b?.total ?? 0) + extra
      ensure(rowHeight + (first ? keepWith : 0))
      first = false
      page().push({
        kind: 'chart',
        x: MARGIN_X,
        y,
        width: leftWidth,
        height: rowHeight,
        chartId: left.id,
        plotHeight: a.plot,
        legend: a.legend,
        subtitleBelow,
      })
      if (right && b) {
        page().push({
          kind: 'chart',
          x: MARGIN_X + HALF_WIDTH + GUTTER,
          y,
          width: HALF_WIDTH,
          height: rowHeight,
          chartId: right.id,
          plotHeight: b.plot,
          legend: b.legend,
          subtitleBelow,
        })
      }
      y += rowHeight
    }

    for (const id of ids) {
      const spec = input.specs[id]
      if (spec.wide) {
        if (pending) {
          placeRow(pending, null, false)
          pending = null
        }
        placeRow(spec, null, true)
      } else if (pending) {
        placeRow(pending, spec, false)
        pending = null
      } else {
        pending = spec
      }
    }
    if (pending) placeRow(pending, null, false)
  }

  const chartsIn = (group: 'main' | 'signed'): ChartId[] =>
    input.sections
      .map(chartIdOf)
      .filter((id): id is ChartId => !!id && (group === 'signed' ? id === 'signedByPeriod' || id === 'signingLag' : id !== 'signedByPeriod' && id !== 'signingLag'))

  placeCharts(chartsIn('main'))

  // -- The signed date section: a heading kept with whatever follows it.
  const signedCharts = chartsIn('signed')
  if (selected.has('signedKpis') || signedCharts.length > 0) {
    const note = `When deals were executed, from the Signed Date column, rather than when they commenced. ${input.signingNote}`
    const noteLines = wrapText(note, CONTENT_WIDTH, 'body', 8.5, measure)
    const height = 24 + noteLines.length * 11 + 10
    const next = selected.has('signedKpis') ? KPI_HEIGHT + BLOCK_GAP : WIDE_CHART_HEIGHT + CHART_TITLE_ROW + LEGEND_ROW
    ensure(height + next)
    page().push({ kind: 'heading', y, height, text: 'Signed date', noteLines })
    y += height

    if (selected.has('signedKpis')) {
      const kpiHeight = KPI_HEIGHT + BLOCK_GAP
      ensure(kpiHeight)
      page().push({ kind: 'kpis', y, height: kpiHeight, set: 'signing', columns: input.signing.length })
      y += kpiHeight
    }
    placeCharts(signedCharts)
  }

  // -- Field coverage.
  if (selected.has('coverage')) {
    const subtitle = `How many of the ${input.matching.toLocaleString('en-US')} matching rows carry a value for each field. Gaps here explain empty popup rows and thin charts.`
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
    // Keep the heading with the column headers and a few rows rather than stranding it.
    ensure(height + TABLE_HEAD_ESTIMATE + TABLE_ROW_ESTIMATE * 3)
    page().push({ kind: 'tableHead', y, height, heading: tableHeading(t), subtitleLines })
    y += height
    tableStart = { page: pages.length - 1, y }
    tablePages = tableContinuationPages(t, y)
  }

  return { pages, tableStart, estimatedPages: pages.length + tablePages }
}

/**
 * Pages the table adds after the one it starts on, by laying its rows out the way the table
 * library does: each column its share of the width, each row as tall as its most wrapped cell,
 * no row split across a page, and the header repeated at the top of each new page.
 *
 * Always measured with the estimate, never the real metrics: it runs over every cell, and the
 * dialog runs it again whenever an option changes.
 */
export function tableContinuationPages(table: ExportTable, startY: number): number {
  const totalWeight = table.columns.reduce((sum, c) => sum + c.weight, 0)
  const widths = table.columns.map((c) => (CONTENT_WIDTH * c.weight) / totalWeight - TABLE_PADDING * 2)
  const lineHeight = TABLE_FONT * 1.15
  const heightOf = (lines: number) => lines * lineHeight + TABLE_PADDING * 2
  const linesOf = (text: string, i: number, role: FontRole) => wrapText(text, widths[i], role, TABLE_FONT, approxMeasure).length

  const head = heightOf(Math.max(...table.columns.map((c, i) => linesOf(c.label, i, 'figure'))))
  let y = startY + head
  let pages = 0
  for (const deal of table.rows) {
    const height = heightOf(Math.max(...table.columns.map((c, i) => linesOf(c.render(deal), i, 'table'))))
    if (y + height > CONTENT_BOTTOM) {
      pages++
      y = CONTENT_TOP + head
    }
    y += height
  }
  return pages
}
