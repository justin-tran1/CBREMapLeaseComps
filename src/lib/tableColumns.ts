import { fmtArea, fmtDate, fmtRent, fmtShortMonths, fmtText, EMPTY } from './format'
import { resolveEscalation } from './normalize'
import type { LeaseDeal } from '../types'

/**
 * The deal table's columns, shared by the dashboard table and the exported report.
 *
 * One definition means the exported table cannot drift from the one on screen: the same label,
 * the same formatting and the same sort for every column.
 */

export type SortDirection = 'asc' | 'desc'

export interface TableSort {
  key: string
  direction: SortDirection
}

export interface TableColumn {
  key: string
  label: string
  /** The column header written out in full, for places with room to spare. */
  longLabel?: string
  numeric?: boolean
  render: (deal: LeaseDeal) => string
  sortValue: (deal: LeaseDeal) => string | number | null
  /** Relative width in an exported table, where every column has to share one page. */
  weight: number
}

export const TABLE_COLUMNS: TableColumn[] = [
  { key: 'compId', label: 'Comp ID', render: (d) => fmtText(d.compId), sortValue: (d) => d.compId.toLowerCase(), weight: 1.1 },
  {
    key: 'confidentiality',
    label: 'Conf.',
    longLabel: 'Confidentiality',
    render: (d) => fmtText(d.confidentiality),
    sortValue: (d) => d.confidentiality.toLowerCase(),
    weight: 0.6,
  },
  {
    key: 'property',
    label: 'Property',
    render: (d) => fmtText(d.propertyName || d.address),
    sortValue: (d) => (d.propertyName || d.address).toLowerCase(),
    weight: 2.2,
  },
  { key: 'address', label: 'Address', render: (d) => fmtText(d.address), sortValue: (d) => d.address.toLowerCase(), weight: 1.8 },
  { key: 'city', label: 'City', render: (d) => fmtText(d.city), sortValue: (d) => d.city.toLowerCase(), weight: 1.3 },
  { key: 'state', label: 'State', render: (d) => fmtText(d.state), sortValue: (d) => d.state.toLowerCase(), weight: 0.55 },
  {
    key: 'leaseDate',
    label: 'Lease date',
    render: (d) => fmtDate(d.leaseDate),
    sortValue: (d) => d.leaseDate?.getTime() ?? null,
    weight: 1.05,
  },
  {
    key: 'term',
    label: 'Term',
    numeric: true,
    render: (d) => fmtShortMonths(d.termMonths),
    sortValue: (d) => d.termMonths,
    weight: 0.75,
  },
  {
    key: 'executionDate',
    label: 'Signed',
    longLabel: 'Signed date',
    render: (d) => fmtDate(d.executionDate),
    sortValue: (d) => d.executionDate?.getTime() ?? null,
    weight: 1.05,
  },
  {
    key: 'leaseType',
    label: 'Lease type',
    render: (d) => fmtText(d.leaseType),
    sortValue: (d) => d.leaseType.toLowerCase(),
    weight: 1.15,
  },
  {
    key: 'subtype',
    label: 'Subtype',
    longLabel: 'Property subtype',
    render: (d) => fmtText(d.propertySubtype),
    sortValue: (d) => d.propertySubtype.toLowerCase(),
    weight: 1.3,
  },
  { key: 'floor', label: 'Floor', render: (d) => fmtText(d.floor), sortValue: (d) => d.floor.toLowerCase(), weight: 0.55 },
  { key: 'suite', label: 'Suite', render: (d) => fmtText(d.suite), sortValue: (d) => d.suite.toLowerCase(), weight: 0.6 },
  {
    key: 'area',
    label: 'Area leased',
    numeric: true,
    render: (d) => fmtArea(d.areaLeased),
    sortValue: (d) => d.areaLeased,
    weight: 1.05,
  },
  {
    key: 'baseRent',
    label: 'Base rent',
    numeric: true,
    render: (d) => fmtRent(d.baseRent, d.rateType),
    // Sorting compares annualized rates so a monthly quote does not sink to the bottom.
    sortValue: (d) => d.baseRentAnnual,
    weight: 1.2,
  },
  {
    key: 'opex',
    label: 'OpEx',
    numeric: true,
    render: (d) => fmtRent(d.opex, d.rateType),
    sortValue: (d) => d.opexAnnual,
    weight: 1.15,
  },
  {
    key: 'escalation',
    label: 'Escalation',
    render: (d) => fmtText(resolveEscalation(d)),
    sortValue: (d) => resolveEscalation(d).toLowerCase(),
    weight: 2.2,
  },
  {
    key: 'freeRent',
    label: 'Free rent',
    numeric: true,
    render: (d) => (d.freeRent === null ? EMPTY : fmtShortMonths(d.freeRent)),
    sortValue: (d) => d.freeRent,
    weight: 0.8,
  },
  {
    key: 'ti',
    label: 'TI allowance',
    numeric: true,
    render: (d) => (d.tiAllowance === null ? EMPTY : fmtRent(d.tiAllowance, 'annual').replace('/SF/Yr', '/SF')),
    sortValue: (d) => d.tiAllowance,
    weight: 1,
  },
  { key: 'lessor', label: 'Lessor', render: (d) => fmtText(d.lessor), sortValue: (d) => d.lessor.toLowerCase(), weight: 1.7 },
  { key: 'lessee', label: 'Lessee', render: (d) => fmtText(d.lessee), sortValue: (d) => d.lessee.toLowerCase(), weight: 1.7 },
  {
    key: 'submarket',
    label: 'Submarket',
    render: (d) => fmtText(d.submarket),
    sortValue: (d) => d.submarket.toLowerCase(),
    weight: 1.3,
  },
]

