import { MAIN_CHART_IDS, SIGNED_CHART_IDS, type ChartId } from './dashboardModel'
import { TABLE_COLUMNS } from './tableColumns'

/**
 * What a dashboard export contains and how it is written, as the person last chose it.
 *
 * The catalogue below is the dashboard itself, part by part and in the order it reads on
 * screen, so whatever is ticked comes out in the order the dashboard shows it.
 */

export type ExportFormat = 'pdf' | 'pptx'

export type ExportSectionId =
  | 'summary'
  | 'kpis'
  | `chart:${ChartId}`
  | 'signedKpis'
  | 'coverage'
  | 'table'

export type ExportGroupId = 'overview' | 'charts' | 'signed' | 'data'

export interface ExportSectionDef {
  id: ExportSectionId
  group: ExportGroupId
  /** Fixed name. A chart has none here because its name is its title, which follows the data. */
  label?: string
  chartId?: ChartId
  /** What the part contains, in a few words. */
  hint?: string
}

export const EXPORT_GROUPS: Array<{ id: ExportGroupId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'charts', label: 'Charts' },
  { id: 'signed', label: 'Signed date' },
  { id: 'data', label: 'Data' },
]

export const EXPORT_SECTIONS: ExportSectionDef[] = [
  {
    id: 'summary',
    group: 'overview',
    label: 'Selection and filters',
    hint: 'Source file and every active filter',
  },
  {
    id: 'kpis',
    group: 'overview',
    label: 'Headline numbers',
    hint: 'Deals, area, base rent, term, free rent, TI',
  },
  ...MAIN_CHART_IDS.map((chartId): ExportSectionDef => ({ id: `chart:${chartId}`, group: 'charts', chartId })),
  {
    id: 'signedKpis',
    group: 'signed',
    label: 'Signed date numbers',
    hint: 'Deals signed, signing to commencement, signed late',
  },
  ...SIGNED_CHART_IDS.map((chartId): ExportSectionDef => ({ id: `chart:${chartId}`, group: 'signed', chartId })),
  { id: 'coverage', group: 'data', label: 'Field coverage', hint: 'How complete each field is' },
  { id: 'table', group: 'data', label: 'Deal table' },
]

export const EXPORT_SECTION_IDS: ExportSectionId[] = EXPORT_SECTIONS.map((s) => s.id)

/**
 * The table columns a report carries unless the person picks others: the ones that identify a
 * deal and the terms a comp is read for. Fifteen columns fit a landscape page at a size that
 * still reads; the address, escalation and parties text would push every row onto two lines.
 */
export const DEFAULT_TABLE_COLUMNS: string[] = [
  'compId',
  'confidentiality',
  'property',
  'city',
  'state',
  'leaseDate',
  'executionDate',
  'term',
  'leaseType',
  'subtype',
  'area',
  'baseRent',
  'freeRent',
  'ti',
  'lessee',
]

export type TableRowLimit = 'all' | 25 | 50 | 100 | 250
export const TABLE_ROW_LIMITS: TableRowLimit[] = ['all', 25, 50, 100, 250]

export const DEFAULT_EXPORT_TITLE = 'Healthcare & Life Sciences lease comps'
const TITLE_MAX = 120

export interface ExportPrefs {
  format: ExportFormat
  sections: Record<ExportSectionId, boolean>
  /** Empty means the default title. */
  title: string
  tableColumns: string[]
  tableRows: TableRowLimit
  /** Leave deals marked confidential out of the table. Charts and totals still count them. */
  omitConfidential: boolean
}

export function defaultExportPrefs(): ExportPrefs {
  return {
    format: 'pdf',
    sections: Object.fromEntries(EXPORT_SECTION_IDS.map((id) => [id, true])) as Record<ExportSectionId, boolean>,
    title: '',
    tableColumns: [...DEFAULT_TABLE_COLUMNS],
    tableRows: 'all',
    omitConfidential: false,
  }
}

const COLUMN_KEYS = new Set(TABLE_COLUMNS.map((c) => c.key))

/** Read stored prefs field by field, so a stale or hand-edited value cannot break the export. */
export function parseExportPrefs(raw: unknown): ExportPrefs {
  const fallback = defaultExportPrefs()
  if (!raw || typeof raw !== 'object') return fallback
  const value = raw as Partial<Record<keyof ExportPrefs, unknown>>

  const sections = { ...fallback.sections }
  if (value.sections && typeof value.sections === 'object') {
    for (const id of EXPORT_SECTION_IDS) {
      const stored = (value.sections as Record<string, unknown>)[id]
      // A part added since the prefs were saved is included, as every part is by default.
      if (typeof stored === 'boolean') sections[id] = stored
    }
  }

  let tableColumns = fallback.tableColumns
  if (Array.isArray(value.tableColumns)) {
    const keys = value.tableColumns.filter((k): k is string => typeof k === 'string' && COLUMN_KEYS.has(k))
    // Kept in the table's own order, whatever order they were stored in.
    const ordered = TABLE_COLUMNS.map((c) => c.key).filter((k) => keys.includes(k))
    if (ordered.length > 0) tableColumns = ordered
  }

  return {
    format: value.format === 'pptx' ? 'pptx' : 'pdf',
    sections,
    title: typeof value.title === 'string' ? value.title.slice(0, TITLE_MAX) : '',
    tableColumns,
    tableRows: TABLE_ROW_LIMITS.includes(value.tableRows as TableRowLimit) ? (value.tableRows as TableRowLimit) : 'all',
    omitConfidential: value.omitConfidential === true,
  }
}

const STORAGE_KEY = 'cbre-hcls-mapper.exportPrefs.v1'

export function readStoredExportPrefs(): ExportPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return parseExportPrefs(raw ? JSON.parse(raw) : null)
  } catch {
    return defaultExportPrefs()
  }
}

export function writeStoredExportPrefs(prefs: ExportPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // Private browsing. The choices hold until the page closes.
  }
}

export function exportTitle(prefs: Pick<ExportPrefs, 'title'>): string {
  return prefs.title.trim() || DEFAULT_EXPORT_TITLE
}
