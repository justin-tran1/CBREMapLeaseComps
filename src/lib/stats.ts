import { resolveEscalation } from './normalize'
import { OTHER_LABEL } from './palette'
import type { LeaseDeal } from '../types'

export interface Kpis {
  dealCount: number
  mappedCount: number
  siteCount: number
  totalArea: number | null
  medianArea: number | null
  weightedBaseRent: number | null
  averageBaseRent: number | null
  averageTerm: number | null
  averageFreeRent: number | null
  averageTi: number | null
  averageOpex: number | null
  dateRangeLabel: string
}

function finite(values: (number | null)[]): number[] {
  const out: number[] = []
  for (const v of values) if (v !== null && Number.isFinite(v)) out.push(v)
  return out
}

export function mean(values: (number | null)[]): number | null {
  const nums = finite(values)
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export function median(values: (number | null)[]): number | null {
  const nums = finite(values).sort((a, b) => a - b)
  if (nums.length === 0) return null
  const mid = Math.floor(nums.length / 2)
  return nums.length % 2 === 0 ? (nums[mid - 1] + nums[mid]) / 2 : nums[mid]
}

export function sum(values: (number | null)[]): number | null {
  const nums = finite(values)
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0)
}

/**
 * Rent weighted by area leased. A 200,000 SF deal should move the market average
 * far more than a 1,200 SF suite, which a plain mean gets wrong.
 */
export function weightedMean(pairs: Array<{ value: number | null; weight: number | null }>): number | null {
  let weightedTotal = 0
  let weightTotal = 0
  let sawUnweighted = false
  let plainTotal = 0
  let plainCount = 0

  for (const { value, weight } of pairs) {
    if (value === null || !Number.isFinite(value)) continue
    plainTotal += value
    plainCount++
    if (weight === null || !Number.isFinite(weight) || weight <= 0) {
      sawUnweighted = true
      continue
    }
    weightedTotal += value * weight
    weightTotal += weight
  }

  if (weightTotal > 0) return weightedTotal / weightTotal
  // No usable weights anywhere; fall back to the plain average rather than showing nothing.
  return sawUnweighted && plainCount > 0 ? plainTotal / plainCount : null
}

function dateRangeLabel(deals: LeaseDeal[]): string {
  const times = deals
    .map((d) => d.leaseDate?.getTime())
    .filter((t): t is number => typeof t === 'number' && Number.isFinite(t))
  if (times.length === 0) return 'No lease dates'

  const fmt = (t: number) =>
    new Date(t).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  const min = fmt(Math.min(...times))
  const max = fmt(Math.max(...times))
  return min === max ? min : `${min} to ${max}`
}

export function computeKpis(deals: LeaseDeal[]): Kpis {
  const mapped = deals.filter((d) => d.lat !== null && d.lon !== null)
  const sites = new Set(mapped.map((d) => `${(d.lat as number).toFixed(5)},${(d.lon as number).toFixed(5)}`))

  return {
    dealCount: deals.length,
    mappedCount: mapped.length,
    siteCount: sites.size,
    totalArea: sum(deals.map((d) => d.areaLeased)),
    medianArea: median(deals.map((d) => d.areaLeased)),
    weightedBaseRent: weightedMean(deals.map((d) => ({ value: d.baseRentAnnual, weight: d.areaLeased }))),
    averageBaseRent: mean(deals.map((d) => d.baseRentAnnual)),
    averageTerm: mean(deals.map((d) => d.termMonths)),
    averageFreeRent: mean(deals.map((d) => d.freeRent)),
    averageTi: mean(deals.map((d) => d.tiAllowance)),
    averageOpex: mean(deals.map((d) => d.opexAnnual)),
    dateRangeLabel: dateRangeLabel(deals),
  }
}

// ------------------------------------------------------------------ grouping

export interface CategoryDatum {
  name: string
  deals: number
  area: number
  avgRent: number | null
  avgTerm: number | null
}

const UNSPECIFIED = 'Not specified'

function groupBy(deals: LeaseDeal[], pick: (d: LeaseDeal) => string): Map<string, LeaseDeal[]> {
  const map = new Map<string, LeaseDeal[]>()
  for (const deal of deals) {
    const key = pick(deal).trim() || UNSPECIFIED
    const bucket = map.get(key)
    if (bucket) bucket.push(deal)
    else map.set(key, [deal])
  }
  return map
}

