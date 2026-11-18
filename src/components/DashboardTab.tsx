import { useMemo } from 'react'
import { useApp } from '../state/AppContext'
import {
  buildDashboardModel,
  chartSpecs,
  coverageLead,
  coverageRows,
  headlineKpis,
  selectionLine,
  signingCoverageNote,
  signingKpis,
  MAIN_CHART_IDS,
  SIGNED_CHART_IDS,
  type KpiSpec,
} from '../lib/dashboardModel'
import { densityScale } from '../lib/chartPrefs'
import { describeActiveFilters } from '../lib/filters'
import { ChartSettings } from './ChartSettings'
import { DataTable } from './DataTable'
import { SpecChart, useChartTheme } from './charts/ChartKit'
import { IconDownload, IconFilter, IconX } from './Icons'

function Kpi({ label, value, note }: KpiSpec) {
  return (
    <div className="kpi">
      <span className="kpi__label">{label}</span>
      <span className="kpi__value">{value}</span>
      {note && <span className="kpi__note">{note}</span>}
    </div>
  )
}

interface DashboardTabProps {
  railOpen: boolean
  onOpenRail: () => void
}

export function DashboardTab({ railOpen, onOpenRail }: DashboardTabProps) {
  const {
    deals,
    filtered,
    theme,
    filters,
    setFilters,
    resetFilters,
    chartPrefs: prefs,
    chartPrefsDefault,
    setChartPref,
    resetChartPrefs,
    setExportOpen,
  } = useApp()
  const chartTheme = useChartTheme(theme === 'dark', prefs)
  // Compact means shorter charts, not charts with less room in them.
  const heightScale = densityScale(prefs.density)

  const model = useMemo(() => buildDashboardModel(deals, filtered), [deals, filtered])
  const specs = useMemo(() => chartSpecs(model), [model])
  const coverage = useMemo(() => coverageRows(model), [model])
  const chips = describeActiveFilters(filters)

  return (
    <div className="dash">
      <div className="dash__inner">
        <div className="dash__head">
          <div>
            <h1 className="dash__title">Healthcare &amp; Life Sciences lease comps</h1>
            <div className="dash__sub">{selectionLine(model)}</div>
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
              setPref={setChartPref}
              reset={resetChartPrefs}
              isDefault={chartPrefsDefault}
              dark={chartTheme.dark}
            />
            <button
              type="button"
              className="btn"
              onClick={() => setExportOpen(true)}
              title="Download this dashboard as a PDF report or a PowerPoint deck"
            >
              <IconDownload size={14} />
              Export
            </button>
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
          {headlineKpis(model).map((kpi) => (
            <Kpi key={kpi.id} {...kpi} />
          ))}
        </div>

        <div className="charts">
          {MAIN_CHART_IDS.map((id) => (
            <SpecChart key={id} spec={specs[id]} theme={chartTheme} heightScale={heightScale} />
          ))}
        </div>

        {/*
          Signing is its own question, not a relabeled copy of the charts above. A quarter can
          be busy for signings and quiet for commencements, and the gap between the two is the
          pipeline, which is the one thing neither date can show on its own.
        */}
        <div className="dash__section">
          <h2 className="dash__sectiontitle">Signed date</h2>
          <p className="dash__sectionsub">
            When deals were executed, from the <code>Signed Date</code> column, rather than when
            they commenced. {signingCoverageNote(model)}
          </p>
        </div>

        <div className="kpis">
          {signingKpis(model).map((kpi) => (
            <Kpi key={kpi.id} {...kpi} />
          ))}
        </div>

        <div className="charts">
          {SIGNED_CHART_IDS.map((id) => (
            <SpecChart key={id} spec={specs[id]} theme={chartTheme} heightScale={heightScale} />
          ))}
        </div>

        <div className="card">
          <div className="card__header">
            <div>
              <div className="card__title">Field coverage</div>
              <div className="card__subtitle">
                {coverageLead(model.matching)}. Gaps here explain empty popup rows and thin charts.
              </div>
            </div>
          </div>
          <div className="card__body">
            <div className="coverage">
              {coverage.map((row) => (
                <div className="coverage__row" key={row.label}>
                  <span className="coverage__label" title={row.label}>
                    {row.label}
                  </span>
                  <span
                    className="coverage__bar"
                    role="img"
                    aria-label={`${row.label}: ${row.pct}% of rows populated`}
                  >
                    <span className="coverage__fill" style={{ width: `${row.pct}%` }} />
                  </span>
                  <span className="coverage__pct">{row.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DataTable />
      </div>
    </div>
  )
}
