import {
  categoryBreakdown,
  chooseGrain,
  computeCoverage,
  computeKpis,
  histogram,
  signingStats,
  timeSeries,
  SIGNED,
  type CategoryDatum,
  type CoverageRow,
  type HistogramBin,
  type Kpis,
  type SigningStats,
  type TimeBucket,
  type TimeGrain,
} from './stats'
import { fmtArea, fmtCompact, fmtDate, fmtMoney, fmtNumber, fmtShortMonths, fmtYears, EMPTY } from './format'
import type { LeaseDeal } from '../types'

/**
 * Everything the dashboard shows, computed once.
 *
 * The dashboard on screen, the PDF report and the PowerPoint deck all draw from this one
 * model and from the specs below, so a number, a title or an empty-state message cannot read
 * one way on screen and another way in an exported file.
 */

export interface DashboardModel {
  totalDeals: number
  matching: number
  kpis: Kpis
  grain: TimeGrain
  activity: { buckets: TimeBucket[]; stackKeys: string[] }
  rentTrend: TimeBucket[]
  byLeaseType: CategoryDatum[]
  byCity: CategoryDatum[]
  bySubtype: CategoryDatum[]
  byLessor: CategoryDatum[]
  areaBins: HistogramBin[]
  termBins: HistogramBin[]
  signing: SigningStats
  signedGrain: TimeGrain
  signedActivity: { buckets: TimeBucket[]; stackKeys: string[] }
  lagBins: HistogramBin[]
  coverage: CoverageRow[]
}

export function buildDashboardModel(deals: LeaseDeal[], filtered: LeaseDeal[]): DashboardModel {
  const grain = chooseGrain(filtered)
  const activity = timeSeries(filtered, grain, (d) => d.leaseType, 5)
  const signing = signingStats(filtered)
  const signedGrain = chooseGrain(filtered, SIGNED)

  return {
    totalDeals: deals.length,
    matching: filtered.length,
    kpis: computeKpis(filtered),
    grain,
    activity,
    rentTrend: activity.buckets.filter((b) => b.avgRent !== null),
    byLeaseType: categoryBreakdown(filtered, (d) => d.leaseType, { limit: 8, sortBy: 'deals' }),
    byCity: categoryBreakdown(filtered, (d) => d.city, { limit: 10, sortBy: 'area', dropUnspecified: true }),
    bySubtype: categoryBreakdown(filtered, (d) => d.propertySubtype, {
      limit: 8,
      sortBy: 'avgRent',
      dropUnspecified: true,
    }),
    byLessor: categoryBreakdown(filtered, (d) => d.lessor, { limit: 10, sortBy: 'area', dropUnspecified: true }),
    areaBins: histogram(filtered.map((d) => d.areaLeased), 12, (n) => fmtCompact(n)),
    termBins: histogram(filtered.map((d) => d.termMonths), 10, (n) => String(Math.round(n))),
    signing,
    signedGrain,
    signedActivity: timeSeries(filtered, signedGrain, (d) => d.leaseType, 5, { dateOf: SIGNED, measure: 'deals' }),
    lagBins: histogram(signing.lagDays, 12, (n) => String(Math.round(n))),
    coverage: computeCoverage(filtered),
  }
}

// --------------------------------------------------------------------- KPIs

export interface KpiSpec {
  id: string
  label: string
  value: string
  note?: string
}

/** Lead time reads better in months once it passes a couple of them, and can be negative. */
export function fmtLagDays(days: number): string {
  const magnitude = Math.abs(days)
  if (magnitude < 62) return `${Math.round(days)} days`
  const months = days / 30.44
  return `${months.toFixed(1)} mos`
}