function toCategoryData(map: Map<string, LeaseDeal[]>): CategoryDatum[] {
  return [...map.entries()].map(([name, group]) => ({
    name,
    deals: group.length,
    area: sum(group.map((d) => d.areaLeased)) ?? 0,
    avgRent: weightedMean(group.map((d) => ({ value: d.baseRentAnnual, weight: d.areaLeased }))),
    avgTerm: mean(group.map((d) => d.termMonths)),
  }))
}

export type CategorySort = 'deals' | 'area' | 'avgRent'

export function categoryBreakdown(
  deals: LeaseDeal[],
  pick: (d: LeaseDeal) => string,
  options: { limit?: number; sortBy?: CategorySort; dropUnspecified?: boolean } = {},
): CategoryDatum[] {
  const { limit = 10, sortBy = 'deals', dropUnspecified = false } = options

  let data = toCategoryData(groupBy(deals, pick))
  if (dropUnspecified) data = data.filter((d) => d.name !== UNSPECIFIED)

  data.sort((a, b) => {
    if (sortBy === 'avgRent') return (b.avgRent ?? -Infinity) - (a.avgRent ?? -Infinity)
    if (sortBy === 'area') return b.area - a.area
    return b.deals - a.deals || b.area - a.area
  })

  if (data.length <= limit) return data

  const head = data.slice(0, limit)
  const tail = data.slice(limit)
  const tailDeals = tail.reduce((n, d) => n + d.deals, 0)
  const tailArea = tail.reduce((n, d) => n + d.area, 0)

  head.push({
    name: `${OTHER_LABEL} (${tail.length})`,
    deals: tailDeals,
    area: tailArea,
    avgRent: null,
    avgTerm: null,
  })
  return head
}

// -------------------------------------------------------------- time buckets

export type TimeGrain = 'month' | 'quarter' | 'year'

export interface TimeBucket {
  key: string
  label: string
  sort: number
  deals: number
  area: number
  avgRent: number | null
  byType: Record<string, number>
  /** Recharts reads rows generically; the index signature keeps its data prop happy. */
  [extra: string]: unknown
}

function bucketKey(date: Date, grain: TimeGrain): { key: string; label: string; sort: number } {
  const year = date.getFullYear()
  if (grain === 'year') return { key: String(year), label: String(year), sort: year * 100 }
  if (grain === 'quarter') {
    const q = Math.floor(date.getMonth() / 3) + 1
    return { key: `${year}-Q${q}`, label: `Q${q} ${String(year).slice(2)}`, sort: year * 100 + q }
  }
  const month = date.getMonth()
  return {
    key: `${year}-${String(month + 1).padStart(2, '0')}`,
    label: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    sort: year * 100 + month + 1,
  }
}

/** Pick a grain that yields a readable number of columns for the span in the data. */
export function chooseGrain(deals: LeaseDeal[]): TimeGrain {
  const times = deals
    .map((d) => d.leaseDate?.getTime())
    .filter((t): t is number => typeof t === 'number')
  if (times.length < 2) return 'quarter'

  const spanMonths = (Math.max(...times) - Math.min(...times)) / (1000 * 60 * 60 * 24 * 30.44)
  if (spanMonths <= 30) return 'month'
  if (spanMonths <= 120) return 'quarter'
  return 'year'
}

/**
 * Leasing activity over time, optionally split by a categorical dimension.
 * `stackKeys` is the ordered set of series present, with everything past the cap
 * folded into a single neutral bucket.
 */
