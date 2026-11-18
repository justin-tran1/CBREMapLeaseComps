import type { ChartPrefs } from '../lib/chartPrefs'
import { cleanText } from '../lib/coerce'
import {
  buildDashboardModel,
  chartSpecs,
  coverageRows,
  headlineKpis,
  selectionLine,
  signingCoverageNote,
  signingKpis,
  type ChartId,
  type ChartSpec,
  type CoverageSpec,
  type DashboardModel,
  type KpiSpec,
} from '../lib/dashboardModel'
import {
  EXPORT_SECTIONS,
  exportTitle,
  type ExportFormat,
  type ExportPrefs,
  type ExportSectionDef,
  type ExportSectionId,
} from '../lib/exportPrefs'
import { describeFiltersForReport } from '../lib/filters'
import { isConfidential } from '../lib/normalize'
import { describeSort, sortDeals, tableColumn, type TableColumn, type TableSort } from '../lib/tableColumns'
import type { Filters, LeaseDeal } from '../types'

/**
 * Everything an export writes, gathered in one place before any file library loads.
 *
 * Both writers take this and nothing else, and the dialog builds it too, to say which parts are
 * available and how long the file will run. That is how the preview and the file agree.
 */

export interface ExportContext {
  deals: LeaseDeal[]
  filtered: LeaseDeal[]
  filters: Filters
  fileName: string
  tableSort: TableSort
  chartPrefs: ChartPrefs
}

export interface SectionState {
  def: ExportSectionDef
  label: string
  hint?: string
  available: boolean
  /** Why an unavailable part cannot be exported, in the dashboard's own words. */
  reason?: string
}

export interface ExportTable {
  columns: TableColumn[]
  rows: LeaseDeal[]
  sortLabel: string
  /** Matching rows left out because they are marked confidential. */
  omittedConfidential: number
  /** Rows that would have been included without the row limit. */
  availableRows: number
}

export interface ExportInput {
  format: ExportFormat
  title: string
  generatedAt: Date
  sourceFile: string
  /** "74 of 74 deals · Jan 2022 to Oct 2025 · 32 mapped locations" */
  selection: string
  filters: string[]
  /** The parts to write, in dashboard order. Only parts with something to show are here. */
  sections: ExportSectionId[]
  specs: Record<ChartId, ChartSpec>
  headline: KpiSpec[]
  signing: KpiSpec[]
  signingNote: string
  coverage: CoverageSpec[]
  table: ExportTable | null
  chartPrefs: ChartPrefs
  matching: number
  totalDeals: number
}

export function chartIdOf(id: ExportSectionId): ChartId | null {
  return id.startsWith('chart:') ? (id.slice('chart:'.length) as ChartId) : null
}

function tableRowsFor(ctx: ExportContext, prefs: ExportPrefs): { rows: LeaseDeal[]; omitted: number; available: number } {
  let rows = sortDeals(ctx.filtered, ctx.tableSort)
  let omitted = 0
  if (prefs.omitConfidential) {
    const kept = rows.filter((d) => !isConfidential(d))
    omitted = rows.length - kept.length
    rows = kept
  }
  const available = rows.length
  if (prefs.tableRows !== 'all') rows = rows.slice(0, prefs.tableRows)
  return { rows, omitted, available }
}

