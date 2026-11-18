import { jsPDF } from 'jspdf'
import 'svg2pdf.js'
import { autoTable } from 'jspdf-autotable'
import { chartTheme, stackColor } from '../components/charts/ChartKit'
import type { KpiSpec } from '../lib/dashboardModel'
import { loadExportAssets, WORDMARK_RATIO } from './assets'
import { stageCharts, type Stage } from './chartStage'
import { sourceLine, type ExportInput } from './input'
import {
  CONTENT_BOTTOM,
  CONTENT_TOP,
  CONTENT_WIDTH,
  COVERAGE_COLUMNS,
  COVERAGE_ROW,
  FOOTER_RULE_Y,
  FOOTER_TEXT_Y,
  GUTTER,
  KPI_GAP,
  KPI_HEIGHT,
  MARGIN_X,
  PAGE,
  planPdf,
  TABLE_FONT,
  TABLE_PADDING,
  type Block,
  type ChartBlock,
  type FontRole,
  type Measure,
} from './pdfLayout'
import { pdfSafe } from './text'

/**
 * The dashboard as a PDF report: US Letter, landscape, every chart in vector.
 *
 * Colors and type follow the dashboard: CBRE Green for titles and figures, Dark Grey text,
 * Cement for captions, the condensed face for numbers and the table. Body text is set in the
 * PDF's built-in Helvetica, the documented stand-in for Calibre, which a file cannot embed
 * under its license. Titles take Times, standing in for Financier Display the same way.
 */

const COLOR = {
  green: '#003F2D',
  ink: '#435254',
  inkStrong: '#012A2D',
  cement: '#7F8480',
  sage: '#538184',
  rule: '#CAD1D3',
  border: '#CCD9D5',
  track: '#E3E9E7',
  zebra: '#F4F7F6',
  white: '#FFFFFF',
}

const RIGHT = MARGIN_X + CONTENT_WIDTH
const PX_PER_PT = 4 / 3

const FONT: Record<FontRole, [string, string]> = {
  display: ['times', 'normal'],
  body: ['helvetica', 'normal'],
  bodyBold: ['helvetica', 'bold'],
  figure: ['Barlow Condensed', 'bold'],
  table: ['Barlow Condensed', 'normal'],
}

function useFont(doc: jsPDF, role: FontRole, size: number, color: string = COLOR.ink): jsPDF {
  const [family, style] = FONT[role]
  return doc.setFont(family, style).setFontSize(size).setTextColor(color)
}

/** Shorten a single line with an ellipsis until it fits. */
function fit(doc: jsPDF, text: string, width: number): string {
  if (doc.getTextWidth(text) <= width) return text
  let cut = text
  while (cut.length > 1 && doc.getTextWidth(`${cut}…`) > width) cut = cut.slice(0, -1)
  return `${cut.trimEnd()}…`
}

function drawCover(doc: jsPDF, input: ExportInput, block: Extract<Block, { kind: 'cover' }>, wordmark: string) {
  doc.addImage(wordmark, 'PNG', MARGIN_X, 26, 20 * WORDMARK_RATIO, 20)

  useFont(doc, 'body', 9, COLOR.ink).text('Healthcare & Life Sciences', RIGHT, 35, { align: 'right' })
  useFont(doc, 'body', 7.5, COLOR.cement).text(`Market data · Generated ${block.generated}`, RIGHT, 46, { align: 'right' })

  useFont(doc, 'display', 24, COLOR.green)
  block.titleLines.forEach((line, i) => doc.text(pdfSafe(line), MARGIN_X, block.titleY + i * 28))

  useFont(doc, 'body', 10, COLOR.ink).text(pdfSafe(input.selection), MARGIN_X, block.selectionY)

  doc.setDrawColor(COLOR.border).setLineWidth(0.75).line(MARGIN_X, block.selectionY + 10, RIGHT, block.selectionY + 10)
}