export function timeSeries(
  deals: LeaseDeal[],
  grain: TimeGrain,
  splitBy: ((d: LeaseDeal) => string) | null,
  maxSeries = 5,
): { buckets: TimeBucket[]; stackKeys: string[] } {
  const withDates = deals.filter((d) => d.leaseDate instanceof Date)

  let stackKeys: string[] = []
  let mapToSeries: (d: LeaseDeal) => string = () => 'All deals'

  if (splitBy) {
    const totals = new Map<string, number>()
    for (const deal of withDates) {
      const key = splitBy(deal).trim() || UNSPECIFIED
      totals.set(key, (totals.get(key) ?? 0) + (deal.areaLeased ?? 0) + 1)
    }
    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
    const keep = new Set(ranked.slice(0, maxSeries))
    stackKeys = ranked.slice(0, maxSeries)
    if (ranked.length > maxSeries) stackKeys.push(OTHER_LABEL)
    mapToSeries = (d) => {
      const key = splitBy(d).trim() || UNSPECIFIED
      return keep.has(key) ? key : OTHER_LABEL
    }
  } else {
    stackKeys = ['All deals']
  }

  const buckets = new Map<string, TimeBucket & { rentPairs: Array<{ value: number | null; weight: number | null }> }>()

  for (const deal of withDates) {
    const { key, label, sort } = bucketKey(deal.leaseDate as Date, grain)
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { key, label, sort, deals: 0, area: 0, avgRent: null, byType: {}, rentPairs: [] }
      for (const s of stackKeys) bucket.byType[s] = 0
      buckets.set(key, bucket)
    }

    bucket.deals++
    bucket.area += deal.areaLeased ?? 0
    bucket.rentPairs.push({ value: deal.baseRentAnnual, weight: deal.areaLeased })

    const series = mapToSeries(deal)
    bucket.byType[series] = (bucket.byType[series] ?? 0) + (deal.areaLeased ?? 0)
  }

  const list = [...buckets.values()]
    .sort((a, b) => a.sort - b.sort)
    .map(({ rentPairs, ...bucket }) => ({ ...bucket, avgRent: weightedMean(rentPairs) }))

  return { buckets: list, stackKeys }
}

// ---------------------------------------------------------------- histogram

export interface HistogramBin {
  label: string
  count: number
  from: number
  to: number
}

/** Round a bin width to something a person would choose: 1, 2, 2.5, 5 or 10 times a power of ten. */
function niceStep(raw: number): number {
  if (raw <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const normalized = raw / magnitude
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10
  return step * magnitude
}

export function histogram(
  values: (number | null)[],
  targetBins: number,
  formatEdge: (n: number) => string,
): HistogramBin[] {
  const nums = finite(values)
  if (nums.length === 0) return []

  const min = Math.min(...nums)
  const max = Math.max(...nums)
  if (min === max) {
    return [{ label: formatEdge(min), count: nums.length, from: min, to: max }]
  }

  const step = niceStep((max - min) / targetBins)
  const start = Math.floor(min / step) * step
  const binCount = Math.max(1, Math.min(40, Math.ceil((max - start) / step)))

  const bins: HistogramBin[] = Array.from({ length: binCount }, (_, i) => {
    const from = start + i * step
    const to = from + step
    return { label: `${formatEdge(from)} to ${formatEdge(to)}`, count: 0, from, to }
  })

  for (const n of nums) {
    let index = Math.floor((n - start) / step)
    if (index >= binCount) index = binCount - 1
    if (index < 0) index = 0
    bins[index].count++
  }

  return bins
}

// ------------------------------------------------------------ data coverage

export interface CoverageRow {
  label: string
  present: number
  total: number
}

/** How complete the upload is, field by field. Blank inputs are the usual cause of odd charts. */
export function computeCoverage(deals: LeaseDeal[]): CoverageRow[] {
  const total = deals.length
  const countText = (pick: (d: LeaseDeal) => string) => deals.filter((d) => pick(d).trim() !== '').length
  const countNum = (pick: (d: LeaseDeal) => number | null) =>
    deals.filter((d) => {
      const v = pick(d)
      return v !== null && Number.isFinite(v)
    }).length

  return [
    { label: 'Mapped location', present: deals.filter((d) => d.lat !== null && d.lon !== null).length, total },
    { label: 'Lease date', present: deals.filter((d) => d.leaseDate !== null).length, total },
    { label: 'Execution date', present: deals.filter((d) => d.executionDate !== null).length, total },
    { label: 'Term length', present: countNum((d) => d.termMonths), total },
    { label: 'Area leased', present: countNum((d) => d.areaLeased), total },
    { label: 'Base rent', present: countNum((d) => d.baseRent), total },
    { label: 'OpEx', present: countNum((d) => d.opex), total },
    {
      label: 'Escalation',
      present: deals.filter((d) => resolveEscalation(d) !== '').length,
      total,
    },
    { label: 'Free rent', present: countNum((d) => d.freeRent), total },
    { label: 'TI allowance', present: countNum((d) => d.tiAllowance), total },
    { label: 'Lease type', present: countText((d) => d.leaseType), total },
    { label: 'Property subtype', present: countText((d) => d.propertySubtype), total },
    { label: 'Lessor', present: countText((d) => d.lessor), total },
  ]
}
