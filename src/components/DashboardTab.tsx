import { useMemo } from 'react'
import { useApp } from '../state/AppContext'
import {
  categoryBreakdown,
  chooseGrain,
  computeCoverage,
  computeKpis,
  histogram,
  timeSeries,
} from '../lib/stats'
import { fmtArea, fmtCompact, fmtMoney, fmtNumber, fmtShortMonths, fmtYears, EMPTY } from '../lib/format'
import { describeActiveFilters } from '../lib/filters'
import { DataTable } from './DataTable'
import {
  CategoryBars,
  ChartFrame,
  ChartLegend,
  Histogram,
  StackedColumns,
  TrendLine,
  useChartTheme,
} from './charts/ChartKit'
import { IconFilter, IconX } from './Icons'

interface KpiProps {
  label: string
  value: string
  note?: string
}

function Kpi({ label, value, note }: KpiProps) {
  return (
    <div className="kpi">
      <span className="kpi__label">{label}</span>
      <span className="kpi__value">{value}</span>
      {note && <span className="kpi__note">{note}</span>}
    </div>
  )
}

const GRAIN_LABEL = { month: 'month', quarter: 'quarter', year: 'year' } as const

interface DashboardTabProps {
  railOpen: boolean
  onOpenRail: () => void
}

export function DashboardTab({ railOpen, onOpenRail }: DashboardTabProps) {
  const { deals, filtered, theme, filters, setFilters, resetFilters } = useApp()
  const chartTheme = useChartTheme(theme === 'dark')

  const kpis = useMemo(() => computeKpis(filtered), [filtered])
  const grain = useMemo(() => chooseGrain(filtered), [filtered])

  const activity = useMemo(
    () => timeSeries(filtered, grain, (d) => d.leaseType, 5),
    [filtered, grain],
  )

  const byCity = useMemo(
    () => categoryBreakdown(filtered, (d) => d.city, { limit: 10, sortBy: 'area', dropUnspecified: true }),
    [filtered],
  )
  const byLeaseType = useMemo(
    () => categoryBreakdown(filtered, (d) => d.leaseType, { limit: 8, sortBy: 'deals' }),
    [filtered],
  )
  const bySubtype = useMemo(
    () => categoryBreakdown(filtered, (d) => d.propertySubtype, { limit: 8, sortBy: 'avgRent', dropUnspecified: true }),
    [filtered],
  )
  const byLessor = useMemo(
    () => categoryBreakdown(filtered, (d) => d.lessor, { limit: 10, sortBy: 'area', dropUnspecified: true }),
    [filtered],
  )

  const areaBins = useMemo(
    () => histogram(filtered.map((d) => d.areaLeased), 12, (n) => fmtCompact(n)),
    [filtered],
  )
  const termBins = useMemo(
    () => histogram(filtered.map((d) => d.termMonths), 10, (n) => String(Math.round(n))),
    [filtered],
  )

  const coverage = useMemo(() => computeCoverage(filtered), [filtered])
  const chips = describeActiveFilters(filters)

  const rentTrend = activity.buckets.filter((b) => b.avgRent !== null)
  const grainWord = GRAIN_LABEL[grain]

  return (
    <div className="dash">
      <div className="dash__inner">
        <div className="dash__head">
          <div>
            <h1 className="dash__title">Healthcare &amp; Life Sciences lease comps</h1>
            <div className="dash__sub">
              {filtered.length.toLocaleString('en-US')} of {deals.length.toLocaleString('en-US')} deals ·{' '}
              {kpis.dateRangeLabel}
              {kpis.siteCount > 0 && ` · ${kpis.siteCount.toLocaleString('en-US')} mapped locations`}
            </div>
          </div>

          <div className="row">
            {!railOpen && (
              <button type="button" className="btn" onClick={onOpenRail}>
                <IconFilter size={14} />
                Filters
              </button>
            )}
            {chips.length > 0 && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={resetFilters}>
                Clear all filters
              </button>
            )}
          </div>
        </div>

        {chips.length > 0 && (
          <div className="chiprow">
            {chips.map((chip) => (
              <span key={chip.id} className="chip">
                <span className="chip__label">{chip.label}</span>
                <button
                  type="button"
                  className="chip__x"
                  onClick={() => setFilters(chip.clear)}
                  aria-label={`Remove filter ${chip.label}`}
                >
                  <IconX size={11} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="kpis">
          <Kpi label="Deals" value={fmtNumber(kpis.dealCount)} note={`${fmtNumber(kpis.mappedCount)} on the map`} />
          <Kpi
            label="Total area leased"
            value={kpis.totalArea === null ? EMPTY : fmtCompact(kpis.totalArea)}
            note={kpis.medianArea === null ? undefined : `Median ${fmtArea(kpis.medianArea)}`}
          />
          <Kpi
            label="Base rent"
            value={kpis.weightedBaseRent === null ? EMPTY : `${fmtMoney(kpis.weightedBaseRent)} /SF`}
            note="Annual, weighted by area leased"
          />
          <Kpi
            label="Average term"
            value={fmtYears(kpis.averageTerm)}
            note={kpis.averageTerm === null ? 'No term data' : fmtShortMonths(kpis.averageTerm)}
          />
          <Kpi
            label="Average free rent"
            value={kpis.averageFreeRent === null ? EMPTY : `${kpis.averageFreeRent.toFixed(1)} mos`}
            note="Across deals that report it"
          />
          <Kpi
            label="Average TI"
            value={kpis.averageTi === null ? EMPTY : `${fmtMoney(kpis.averageTi)} /SF`}
            note={kpis.averageOpex === null ? undefined : `OpEx ${fmtMoney(kpis.averageOpex)} /SF/Yr`}
          />
        </div>

        <div className="charts">
          <ChartFrame
            title={`Area leased by ${grainWord}`}
            subtitle="Square feet, stacked by lease type"
            wide
            height={280}
            empty={activity.buckets.length === 0}
            emptyLabel="No lease dates in the current selection, so activity cannot be placed on a timeline."
            footer={<ChartLegend keys={activity.stackKeys} dark={chartTheme.dark} />}
          >
            <StackedColumns
              data={activity.buckets}
              stackKeys={activity.stackKeys}
              theme={chartTheme}
              formatValue={(n) => `${fmtCompact(n)} SF`}
              axisFormat={(n) => fmtCompact(n)}
              extraTooltipRows={(row) => [
                { label: 'Deals', value: fmtNumber(Number(row.deals ?? 0)) },
                {
                  label: 'Base rent',
                  value: row.avgRent === null || row.avgRent === undefined ? EMPTY : `${fmtMoney(Number(row.avgRent))} /SF`,
                },
              ]}
            />
          </ChartFrame>

          <ChartFrame
            title={`Base rent by ${grainWord}`}
            subtitle="Annual $/SF, weighted by area leased"
            height={250}
            empty={rentTrend.length < 2}
            emptyLabel="At least two periods with both a lease date and a base rent are needed for a trend."
          >
            <TrendLine
              data={rentTrend}
              dataKey="avgRent"
              theme={chartTheme}
              formatValue={(n) => fmtMoney(n, n >= 100 ? 0 : 2)}
              tooltipLabel="Base rent"
              extraTooltipRows={(row) => [
                { label: 'Deals', value: fmtNumber(Number(row.deals ?? 0)) },
                { label: 'Area', value: `${fmtCompact(Number(row.area ?? 0))} SF` },
              ]}
            />
          </ChartFrame>

          <ChartFrame
            title="Deals by lease type"
            subtitle="Deal count"
            height={250}
            empty={byLeaseType.length === 0}
            emptyLabel="No lease type column is mapped."
          >
            <CategoryBars
              data={byLeaseType.map((d) => ({ ...d, value: d.deals }))}
              theme={chartTheme}
              formatValue={(n) => fmtNumber(n)}
              tooltipRows={(row) => [
                { label: 'Deals', value: fmtNumber(Number(row.deals ?? 0)) },
                { label: 'Area', value: `${fmtCompact(Number(row.area ?? 0))} SF` },
                {
                  label: 'Base rent',
                  value:
                    row.avgRent === null || row.avgRent === undefined
                      ? EMPTY
                      : `${fmtMoney(Number(row.avgRent))} /SF`,
                },
              ]}
            />
          </ChartFrame>

          <ChartFrame
            title="Top cities by area leased"
            subtitle="Square feet"
            height={280}
            empty={byCity.length === 0}
            emptyLabel="No city column is mapped."
          >
            <CategoryBars
              data={byCity.map((d) => ({ ...d, value: d.area }))}
              theme={chartTheme}
              formatValue={(n) => fmtCompact(n)}
              tooltipRows={(row) => [
                { label: 'Area', value: fmtArea(Number(row.area ?? 0)) },
                { label: 'Deals', value: fmtNumber(Number(row.deals ?? 0)) },
                {
                  label: 'Base rent',
                  value:
                    row.avgRent === null || row.avgRent === undefined
                      ? EMPTY
                      : `${fmtMoney(Number(row.avgRent))} /SF`,
                },
              ]}
            />
          </ChartFrame>

          <ChartFrame
            title="Base rent by property subtype"
            subtitle="Annual $/SF, weighted by area leased"
            height={280}
            empty={bySubtype.filter((d) => d.avgRent !== null).length === 0}
            emptyLabel="No property subtype column is mapped, or no subtype has a base rent."
          >
            <CategoryBars
              data={bySubtype.filter((d) => d.avgRent !== null).map((d) => ({ ...d, value: d.avgRent as number }))}
              theme={chartTheme}
              formatValue={(n) => fmtMoney(n, n >= 100 ? 0 : 2)}
              tooltipRows={(row) => [
                {
                  label: 'Base rent',
                  value:
                    row.avgRent === null || row.avgRent === undefined
                      ? EMPTY
                      : `${fmtMoney(Number(row.avgRent))} /SF/Yr`,
                },
                { label: 'Deals', value: fmtNumber(Number(row.deals ?? 0)) },
                { label: 'Area', value: `${fmtCompact(Number(row.area ?? 0))} SF` },
              ]}
            />
          </ChartFrame>

          <ChartFrame
            title="Top lessors by area leased"
            subtitle="Square feet"
            height={280}
            empty={byLessor.length === 0}
            emptyLabel="No lessor column is mapped."
          >
            <CategoryBars
              data={byLessor.map((d) => ({ ...d, value: d.area }))}
              theme={chartTheme}
              formatValue={(n) => fmtCompact(n)}
              labelWidth={148}
              tooltipRows={(row) => [
                { label: 'Area', value: fmtArea(Number(row.area ?? 0)) },
                { label: 'Deals', value: fmtNumber(Number(row.deals ?? 0)) },
              ]}
            />
          </ChartFrame>

          <ChartFrame
            title="Area leased distribution"
            subtitle="Deals per size band"
            height={250}
            empty={areaBins.length === 0}
            emptyLabel="No area values in the current selection."
          >
            <Histogram data={areaBins} theme={chartTheme} unitLabel="SF" />
          </ChartFrame>

          <ChartFrame
            title="Term length distribution"
            subtitle="Deals per term band"
            height={250}
            empty={termBins.length === 0}
            emptyLabel="No term values in the current selection."
          >
            <Histogram data={termBins} theme={chartTheme} unitLabel="months" />
          </ChartFrame>
        </div>

        <div className="card">
          <div className="card__header">
            <div>
              <div className="card__title">Field coverage</div>
              <div className="card__subtitle">
                How many of the {filtered.length.toLocaleString('en-US')} matching rows carry a value for
                each field. Gaps here explain empty popup rows and thin charts.
              </div>
            </div>
          </div>
          <div className="card__body">
            <div className="coverage">
              {coverage.map((row) => {
                const pct = row.total === 0 ? 0 : Math.round((row.present / row.total) * 100)
                return (
                  <div className="coverage__row" key={row.label}>
                    <span className="coverage__label" title={row.label}>
                      {row.label}
                    </span>
                    <span
                      className="coverage__bar"
                      role="img"
                      aria-label={`${row.label}: ${pct}% of rows populated`}
                    >
                      <span className="coverage__fill" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="coverage__pct">{pct}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <DataTable />
      </div>
    </div>
  )
}