function drawSummary(doc: jsPDF, block: Extract<Block, { kind: 'summary' }>) {
  let y = block.y + 10
  for (const row of block.rows) {
    useFont(doc, 'bodyBold', 6.8, COLOR.cement)
    doc.setCharSpace(0.6).text(row.label.toUpperCase(), MARGIN_X, y)
    doc.setCharSpace(0)
    useFont(doc, 'body', 8.5, COLOR.ink)
    row.lines.forEach((line, i) => doc.text(pdfSafe(line), MARGIN_X + 70, y + i * 12))
    y += row.lines.length * 12 + 4
  }
}

function drawKpis(doc: jsPDF, block: Extract<Block, { kind: 'kpis' }>, kpis: KpiSpec[]) {
  const n = kpis.length
  const width = (CONTENT_WIDTH - KPI_GAP * (n - 1)) / n
  kpis.forEach((kpi, i) => {
    const x = MARGIN_X + i * (width + KPI_GAP)
    const y = block.y
    doc.setDrawColor(COLOR.border).setLineWidth(0.75).setFillColor(COLOR.white)
    doc.roundedRect(x, y, width, KPI_HEIGHT, 2.5, 2.5, 'FD')

    useFont(doc, 'body', 7.5, COLOR.cement).text(fit(doc, kpi.label, width - 18), x + 9, y + 14)
    useFont(doc, 'figure', 17, COLOR.green).text(fit(doc, pdfSafe(kpi.value), width - 18), x + 9, y + 33)
    if (kpi.note) {
      useFont(doc, 'body', 6.8, COLOR.cement)
      const lines = doc.splitTextToSize(pdfSafe(kpi.note), width - 18) as string[]
      lines.slice(0, 2).forEach((line, li) => doc.text(li === 1 && lines.length > 2 ? fit(doc, `${line} …`, width - 18) : line, x + 9, y + 44 + li * 8))
    }
  })
}

async function drawChart(doc: jsPDF, input: ExportInput, block: ChartBlock, stage: Stage) {
  const spec = input.specs[block.chartId]
  const theme = chartTheme(false, input.chartPrefs)

  useFont(doc, 'body', 10.5, COLOR.inkStrong).text(fit(doc, pdfSafe(spec.title), block.width), block.x, block.y + 11)
  useFont(doc, 'body', 7.5, COLOR.cement)
  if (block.subtitleBelow) doc.text(fit(doc, pdfSafe(spec.subtitle), block.width), block.x, block.y + 22)
  else doc.text(pdfSafe(spec.subtitle), block.x + block.width, block.y + 11, { align: 'right' })

  const plotY = block.y + 18 + (block.subtitleBelow ? 11 : 0)
  const svg = stage.svgOf(block.chartId)
  // Axis labels carry names from the data, so they get the same treatment as the table's cells:
  // a letter the embedded face lacks would otherwise drop out of "Łódź" without a trace. The
  // staged copy is thrown away after the export, so it is changed in place.
  svg.querySelectorAll('text, tspan').forEach((element) =>
    element.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) node.nodeValue = pdfSafe(node.nodeValue ?? '')
    }),
  )
  await doc.svg(svg, { x: block.x, y: plotY, width: block.width, height: block.plotHeight })

  if (block.legend && spec.kind === 'stacked') {
    let x = block.x
    let y = plotY + block.plotHeight + 9
    useFont(doc, 'figure', 8, COLOR.ink).setFont('Barlow Condensed', 'normal')
    spec.stackKeys.forEach((key, index) => {
      const label = pdfSafe(key)
      const itemWidth = 11 + doc.getTextWidth(label) + 12
      if (x + itemWidth > block.x + block.width && x > block.x) {
        x = block.x
        y += 11
      }
      doc.setFillColor(stackColor(key, index, theme)).rect(x, y - 6, 7, 7, 'F')
      doc.text(label, x + 11, y)
      x += itemWidth
    })
  }
}