export function headlineKpis(model: DashboardModel): KpiSpec[] {
  const k = model.kpis
  return [
    { id: 'deals', label: 'Deals', value: fmtNumber(k.dealCount), note: `${fmtNumber(k.mappedCount)} on the map` },
    {
      id: 'area',
      label: 'Total area leased',
      value: k.totalArea === null ? EMPTY : fmtCompact(k.totalArea),
      note: k.medianArea === null ? undefined : `Median ${fmtArea(k.medianArea)}`,
    },
    {
      id: 'rent',
      label: 'Base rent',
      value: k.weightedBaseRent === null ? EMPTY : `${fmtMoney(k.weightedBaseRent)} /SF`,
      note: 'Annual, weighted by area leased',
    },
    {
      id: 'term',
      label: 'Average term',
      value: fmtYears(k.averageTerm),
      note: k.averageTerm === null ? 'No term data' : fmtShortMonths(k.averageTerm),
    },
    {
      id: 'freeRent',
      label: 'Average free rent',
      value: k.averageFreeRent === null ? EMPTY : `${k.averageFreeRent.toFixed(1)} mos`,
      note: 'Across deals that report it',
    },
    {
      id: 'ti',
      label: 'Average TI',
      value: k.averageTi === null ? EMPTY : `${fmtMoney(k.averageTi)} /SF`,
      note: k.averageOpex === null ? undefined : `OpEx ${fmtMoney(k.averageOpex)} /SF/Yr`,
    },
  ]
}

export function signingKpis(model: DashboardModel): KpiSpec[] {
  const s = model.signing
  return [
    {
      id: 'signed',
      label: 'Deals signed',
      value: fmtNumber(s.signedCount),
      note: s.signedFrom && s.signedTo ? `${fmtDate(s.signedFrom)} to ${fmtDate(s.signedTo)}` : 'No signed dates mapped',
    },
    {
      id: 'lag',
      label: 'Signing to commencement',
      value: s.medianLagDays === null ? EMPTY : fmtLagDays(s.medianLagDays),
      note:
        s.pairedCount === 0
          ? 'Needs both a signed date and a lease date'
          : `Median across ${fmtNumber(s.pairedCount)} deals with both dates`,
    },
    {
      id: 'late',
      label: 'Signed after commencement',
      value: s.pairedCount === 0 ? EMPTY : fmtNumber(s.signedLateCount),
      note: 'Papered after the tenant took the space',
    },
  ]
}

/** The sentence under the Signed date heading, after its fixed opening. */
export function signingCoverageNote(model: DashboardModel): string {
  return model.signing.signedCount === 0
    ? 'No signed dates are mapped in the current selection.'
    : `${fmtNumber(model.signing.signedCount)} of ${fmtNumber(model.matching)} matching deals carry one.`
}

/** "74 of 74 deals · Jan 2022 to Oct 2025 · 32 mapped locations" */
export function selectionLine(model: DashboardModel): string {
  const parts = [
    `${model.matching.toLocaleString('en-US')} of ${model.totalDeals.toLocaleString('en-US')} deals`,
    model.kpis.dateRangeLabel,
  ]
  if (model.kpis.siteCount > 0) parts.push(`${model.kpis.siteCount.toLocaleString('en-US')} mapped locations`)
  return parts.join(' · ')
}

export interface CoverageSpec {
  label: string
  pct: number
}

export function coverageRows(model: DashboardModel): CoverageSpec[] {
  return model.coverage.map((row) => ({
    label: row.label,
    pct: row.total === 0 ? 0 : Math.round((row.present / row.total) * 100),
  }))
}

// ------------------------------------------------------------------- charts

export type ChartId =
  | 'areaByPeriod'
  | 'rentByPeriod'
  | 'dealsByLeaseType'
  | 'topCities'
  | 'rentBySubtype'
  | 'topLessors'
  | 'areaDistribution'
  | 'termDistribution'
  | 'signedByPeriod'
  | 'signingLag'

/** The commencement charts, in dashboard order, and the two that belong to the signed date section. */
export const MAIN_CHART_IDS: ChartId[] = [
  'areaByPeriod',
  'rentByPeriod',
  'dealsByLeaseType',
  'topCities',
  'rentBySubtype',
  'topLessors',
  'areaDistribution',
  'termDistribution',
]
export const SIGNED_CHART_IDS: ChartId[] = ['signedByPeriod', 'signingLag']

type TooltipRows = (row: Record<string, unknown>) => Array<{ label: string; value: string }>

interface ChartSpecBase {
  id: ChartId
  title: string
  subtitle: string
  /** Spans the full width of the dashboard grid and of an exported page. */
  wide: boolean
  /** Height on screen at comfortable density, in pixels. */
  height: number
  empty: boolean
  emptyLabel: string
  /** Excel number format for the value axis in an exported deck. */
  numberFormat: string
}

