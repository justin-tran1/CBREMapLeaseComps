import JSZip from 'jszip'
import PptxGenJS from 'pptxgenjs'
import { chartTheme, stackColor } from '../components/charts/ChartKit'
import { coverageLead, type ChartSpec, type KpiSpec } from '../lib/dashboardModel'
import { chartPalette } from '../lib/palette'
import { loadExportAssets, WORDMARK_RATIO } from './assets'
import { generatedLabel, sourceLine, tableHeading, type ExportInput } from './input'
import { planSlides, TABLE_TOP, TABLE_WIDTH, TABLE_X } from './pptxPlan'

/**
 * The dashboard as a PowerPoint deck, 16:9, with native charts.
 *
 * Every chart is a real PowerPoint chart carrying its numbers, not a picture of one, so it can
 * be restyled, resized or re-cut in PowerPoint and its data opened in Excel. Text names CBRE's
 * own faces, Financier Display for titles and Calibre for everything else, which a CBRE machine
 * has installed; anywhere else PowerPoint substitutes its default.
 */

const FONT_HEAD = 'Financier Display'
const FONT_BODY = 'Calibre'

const C = {
  green: '003F2D',
  ink: '435254',
  inkStrong: '012A2D',
  cement: '7F8480',
  sage: '538184',
  border: 'CCD9D5',
  grid: 'CCD9D5',
  tick: '767676',
  lightGrey: 'CAD1D3',
  celadonTint: 'C0D4CB',
  zebra: 'F4F7F6',
  white: 'FFFFFF',
}

const X = 0.6
const W = 13.333 - X * 2
const CHART_BOX = { x: X, y: 1.5, w: W, h: 5.15 }

const hex = (color: string) => color.replace('#', '').toUpperCase()

type Slide = PptxGenJS.Slide

function addTitle(slide: Slide, title: string, subtitle?: string) {
  slide.addText(title, {
    x: X, y: 0.35, w: W, h: 0.65, margin: 0, valign: 'bottom',
    fontFace: FONT_HEAD, fontSize: 26, color: C.green, fit: 'shrink',
  })
  if (subtitle) {
    slide.addText(subtitle, {
      x: X, y: 1.02, w: W, h: 0.38, margin: 0, valign: 'top',
      fontFace: FONT_BODY, fontSize: 13, color: C.ink, fit: 'shrink',
    })
  }
}

/** A value-axis floor below the lowest point, rounded, so a trend is not flattened against zero. */
function trendFloor(values: number[]): number | undefined {
  const finite = values.filter((v) => Number.isFinite(v))
  if (finite.length === 0) return undefined
  const min = Math.min(...finite)
  const max = Math.max(...finite)
  const pad = (max - min) * 0.15 || Math.abs(min) * 0.1
  const raw = min - pad
  if (raw <= 0) return 0
  const step = 10 ** Math.floor(Math.log10(raw)) / 2
  return Math.max(0, Math.floor(raw / step) * step)
}

