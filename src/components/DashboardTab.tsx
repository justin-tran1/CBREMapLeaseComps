import { useMemo } from 'react'
import { useApp } from '../state/AppContext'
import {
  categoryBreakdown,
  chooseGrain,
  computeCoverage,
  computeKpis,
  histogram,
  signingStats,
  timeSeries,
  SIGNED,
} from '../lib/stats'
import { densityScale, useChartPrefs } from '../lib/chartPrefs'
import { fmtArea, fmtCompact, fmtDate, fmtMoney, fmtNumber, fmtShortMonths, fmtYears, EMPTY } from '../lib/format'
import { describeActiveFilters } from '../lib/filters'
import { ChartSettings } from './ChartSettings'
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

/** Lead time reads better in months once it passes a couple of them, and can be negative. */
function fmtLagDays(days: number): string {
  const magnitude = Math.abs(days)
  if (magnitude < 62) return `${Math.round(days)} days`
  const months = days / 30.44
  return `${months.toFixed(1)} mos`
}

interface DashboardTabProps {
  railOpen: boolean
  onOpenRail: () => void
}

export function DashboardTab({ railOpen, onOpenRail }: DashboardTabProps) {
  const { deals, filtered, theme, filters, setFilters, resetFilters } = useApp()
  const { prefs, setPref, reset: resetPrefs, isDefault } = useChartPrefs()
  const chartTheme = useChartTheme(theme === 'dark', prefs)
  // Compact means shorter charts, not charts with less room in them.
  const h = (base: number) => Math.round(base * densityScale(prefs.density))

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

  const signing = useMemo(() => signingStats(filtered), [filtered])
  const signedGrain = useMemo(() => chooseGrain(filtered, SIGNED), [filtered])
  const signedActivity = useMemo(
    () => timeSeries(filtered, signedGrain, (d) => d.leaseType, 5, { dateOf: SIGNED, measure: 'deals' }),
    [filtered, signedGrain],
  )
  const lagBins = useMemo(
    () => histogram(signing.lagDays, 12, (n) => String(Math.round(n))),
    [signing.lagDays],
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
            <ChartSettings
              prefs={prefs}
              setPref={setPref}
              reset={resetPrefs}
              isDefault={isDefault}
              dark={chartTheme.dark}
            />
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
            height={h(280)}
            empty={activity.buckets.length === 0}
            emptyLabel="No lease dates in the current selection, so activity cannot be placed on a timeline."
            footer={<ChartLegend keys={activity.stackKeys} theme={chartTheme} />}
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
            height={h(250)}
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
            height={h(250)}
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
            height={h(280)}
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
            height={h(280)}
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
            height={h(280)}
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
            height={h(250)}
            empty={areaBins.length === 0}
            emptyLabel="No area values in the current selection."
          >
            <Histogram data={areaBins} theme={chartTheme} unitLabel="SF" />
          </ChartFrame>

          <ChartFrame
            title="Term length distribution"
            subtitle="Deals per term band"
            height={h(250)}
            empty={termBins.length === 0}
            emptyLabel="No term values in the current selection."
          >
            <Histogram data={termBins} theme={chartTheme} unitLabel="months" />
          </ChartFrame>
        </div>

        {/*
          Signing is its own question, not a relabelled copy of the charts above. A quarter can
          be busy for signings and quiet for commencements, and the gap between the two is the
          pipeline, which is the one thing neither date can show on its own.
        */}
        <div className="dash__section">
          <h2 className="dash__sectiontitle">Signed date</h2>
          <p className="dash__sectionsub">
            When deals were executed, from the <code>Signed Date</code> column, rather than when
            they commenced.{' '}
            {signing.signedCount === 0
              ? 'No signed dates are mapped in the current selection.'
              : `${fmtNumber(signing.signedCount)} of ${fmtNumber(filtered.length)} matching deals carry one.`}
          </p>
        </div>

        <div className="kpis">
          <Kpi
            label="Deals signed"
            value={fmtNumber(signing.signedCount)}
            note={
              signing.signedFrom && signing.signedTo
                ? `${fmtDate(signing.signedFrom)} to ${fmtDate(signing.signedTo)}`
                : 'No signed dates mapped'
            }
          />
          <Kpi
            label="Signing to commencement"
            value={signing.medianLagDays === null ? EMPTY : fmtLagDays(signing.medianLagDays)}
            note={
              signing.pairedCount === 0
                ? 'Needs both a signed date and a lease date'
                : `Median across ${fmtNumber(signing.pairedCount)} deals with both dates`
            }
          />
          <Kpi
            label="Signed after commencement"
            value={signing.pairedCount === 0 ? EMPTY : fmtNumber(signing.signedLateCount)}
            note="Papered after the tenant took the space"
          />
        </div>

        <div className="charts">
          <ChartFrame
            title={`Deals signed by ${GRAIN_LABEL[signedGrain]}`}
            subtitle="Deal count, stacked by lease type"
            wide
            height={h(280)}
            empty={signedActivity.buckets.length === 0}
            emptyLabel="No signed dates in the current selection, so signings cannot be placed on a timeline."
            footer={<ChartLegend keys={signedActivity.stackKeys} theme={chartTheme} />}
          >
            <StackedColumns
              data={signedActivity.buckets}
              stackKeys={signedActivity.stackKeys}
              theme={chartTheme}
              formatValue={(n) => `${fmtNumber(n)} ${n === 1 ? 'deal' : 'deals'}`}
              axisFormat={(n) => fmtNumber(n)}
              wholeNumbers
              extraTooltipRows={(row) => [
                { label: 'Area signed', value: `${fmtCompact(Number(row.area ?? 0))} SF` },
              ]}
            />
          </ChartFrame>

          <ChartFrame
            title="Signing to commencement"
            subtitle="Deals per lead-time band, in days"
            height={h(250)}
            empty={lagBins.length === 0}
            emptyLabel="This needs deals carrying both a signed date and a lease date."
          >
            <Histogram data={lagBins} theme={chartTheme} unitLabel="days" />
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