export interface StackedSpec extends ChartSpecBase {
  kind: 'stacked'
  data: TimeBucket[]
  stackKeys: string[]
  formatValue: (n: number) => string
  axisFormat: (n: number) => string
  wholeNumbers: boolean
  extraTooltipRows: TooltipRows
}

export interface TrendSpec extends ChartSpecBase {
  kind: 'trend'
  data: TimeBucket[]
  dataKey: 'avgRent'
  formatValue: (n: number) => string
  tooltipLabel: string
  extraTooltipRows: TooltipRows
}

export interface BarsDatum {
  name: string
  value: number
  [key: string]: unknown
}

export interface BarsSpec extends ChartSpecBase {
  kind: 'bars'
  data: BarsDatum[]
  formatValue: (n: number) => string
  tooltipRows: TooltipRows
  labelWidth?: number
}

export interface HistogramSpec extends ChartSpecBase {
  kind: 'histogram'
  data: HistogramBin[]
  unitLabel: string
}

export type ChartSpec = StackedSpec | TrendSpec | BarsSpec | HistogramSpec

const GRAIN_WORD: Record<TimeGrain, string> = { month: 'month', quarter: 'quarter', year: 'year' }

const rentText = (row: Record<string, unknown>, suffix = ' /SF') =>
  row.avgRent === null || row.avgRent === undefined ? EMPTY : `${fmtMoney(Number(row.avgRent))}${suffix}`

const rentAxis = (n: number) => fmtMoney(n, n >= 100 ? 0 : 2)