function addChart(pptx: PptxGenJS, slide: Slide, spec: ChartSpec, input: ExportInput) {
  const theme = chartTheme(false, input.chartPrefs)
  const base = {
    ...CHART_BOX,
    fontFace: FONT_BODY,
    catAxisLabelColor: C.tick,
    valAxisLabelColor: C.tick,
    catAxisLabelFontFace: FONT_BODY,
    valAxisLabelFontFace: FONT_BODY,
    catAxisLabelFontSize: 11,
    valAxisLabelFontSize: 11,
    catAxisLineShow: false,
    valAxisLineShow: false,
    valGridLine: input.chartPrefs.showGrid ? { color: C.grid, style: 'dash' as const, size: 0.75 } : { style: 'none' as const },
    catGridLine: { style: 'none' as const },
    valAxisLabelFormatCode: spec.numberFormat,
    showLegend: false,
    legendPos: 'b' as const,
    legendFontFace: FONT_BODY,
    legendFontSize: 11,
    legendColor: C.ink,
  }

  switch (spec.kind) {
    case 'stacked': {
      const labels = spec.data.map((b) => b.label)
      slide.addChart(
        pptx.ChartType.bar,
        spec.stackKeys.map((key) => ({ name: key, labels, values: spec.data.map((b) => Number(b.byType[key] ?? 0)) })),
        {
          ...base,
          barDir: 'col',
          barGrouping: 'stacked',
          barGapWidthPct: 150,
          chartColors: spec.stackKeys.map((key, i) => hex(stackColor(key, i, theme))),
          showLegend: spec.stackKeys.length >= 2,
        },
      )
      break
    }
    case 'trend': {
      const values = spec.data.map((b) => Number(b.avgRent))
      const filled = input.chartPrefs.trendStyle === 'area'
      slide.addChart(filled ? pptx.ChartType.area : pptx.ChartType.line, [
        { name: spec.tooltipLabel, labels: spec.data.map((b) => b.label), values },
      ], {
        ...base,
        chartColors: [hex(theme.series)],
        ...(filled ? { chartColorsOpacity: 35 } : {}),
        lineSize: 2,
        lineDataSymbol: 'circle',
        lineDataSymbolSize: 7,
        valAxisMinVal: trendFloor(values),
      })
      break
    }
    case 'bars': {
      // PowerPoint draws the first category at the bottom, so the ranking goes in reversed to
      // read largest first from the top, as on the dashboard.
      const rows = [...spec.data].reverse()
      slide.addChart(pptx.ChartType.bar, [
        { name: spec.subtitle, labels: rows.map((d) => d.name), values: rows.map((d) => d.value) },
      ], {
        ...base,
        barDir: 'bar',
        barGapWidthPct: 150,
        chartColors: [hex(theme.series)],
        catAxisLabelColor: C.ink,
        catAxisLabelFontSize: 12,
      })
      break
    }
    case 'histogram': {
      slide.addChart(pptx.ChartType.bar, [
        { name: 'Deals', labels: spec.data.map((b) => `${b.label}`), values: spec.data.map((b) => b.count) },
      ], {
        ...base,
        barDir: 'col',
        barGapWidthPct: 25,
        chartColors: [hex(theme.series)],
        valAxisLabelFormatCode: '#,##0',
      })
      break
    }
  }
}

function addKpis(pptx: PptxGenJS, slide: Slide, kpis: KpiSpec[]) {
  const perRow = kpis.length > 3 ? 3 : kpis.length
  const rows = Math.ceil(kpis.length / perRow)
  const gap = 0.3
  const w = (W - gap * (perRow - 1)) / perRow
  const top = 1.75
  const h = rows > 1 ? 2.25 : 2.6

  kpis.forEach((kpi, i) => {
    const x = X + (i % perRow) * (w + gap)
    const y = top + Math.floor(i / perRow) * (h + gap)
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y, w, h, rectRadius: 0.05, fill: { color: C.white }, line: { color: C.border, width: 1 },
    })
    slide.addText(kpi.label, {
      x: x + 0.25, y: y + 0.2, w: w - 0.5, h: 0.4, margin: 0,
      fontFace: FONT_BODY, fontSize: 14, color: C.cement,
    })
    slide.addText(kpi.value, {
      x: x + 0.25, y: y + 0.65, w: w - 0.5, h: 0.85, margin: 0, valign: 'middle',
      fontFace: FONT_BODY, fontSize: 40, bold: true, color: C.green, fit: 'shrink',
    })
    if (kpi.note) {
      slide.addText(kpi.note, {
        x: x + 0.25, y: y + 1.55, w: w - 0.5, h: h - 1.7, margin: 0, valign: 'top',
        fontFace: FONT_BODY, fontSize: 12, color: C.cement, fit: 'shrink',
      })
    }
  })
}