function drawHeading(doc: jsPDF, block: Extract<Block, { kind: 'heading' }>) {
  useFont(doc, 'display', 16, COLOR.sage).text(block.text, MARGIN_X, block.y + 17)
  useFont(doc, 'body', 8.5, COLOR.ink)
  block.noteLines.forEach((line, i) => doc.text(pdfSafe(line), MARGIN_X, block.y + 32 + i * 11))
}

function drawCoverage(doc: jsPDF, input: ExportInput, block: Extract<Block, { kind: 'coverage' }>) {
  useFont(doc, 'body', 10.5, COLOR.inkStrong).text('Field coverage', MARGIN_X, block.y + 11)
  useFont(doc, 'body', 8, COLOR.cement)
  block.subtitleLines.forEach((line, i) => doc.text(line, MARGIN_X, block.y + 24 + i * 10.5))

  const top = block.y + 18 + block.subtitleLines.length * 10.5 + 10
  const cellWidth = (CONTENT_WIDTH - GUTTER * (COVERAGE_COLUMNS - 1)) / COVERAGE_COLUMNS
  const labelWidth = 74
  const pctWidth = 24
  const barWidth = cellWidth - labelWidth - pctWidth - 6

  input.coverage.forEach((row, i) => {
    const x = MARGIN_X + (i % COVERAGE_COLUMNS) * (cellWidth + GUTTER)
    const y = top + Math.floor(i / COVERAGE_COLUMNS) * COVERAGE_ROW
    useFont(doc, 'body', 7.5, COLOR.ink).text(fit(doc, row.label, labelWidth - 4), x, y + 5)
    doc.setFillColor(COLOR.track).roundedRect(x + labelWidth, y, barWidth, 5, 2, 2, 'F')
    if (row.pct > 0) doc.setFillColor(COLOR.green).roundedRect(x + labelWidth, y, Math.max(4, (barWidth * row.pct) / 100), 5, 2, 2, 'F')
    useFont(doc, 'figure', 8, COLOR.ink).setFont('Barlow Condensed', 'normal').text(`${row.pct}%`, x + cellWidth, y + 5.5, { align: 'right' })
  })
}

function drawTableHead(doc: jsPDF, block: Extract<Block, { kind: 'tableHead' }>) {
  useFont(doc, 'body', 10.5, COLOR.inkStrong).text(block.heading, MARGIN_X, block.y + 11)
  useFont(doc, 'body', 8, COLOR.cement)
  block.subtitleLines.forEach((line, i) => doc.text(line, MARGIN_X, block.y + 24 + i * 10.5))
}

function drawTable(doc: jsPDF, input: ExportInput, startY: number) {
  const table = input.table
  if (!table) return
  const totalWeight = table.columns.reduce((sum, c) => sum + c.weight, 0)

  autoTable(doc, {
    startY,
    margin: { top: CONTENT_TOP, bottom: PAGE.height - CONTENT_BOTTOM, left: MARGIN_X, right: MARGIN_X },
    head: [table.columns.map((c) => c.label)],
    body: table.rows.map((deal) => table.columns.map((c) => pdfSafe(c.render(deal)))),
    theme: 'plain',
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    styles: {
      font: 'Barlow Condensed',
      fontStyle: 'normal',
      fontSize: TABLE_FONT,
      textColor: COLOR.ink,
      cellPadding: TABLE_PADDING,
      overflow: 'linebreak',
      valign: 'middle',
      lineColor: COLOR.track,
      lineWidth: { bottom: 0.4, top: 0, left: 0, right: 0 },
    },
    headStyles: { font: 'Barlow Condensed', fontStyle: 'bold', fillColor: COLOR.green, textColor: COLOR.white, lineWidth: 0 },
    alternateRowStyles: { fillColor: COLOR.zebra },
    columnStyles: Object.fromEntries(
      table.columns.map((c, i) => [i, { cellWidth: (CONTENT_WIDTH * c.weight) / totalWeight, halign: c.numeric ? 'right' : 'left' }]),
    ),
    didParseCell: (data) => {
      // A numeric column's header sits over its figures, not over the gap beside them.
      if (data.section === 'head' && table.columns[data.column.index]?.numeric) data.cell.styles.halign = 'right'
    },
  })
}

