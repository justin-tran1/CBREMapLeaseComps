import { formatDateISO } from './coerce'
import { shapeContains } from './geometry'
import { resolveBrokers } from './normalize'
import type { DateRange, FacetOptions, Filters, LeaseDeal, NumericRange, RangeBounds } from '../types'

export function emptyRange(): NumericRange {
  return { min: null, max: null }
}

export function emptyFilters(): Filters {
  return {
    search: '',
    cities: [],
    states: [],
    leaseTypes: [],
    propertySubtypes: [],
    leaseDate: { start: null, end: null },
    areaLeased: emptyRange(),
    termMonths: emptyRange(),
    baseRent: emptyRange(),
    freeRent: emptyRange(),
    shape: null,
    mappedOnly: false,
  }
}

function uniqueSorted(values: string[]): string[] {
  const set = new Set<string>()
  for (const v of values) {
    const t = v.trim()
    if (t) set.add(t)
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
}

export function computeFacets(deals: LeaseDeal[]): FacetOptions {
  return {
    cities: uniqueSorted(deals.map((d) => d.city)),
    states: uniqueSorted(deals.map((d) => d.state)),
    leaseTypes: uniqueSorted(deals.map((d) => d.leaseType)),
    propertySubtypes: uniqueSorted(deals.map((d) => d.propertySubtype)),
  }
}

function spread(values: (number | null)[]): NumericRange {
  let min = Infinity
  let max = -Infinity
  for (const v of values) {
    if (v === null || !Number.isFinite(v)) continue
    if (v < min) min = v
    if (v > max) max = v
  }
  if (min === Infinity) return emptyRange()
  return { min, max }
}

export function computeBounds(deals: LeaseDeal[]): RangeBounds {
  const dates = deals.map((d) => d.leaseDate).filter((d): d is Date => d instanceof Date)
  let start: string | null = null
  let end: string | null = null
  if (dates.length) {
    const times = dates.map((d) => d.getTime())
    start = formatDateISO(new Date(Math.min(...times)))
    end = formatDateISO(new Date(Math.max(...times)))
  }

  return {
    areaLeased: spread(deals.map((d) => d.areaLeased)),
    termMonths: spread(deals.map((d) => d.termMonths)),
    baseRent: spread(deals.map((d) => d.baseRentAnnual)),
    freeRent: spread(deals.map((d) => d.freeRent)),
    leaseDate: { start, end },
  }
}

function inNumericRange(value: number | null, range: NumericRange): boolean {
  if (range.min === null && range.max === null) return true
  if (value === null || !Number.isFinite(value)) return false
  if (range.min !== null && value < range.min) return false
  if (range.max !== null && value > range.max) return false
  return true
}

function inDateRange(value: Date | null, range: DateRange): boolean {
  if (!range.start && !range.end) return true
  if (!value) return false
  const iso = formatDateISO(value)
  if (range.start && iso < range.start) return false
  if (range.end && iso > range.end) return false
  return true
}

function matchesAny(value: string, selected: string[]): boolean {
  if (selected.length === 0) return true
  const v = value.trim().toLowerCase()
  return selected.some((s) => s.trim().toLowerCase() === v)
}

/** Everything the keyword box searches across. */
function searchCorpus(deal: LeaseDeal): string {
  return [
    deal.propertyName,
    deal.address,
    deal.city,
    deal.state,
    deal.zip,
    deal.submarket,
    deal.market,
    deal.lessee,
    deal.lessor,
    deal.suite,
    deal.floor,
    deal.propertyType,
    deal.propertySubtype,
    deal.leaseType,
    deal.transactionType,
    resolveBrokers(deal),
    deal.notes,
  ]
    .join(' ')
    .toLowerCase()
}

const corpusCache = new WeakMap<LeaseDeal, string>()

function cachedCorpus(deal: LeaseDeal): string {
  let value = corpusCache.get(deal)
  if (value === undefined) {
    value = searchCorpus(deal)
    corpusCache.set(deal, value)
  }
  return value
}

/** All whitespace-separated terms must appear somewhere in the row. */
export function matchesSearch(deal: LeaseDeal, search: string): boolean {
  const query = search.trim().toLowerCase()
  if (!query) return true
  const corpus = cachedCorpus(deal)
  return query.split(/\s+/).every((term) => corpus.includes(term))
}

export function applyFilters(deals: LeaseDeal[], filters: Filters): LeaseDeal[] {
  const hasShape = filters.shape !== null

  return deals.filter((deal) => {
    if (filters.mappedOnly && (deal.lat === null || deal.lon === null)) return false

    if (!matchesAny(deal.city, filters.cities)) return false
    if (!matchesAny(deal.state, filters.states)) return false
    if (!matchesAny(deal.leaseType, filters.leaseTypes)) return false
    if (!matchesAny(deal.propertySubtype, filters.propertySubtypes)) return false

    if (!inDateRange(deal.leaseDate, filters.leaseDate)) return false
    if (!inNumericRange(deal.areaLeased, filters.areaLeased)) return false
    if (!inNumericRange(deal.termMonths, filters.termMonths)) return false
    if (!inNumericRange(deal.baseRentAnnual, filters.baseRent)) return false
    if (!inNumericRange(deal.freeRent, filters.freeRent)) return false

    if (hasShape) {
      if (deal.lat === null || deal.lon === null) return false
      if (!shapeContains(filters.shape!, deal.lat, deal.lon)) return false
    }

    if (!matchesSearch(deal, filters.search)) return false

    return true
  })
}

export interface ActiveFilterChip {
  id: string
  label: string
  clear: (filters: Filters) => Filters
}

function rangeText(range: NumericRange, unit: string, decimals = 0): string {
  const fmt = (n: number) =>
    n.toLocaleString('en-US', { maximumFractionDigits: decimals, minimumFractionDigits: 0 })
  if (range.min !== null && range.max !== null) return `${fmt(range.min)} to ${fmt(range.max)}${unit}`
  if (range.min !== null) return `${fmt(range.min)}${unit} and up`
  return `up to ${fmt(range.max as number)}${unit}`
}

/** Chips shown above the results so an active filter is never invisible. */
export function describeActiveFilters(filters: Filters): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = []

  if (filters.search.trim()) {
    chips.push({
      id: 'search',
      label: `Keyword: "${filters.search.trim()}"`,
      clear: (f) => ({ ...f, search: '' }),
    })
  }

  const listChip = (
    key: 'cities' | 'states' | 'leaseTypes' | 'propertySubtypes',
    label: string,
  ): void => {
    const values = filters[key]
    if (values.length === 0) return
    chips.push({
      id: key,
      label: `${label}: ${values.length <= 2 ? values.join(', ') : `${values.length} selected`}`,
      clear: (f) => ({ ...f, [key]: [] }),
    })
  }

  listChip('cities', 'City')
  listChip('states', 'State')
  listChip('leaseTypes', 'Lease type')
  listChip('propertySubtypes', 'Subtype')

  if (filters.leaseDate.start || filters.leaseDate.end) {
    const { start, end } = filters.leaseDate
    const label = start && end ? `${start} to ${end}` : start ? `from ${start}` : `through ${end}`
    chips.push({ id: 'leaseDate', label: `Lease date: ${label}`, clear: (f) => ({ ...f, leaseDate: { start: null, end: null } }) })
  }

  const rangeChip = (
    key: 'areaLeased' | 'termMonths' | 'baseRent' | 'freeRent',
    label: string,
    unit: string,
    decimals = 0,
  ): void => {
    const range = filters[key]
    if (range.min === null && range.max === null) return
    chips.push({
      id: key,
      label: `${label}: ${rangeText(range, unit, decimals)}`,
      clear: (f) => ({ ...f, [key]: emptyRange() }),
    })
  }

  rangeChip('areaLeased', 'Area', ' SF')
  rangeChip('termMonths', 'Term', ' mos')
  rangeChip('baseRent', 'Base rent', ' /SF/Yr', 2)
  rangeChip('freeRent', 'Free rent', ' mos', 1)

  if (filters.shape) {
    chips.push({ id: 'shape', label: 'Drawn area', clear: (f) => ({ ...f, shape: null }) })
  }

  if (filters.mappedOnly) {
    chips.push({ id: 'mappedOnly', label: 'Mapped rows only', clear: (f) => ({ ...f, mappedOnly: false }) })
  }

  return chips
}

export function hasActiveFilters(filters: Filters): boolean {
  return describeActiveFilters(filters).length > 0
}