export function chartSpecs(model: DashboardModel): Record<ChartId, ChartSpec> {
  const subtypeWithRent = model.bySubtype.filter((d) => d.avgRent !== null)

  return {
    areaByPeriod: {
      id: 'areaByPeriod',
      kind: 'stacked',
      title: `Area leased by ${GRAIN_WORD[model.grain]}`,
      subtitle: 'Square feet, stacked by lease type',
      wide: true,
      height: 280,
      empty: model.activity.buckets.length === 0,
      emptyLabel: 'No lease dates in the current selection, so activity cannot be placed on a timeline.',
      numberFormat: '#,##0',
      data: model.activity.buckets,
      stackKeys: model.activity.stackKeys,
      formatValue: (n) => `${fmtCompact(n)} SF`,
      axisFormat: (n) => fmtCompact(n),
      wholeNumbers: false,
      extraTooltipRows: (row) => [
        { label: 'Deals', value: fmtNumber(Number(row.deals ?? 0)) },
        { label: 'Base rent', value: rentText(row) },
      ],
    },
    rentByPeriod: {
      id: 'rentByPeriod',
      kind: 'trend',
      title: `Base rent by ${GRAIN_WORD[model.grain]}`,
      subtitle: 'Annual $/SF, weighted by area leased',
      wide: false,
      height: 250,
      empty: model.rentTrend.length < 2,
      emptyLabel: 'At least two periods with both a lease date and a base rent are needed for a trend.',
      numberFormat: '$#,##0.00',
      data: model.rentTrend,
      dataKey: 'avgRent',
      formatValue: rentAxis,
      tooltipLabel: 'Base rent',
      extraTooltipRows: (row) => [
        { label: 'Deals', value: fmtNumber(Number(row.deals ?? 0)) },
        { label: 'Area', value: `${fmtCompact(Number(row.area ?? 0))} SF` },
      ],
    },
    dealsByLeaseType: {
      id: 'dealsByLeaseType',
      kind: 'bars',
      title: 'Deals by lease type',
      subtitle: 'Deal count',
      wide: false,
      height: 250,
      empty: model.byLeaseType.length === 0,
      emptyLabel: 'No lease type column is mapped.',
      numberFormat: '#,##0',
      data: model.byLeaseType.map((d) => ({ ...d, value: d.deals })),
      formatValue: (n) => fmtNumber(n),
      tooltipRows: (row) => [
        { label: 'Deals', value: fmtNumber(Number(row.deals ?? 0)) },
        { label: 'Area', value: `${fmtCompact(Number(row.area ?? 0))} SF` },
        { label: 'Base rent', value: rentText(row) },
      ],
    },
    topCities: {
      id: 'topCities',
      kind: 'bars',
      title: 'Top cities by area leased',
      subtitle: 'Square feet',
      wide: false,
      height: 280,
      empty: model.byCity.length === 0,
      emptyLabel: 'No city column is mapped.',
      numberFormat: '#,##0',
      data: model.byCity.map((d) => ({ ...d, value: d.area })),
      formatValue: (n) => fmtCompact(n),
      tooltipRows: (row) => [
        { label: 'Area', value: fmtArea(Number(row.area ?? 0)) },
        { label: 'Deals', value: fmtNumber(Number(row.deals ?? 0)) },
        { label: 'Base rent', value: rentText(row) },
      ],
    },
    rentBySubtype: {
      id: 'rentBySubtype',
      kind: 'bars',
      title: 'Base rent by property subtype',
      subtitle: 'Annual $/SF, weighted by area leased',
      wide: false,
      height: 280,
      empty: subtypeWithRent.length === 0,
      emptyLabel: 'No property subtype column is mapped, or no subtype has a base rent.',
      numberFormat: '$#,##0.00',
      data: subtypeWithRent.map((d) => ({ ...d, value: d.avgRent as number })),
      formatValue: rentAxis,
      tooltipRows: (row) => [
        { label: 'Base rent', value: rentText(row, ' /SF/Yr') },
        { label: 'Deals', value: fmtNumber(Number(row.deals ?? 0)) },
        { label: 'Area', value: `${fmtCompact(Number(row.area ?? 0))} SF` },
      ],
    },
    topLessors: {
      id: 'topLessors',
      kind: 'bars',
      title: 'Top lessors by area leased',
      subtitle: 'Square feet',
      wide: false,
      height: 280,
      empty: model.byLessor.length === 0,
      emptyLabel: 'No lessor column is mapped.',
      numberFormat: '#,##0',
      data: model.byLessor.map((d) => ({ ...d, value: d.area })),
      formatValue: (n) => fmtCompact(n),
      labelWidth: 148,
      tooltipRows: (row) => [
        { label: 'Area', value: fmtArea(Number(row.area ?? 0)) },
        { label: 'Deals', value: fmtNumber(Number(row.deals ?? 0)) },
      ],
    },
    areaDistribution: {
      id: 'areaDistribution',
      kind: 'histogram',
      title: 'Area leased distribution',
      subtitle: 'Deals per size band',
      wide: false,
      height: 250,
      empty: model.areaBins.length === 0,
      emptyLabel: 'No area values in the current selection.',
      numberFormat: '#,##0',
      data: model.areaBins,
      unitLabel: 'SF',
    },
    termDistribution: {
      id: 'termDistribution',
      kind: 'histogram',
      title: 'Term length distribution',
      subtitle: 'Deals per term band',
      wide: false,
      height: 250,
      empty: model.termBins.length === 0,
      emptyLabel: 'No term values in the current selection.',
      numberFormat: '#,##0',
      data: model.termBins,
      unitLabel: 'months',
    },
    signedByPeriod: {
      id: 'signedByPeriod',
      kind: 'stacked',
      title: `Deals signed by ${GRAIN_WORD[model.signedGrain]}`,
      subtitle: 'Deal count, stacked by lease type',
      wide: true,
      height: 280,
      empty: model.signedActivity.buckets.length === 0,
      emptyLabel: 'No signed dates in the current selection, so signings cannot be placed on a timeline.',
      numberFormat: '#,##0',
      data: model.signedActivity.buckets,
      stackKeys: model.signedActivity.stackKeys,
      formatValue: (n) => `${fmtNumber(n)} ${n === 1 ? 'deal' : 'deals'}`,
      axisFormat: (n) => fmtNumber(n),
      wholeNumbers: true,
      extraTooltipRows: (row) => [{ label: 'Area signed', value: `${fmtCompact(Number(row.area ?? 0))} SF` }],
    },
    signingLag: {
      id: 'signingLag',
      kind: 'histogram',
      title: 'Signing to commencement',
      subtitle: 'Deals per lead-time band, in days',
      wide: false,
      height: 250,
      empty: model.lagBins.length === 0,
      emptyLabel: 'This needs deals carrying both a signed date and a lease date.',
      numberFormat: '#,##0',
      data: model.lagBins,
      unitLabel: 'days',
    },
  }
}