export async function writePptx(input: ExportInput): Promise<Blob> {
  const assets = await loadExportAssets()
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.author = 'CBRE Healthcare & Life Sciences'
  pptx.company = 'CBRE'
  pptx.title = input.title
  pptx.subject = input.selection
  pptx.theme = { headFontFace: FONT_HEAD, bodyFontFace: FONT_BODY }

  const source = sourceLine(input)

  pptx.defineSlideMaster({
    title: 'CBRE_TITLE',
    background: { color: C.green },
    objects: [{ image: { x: X, y: 0.55, w: 0.42 * WORDMARK_RATIO, h: 0.42, data: assets.wordmarkWhite } }],
  })
  pptx.defineSlideMaster({
    title: 'CBRE_CONTENT',
    background: { color: C.white },
    objects: [
      { line: { x: X, y: 6.86, w: W, h: 0, line: { color: C.lightGrey, width: 0.75 } } },
      { image: { x: X, y: 7.0, w: 0.2 * WORDMARK_RATIO, h: 0.2, data: assets.wordmarkGreen } },
      {
        text: {
          text: source,
          options: { x: X + 1.0, y: 6.93, w: W - 1.9, h: 0.34, margin: 0, valign: 'middle', fontFace: FONT_BODY, fontSize: 9, color: C.cement },
        },
      },
    ],
    slideNumber: { x: X + W - 0.8, y: 6.93, w: 0.8, h: 0.34, fontFace: FONT_BODY, fontSize: 9, color: C.cement, align: 'right' },
  })

  const notes = [source, input.filters.length ? `Filters: ${input.filters.join('; ')}.` : 'Filters: none.'].join(' ')

  for (const plan of planSlides(input)) {
    switch (plan.kind) {
      case 'title': {
        const slide = pptx.addSlide({ masterName: 'CBRE_TITLE' })
        // The practice name leads the slide unless the title already starts with it.
        const kicker = /healthcare\s*(&|and)\s*life sciences/i.test(input.title)
          ? 'Market data'
          : 'Healthcare & Life Sciences · Market data'
        slide.addText(kicker, {
          x: X, y: 1.75, w: W, h: 0.4, margin: 0, fontFace: FONT_BODY, fontSize: 16, color: C.celadonTint,
        })
        slide.addText(input.title, {
          x: X, y: 2.2, w: 11.4, h: 2.0, margin: 0, valign: 'top', fontFace: FONT_HEAD, fontSize: 40, color: C.white, fit: 'shrink',
        })
        slide.addText(input.selection, {
          x: X, y: 4.55, w: W, h: 0.45, margin: 0, fontFace: FONT_BODY, fontSize: 18, color: C.white, fit: 'shrink',
        })
        slide.addText(`Generated ${generatedLabel(input.generatedAt)}. ${input.sourceFile ? `Source: ${input.sourceFile}.` : ''}`.trim(), {
          x: X, y: 5.05, w: W, h: 0.4, margin: 0, fontFace: FONT_BODY, fontSize: 13, color: C.celadonTint, fit: 'shrink',
        })
        slide.addNotes(notes)
        break
      }
      case 'summary': {
        const slide = pptx.addSlide({ masterName: 'CBRE_CONTENT' })
        addTitle(slide, 'Selection and filters', input.selection)
        const rows: Array<{ label: string; lines: string[] }> = [
          { label: 'Source', lines: [input.sourceFile || 'Uploaded lease comps'] },
          { label: 'Filters', lines: input.filters.length ? input.filters : ['None. Every uploaded deal is included.'] },
          { label: 'Chart palette', lines: [chartPalette(input.chartPrefs.palette).label] },
        ]
        if (input.table) rows.push({ label: 'Table', lines: [`Sorted by ${input.table.sortLabel}`] })
        slide.addText(
          rows.flatMap((row) => [
            { text: row.label, options: { fontSize: 12, color: C.cement, bold: true, breakLine: true, paraSpaceBefore: 10 } },
            ...row.lines.map((line) => ({
              text: line,
              options: { fontSize: 15, color: C.ink, breakLine: true, ...(row.lines.length > 1 ? { bullet: { indent: 14 } } : {}) },
            })),
          ]),
          { x: X, y: 1.65, w: W, h: 5.0, margin: 0, valign: 'top', fontFace: FONT_BODY, fit: 'shrink' },
        )
        slide.addNotes(notes)
        break
      }
      case 'kpis': {
        const slide = pptx.addSlide({ masterName: 'CBRE_CONTENT' })
        if (plan.set === 'headline') {
          addTitle(slide, 'Headline numbers', input.selection)
          addKpis(pptx, slide, input.headline)
        } else {
          addTitle(slide, 'Signed date', `When deals were executed, rather than when they commenced. ${input.signingNote}`)
          addKpis(pptx, slide, input.signing)
        }
        slide.addNotes(notes)
        break
      }
      case 'chart': {
        const spec = input.specs[plan.chartId]
        const slide = pptx.addSlide({ masterName: 'CBRE_CONTENT' })
        addTitle(slide, spec.title, spec.subtitle)
        addChart(pptx, slide, spec, input)
        slide.addNotes(notes)
        break
      }
      case 'coverage': {
        const slide = pptx.addSlide({ masterName: 'CBRE_CONTENT' })
        addTitle(
          slide,
          'Field coverage',
          coverageLead(input.matching),
        )
        const rows = [...input.coverage].reverse()
        slide.addChart(pptx.ChartType.bar, [{ name: 'Rows populated', labels: rows.map((r) => r.label), values: rows.map((r) => r.pct) }], {
          ...CHART_BOX,
          barDir: 'bar',
          barGapWidthPct: 80,
          chartColors: [C.green],
          valAxisMinVal: 0,
          valAxisMaxVal: 100,
          valAxisHidden: true,
          valGridLine: { style: 'none' },
          catGridLine: { style: 'none' },
          catAxisLineShow: false,
          catAxisLabelColor: C.ink,
          catAxisLabelFontFace: FONT_BODY,
          catAxisLabelFontSize: 12,
          showValue: true,
          dataLabelFormatCode: '0"%"',
          dataLabelPosition: 'outEnd',
          dataLabelColor: C.ink,
          dataLabelFontFace: FONT_BODY,
          dataLabelFontSize: 11,
        })
        slide.addNotes(notes)
        break
      }
      case 'table': {
        const table = input.table
        if (!table) break
        const { layout } = plan
        const slide = pptx.addSlide({ masterName: 'CBRE_CONTENT' })
        const first = plan.rows[0] + 1
        const last = plan.rows[plan.rows.length - 1] + 1
        const total = table.rows.length
        const heading = tableHeading(table)
        // A shortened table says how: the row limit and the confidential deals left out.
        const scope =
          total < table.availableRows ? ` (the first ${total.toLocaleString('en-US')} of ${table.availableRows.toLocaleString('en-US')})` : ''
        const omitted =
          table.omittedConfidential > 0
            ? `. ${table.omittedConfidential.toLocaleString('en-US')} confidential ${table.omittedConfidential === 1 ? 'deal' : 'deals'} left out`
            : ''
        const range = first === last ? `Row ${first.toLocaleString('en-US')}` : `Rows ${first.toLocaleString('en-US')}-${last.toLocaleString('en-US')}`
        addTitle(
          slide,
          plan.parts > 1 ? `${heading} (${plan.part} of ${plan.parts})` : heading,
          `${range} of ${total.toLocaleString('en-US')}${scope}, sorted by ${table.sortLabel}${omitted}`,
        )
        const head = table.columns.map((c) => ({
          text: c.label,
          options: { bold: true, color: C.white, fill: { color: C.green }, align: c.numeric ? ('right' as const) : ('left' as const) },
        }))
        const body = plan.rows.map((rowIndex, r) =>
          table.columns.map((c, i) => ({
            text: layout.cells[rowIndex][i],
            options: { align: c.numeric ? ('right' as const) : ('left' as const), fill: { color: r % 2 ? C.zebra : C.white } },
          })),
        )
        slide.addTable([head, ...body], {
          x: TABLE_X,
          y: TABLE_TOP,
          w: TABLE_WIDTH,
          colW: layout.colW,
          rowH: [layout.headHeight, ...plan.rows.map((i) => layout.rowHeights[i])],
          fontFace: FONT_BODY,
          fontSize: layout.fontSize,
          color: C.ink,
          valign: 'middle',
          margin: [0.03, 0.06, 0.03, 0.06],
          // Rules under each row only, as the dashboard's table and the PDF's draw them.
          border: [{ type: 'none' }, { type: 'none' }, { type: 'solid', color: C.border, pt: 0.75 }, { type: 'none' }],
        })
        slide.addNotes(notes)
        break
      }
    }
  }

  // pptxgenjs stores every part of the package uncompressed, and its own compression option is
  // dropped on the way to the zip writer whichever way it is passed. Uncompressed, a deck with a
  // long table runs to megabytes of repetitive XML, so the package is zipped again with DEFLATE.
  const stored = (await pptx.write({ outputType: 'arraybuffer' })) as ArrayBuffer
  const zip = await JSZip.loadAsync(stored)
  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  })
}