const BY_KEY = new Map(TABLE_COLUMNS.map((column) => [column.key, column]))

export function tableColumn(key: string): TableColumn | undefined {
  return BY_KEY.get(key)
}

export const DEFAULT_TABLE_SORT: TableSort = { key: 'leaseDate', direction: 'desc' }

/** The direction a column sorts in when first chosen: newest, largest and dearest first. */
export function initialDirection(key: string): SortDirection {
  return key === 'leaseDate' || key === 'area' || key === 'baseRent' ? 'desc' : 'asc'
}

export function sortDeals(deals: LeaseDeal[], sort: TableSort): LeaseDeal[] {
  const column = BY_KEY.get(sort.key) ?? TABLE_COLUMNS[0]
  const factor = sort.direction === 'asc' ? 1 : -1

  return [...deals].sort((a, b) => {
    const av = column.sortValue(a)
    const bv = column.sortValue(b)

    // Blanks always sink to the bottom, whichever way the column is sorted.
    const aEmpty = av === null || av === '' || av === undefined
    const bEmpty = bv === null || bv === '' || bv === undefined
    if (aEmpty && bEmpty) return a.sourceRow - b.sourceRow
    if (aEmpty) return 1
    if (bEmpty) return -1

    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor || a.sourceRow - b.sourceRow
    return String(av).localeCompare(String(bv)) * factor || a.sourceRow - b.sourceRow
  })
}

/**
 * "lease date (descending)", for the line under a table that says how it is ordered. Running text
 * lowercases the column name but keeps an acronym's capitals: "comp ID", "TI allowance", "OpEx".
 */
export function describeSort(sort: TableSort): string {
  const column = BY_KEY.get(sort.key) ?? TABLE_COLUMNS[0]
  const name = (column.longLabel ?? column.label)
    .split(' ')
    .map((word) => (/[A-Z].*[A-Z]/.test(word) ? word : word.toLowerCase()))
    .join(' ')
  return `${name} (${sort.direction === 'asc' ? 'ascending' : 'descending'})`
}