function drawRunningHeader(doc: jsPDF, input: ExportInput, wordmark: string) {
  doc.addImage(wordmark, 'PNG', MARGIN_X, 24, 12 * WORDMARK_RATIO, 12)
  useFont(doc, 'body', 8, COLOR.cement).text(fit(doc, pdfSafe(input.title), 480), RIGHT, 33, { align: 'right' })
  doc.setDrawColor(COLOR.border).setLineWidth(0.5).line(MARGIN_X, 44, RIGHT, 44)
}

function drawFooter(doc: jsPDF, input: ExportInput, page: number, pages: number) {
  doc.setDrawColor(COLOR.rule).setLineWidth(0.5).line(MARGIN_X, FOOTER_RULE_Y, RIGHT, FOOTER_RULE_Y)
  useFont(doc, 'body', 7, COLOR.cement)
  doc.text(fit(doc, pdfSafe(sourceLine(input)), CONTENT_WIDTH - 80), MARGIN_X, FOOTER_TEXT_Y)
  doc.text(`Page ${page} of ${pages}`, RIGHT, FOOTER_TEXT_Y, { align: 'right' })
}

export async function writePdf(input: ExportInput): Promise<Blob> {
  const assets = await loadExportAssets()
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter', compress: true })

  doc.addFileToVFS('BarlowCondensed-Regular.ttf', assets.barlowRegular)
  doc.addFont('BarlowCondensed-Regular.ttf', 'Barlow Condensed', 'normal')
  doc.addFileToVFS('BarlowCondensed-SemiBold.ttf', assets.barlowSemiBold)
  doc.addFont('BarlowCondensed-SemiBold.ttf', 'Barlow Condensed', 'bold')

  const measure: Measure = (text, role, size) => {
    useFont(doc, role, size)
    return doc.getTextWidth(pdfSafe(text))
  }
  const plan = planPdf(input, measure)

  const chartBlocks = plan.pages.flat().filter((b): b is ChartBlock => b.kind === 'chart')
  const stage = await stageCharts(
    chartBlocks.map((b) => ({
      spec: input.specs[b.chartId],
      width: Math.round(b.width * PX_PER_PT),
      height: Math.round(b.plotHeight * PX_PER_PT),
    })),
    chartTheme(false, input.chartPrefs),
  )

  try {
    for (let p = 0; p < plan.pages.length; p++) {
      if (p > 0) doc.addPage()
      for (const block of plan.pages[p]) {
        switch (block.kind) {
          case 'cover':
            drawCover(doc, input, block, assets.wordmarkGreen)
            break
          case 'summary':
            drawSummary(doc, block)
            break
          case 'kpis':
            drawKpis(doc, block, block.set === 'headline' ? input.headline : input.signing)
            break
          case 'chart':
            await drawChart(doc, input, block, stage)
            break
          case 'heading':
            drawHeading(doc, block)
            break
          case 'coverage':
            drawCoverage(doc, input, block)
            break
          case 'tableHead':
            drawTableHead(doc, block)
            break
        }
      }
    }

    if (plan.tableStart) {
      doc.setPage(plan.tableStart.page + 1)
      drawTable(doc, input, plan.tableStart.y)
    }
  } finally {
    stage.dispose()
  }

  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    if (p > 1) drawRunningHeader(doc, input, assets.wordmarkGreen)
    drawFooter(doc, input, p, pages)
  }

  doc.setProperties({
    title: pdfSafe(input.title),
    subject: pdfSafe(input.selection),
    author: 'CBRE Healthcare & Life Sciences',
    creator: 'CBRE Healthcare & Life Sciences lease comp mapper',
    keywords: 'lease comps, dashboard',
  })
  doc.setLanguage('en-US')

  return doc.output('blob')
}