/** Every part of the dashboard, whether it can be exported right now, and what it would contain. */
export function sectionStates(
  model: DashboardModel,
  specs: Record<ChartId, ChartSpec>,
  ctx: ExportContext,
  prefs: ExportPrefs,
): SectionState[] {
  const nothing = model.matching === 0
  const table = tableRowsFor(ctx, prefs)

  return EXPORT_SECTIONS.map((def): SectionState => {
    const chartId = def.chartId
    if (chartId) {
      const spec = specs[chartId]
      if (nothing) return { def, label: spec.title, available: false, reason: 'No deals match the current filters.' }
      return {
        def,
        label: spec.title,
        hint: spec.subtitle,
        available: !spec.empty,
        reason: spec.empty ? spec.emptyLabel : undefined,
      }
    }

    const label = def.label ?? def.id
    if (nothing) return { def, label, hint: def.hint, available: false, reason: 'No deals match the current filters.' }

    switch (def.id) {
      case 'signedKpis':
        return model.signing.signedCount === 0
          ? { def, label, hint: def.hint, available: false, reason: 'No signed dates are mapped in the current selection.' }
          : { def, label, hint: def.hint, available: true }
      case 'table': {
        const shown = table.rows.length
        if (shown === 0) {
          return {
            def,
            label,
            available: false,
            reason: table.omitted > 0 ? 'Every matching deal is marked confidential.' : 'No rows to list.',
          }
        }
        const columns = prefs.tableColumns.length
        return {
          def,
          label,
          hint: `${shown.toLocaleString('en-US')} ${shown === 1 ? 'row' : 'rows'}, ${columns} ${columns === 1 ? 'column' : 'columns'}`,
          available: true,
        }
      }
      default:
        return { def, label, hint: def.hint, available: true }
    }
  })
}

/**
 * The input both writers take. The dialog already holds the dashboard model for the same deals,
 * so it can pass that in rather than have it worked out again on every change.
 */
export function buildExportInput(
  ctx: ExportContext,
  prefs: ExportPrefs,
  generatedAt = new Date(),
  precomputed?: { model: DashboardModel; specs: Record<ChartId, ChartSpec> },
): ExportInput {
  const model = precomputed?.model ?? buildDashboardModel(ctx.deals, ctx.filtered)
  const specs = precomputed?.specs ?? chartSpecs(model)
  const states = sectionStates(model, specs, ctx, prefs)
  const sections = states.filter((s) => s.available && prefs.sections[s.def.id]).map((s) => s.def.id)

  let table: ExportTable | null = null
  if (sections.includes('table')) {
    const { rows, omitted, available } = tableRowsFor(ctx, prefs)
    const columns = prefs.tableColumns.map((key) => tableColumn(key)).filter((c): c is TableColumn => !!c)
    table = { columns, rows, sortLabel: describeSort(ctx.tableSort), omittedConfidential: omitted, availableRows: available }
  }

  return {
    format: prefs.format,
    title: exportTitle(prefs),
    generatedAt,
    // The file name and a typed keyword are the only text here that did not come through a cell.
    sourceFile: cleanText(ctx.fileName),
    selection: selectionLine(model),
    filters: describeFiltersForReport(ctx.filters).map(cleanText),
    sections,
    specs,
    headline: headlineKpis(model),
    signing: signingKpis(model),
    signingNote: signingCoverageNote(model),
    coverage: coverageRows(model),
    table,
    chartPrefs: ctx.chartPrefs,
    matching: model.matching,
    totalDeals: model.totalDeals,
  }
}

/** The deal table's heading: "All matching deals" when it lists every one, "Matching deals" when it lists some. */
export function tableHeading(table: Pick<ExportTable, 'rows' | 'availableRows' | 'omittedConfidential'>): string {
  return table.rows.length < table.availableRows || table.omittedConfidential > 0 ? 'Matching deals' : 'All matching deals'
}

/** "Nov 18, 2026" */
export function generatedLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** The line that says where the numbers come from, written the way CBRE attributes a source. */
export function sourceLine(input: Pick<ExportInput, 'sourceFile' | 'matching' | 'totalDeals' | 'generatedAt'>): string {
  const file = input.sourceFile ? `Source: ${input.sourceFile}` : 'Source: uploaded lease comps'
  const deals = `${input.matching.toLocaleString('en-US')} of ${input.totalDeals.toLocaleString('en-US')} deals`
  return `${file}. ${deals}. Generated ${generatedLabel(input.generatedAt)}.`
}

/** cbre-hcls-dashboard-20261118-1407.pdf */
export function exportFileName(format: ExportFormat, at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}`
  return `cbre-hcls-dashboard-${stamp}.${format}`
}
