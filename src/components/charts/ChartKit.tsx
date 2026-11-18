import { cloneElement, useMemo, type ReactElement, type ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { colorForIndex, OTHER_LABEL } from '../../lib/palette'
import { DEFAULT_CHART_PREFS, type ChartPrefs } from '../../lib/chartPrefs'
import type { ChartSpec } from '../../lib/dashboardModel'

/**
 * Shared chart chrome.
 *
 * Most charts here carry one measure, so every bar is the same color: color is not
 * encoding anything and a rainbow would imply otherwise. The categorical slots appear only
 * where color genuinely separates series, which in this dashboard is the stacked column.
 */

export interface ChartTheme {
  series: string
  seriesSoft: string
  grid: string
  axis: string
  ink: string
  inkMuted: string
  /** Axis label color: the brand guide's chart grey, quieter than body text. */
  tick: string
  /** Axis labels and legends are set condensed, as CBRE's dense tables are. */
  fontCondensed: string
  surface: string
  dark: boolean
  /** The presentation choices from the dashboard's chart settings. */
  prefs: ChartPrefs
}

/*
 * CBRE's chart rules, from the brand reference: light dashed gridlines in CCD9D5 on the
 * value axis only, small grey axis labels in 767676 with no axis lines or tick marks, and
 * legends at the foot. The dark surface keeps the same roles at values that read on green.
 */
const CHART_FONT_CONDENSED = "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif"

/** The theme without the hook, for an export that is always drawn on white paper. */
export function chartTheme(dark: boolean, prefs: ChartPrefs = DEFAULT_CHART_PREFS): ChartTheme {
  return {
    ...(dark
      ? {
          series: '#17e88f',
          seriesSoft: 'rgba(23,232,143,0.16)',
          grid: '#1b3b30',
          axis: '#35604f',
          ink: '#ffffff',
          inkMuted: '#96b3b6',
          tick: '#96b3b6',
          surface: '#0f2b23',
          dark: true,
        }
      : {
          series: '#003f2d',
          seriesSoft: 'rgba(0,63,45,0.12)',
          grid: '#ccd9d5',
          axis: '#cad1d3',
          ink: '#435254',
          inkMuted: '#7f8480',
          tick: '#767676',
          surface: '#ffffff',
          dark: false,
        }),
    fontCondensed: CHART_FONT_CONDENSED,
    prefs,
  }
}

export function useChartTheme(dark: boolean, prefs: ChartPrefs = DEFAULT_CHART_PREFS): ChartTheme {
  return useMemo(() => chartTheme(dark, prefs), [dark, prefs])
}

/**
 * The color of one series in a stacked chart. The legend, the bars and the exported files all
 * ask this one function, so a swatch can never disagree with the segment it labels.
 */
export function stackColor(key: string, index: number, theme: ChartTheme): string {
  return key === OTHER_LABEL ? theme.inkMuted : colorForIndex(index, theme.dark, theme.prefs.palette)
}

/** A fixed pixel size, for drawing a chart off screen where nothing can be measured. */
export interface ChartSize {
  width: number
  height: number
}

/**
 * On screen a chart fills its frame and follows it as the window resizes. Off screen, for an
 * export, it is drawn at an exact size instead, because a resize observer has nothing to
 * observe there and would leave the chart unmeasured or a frame late.
 */
function Sized({ size, children }: { size?: ChartSize; children: ReactElement<{ width?: number; height?: number }> }) {
  if (size) return cloneElement(children, { width: size.width, height: size.height })
  return (
    <ResponsiveContainer width="100%" height="100%">
      {children}
    </ResponsiveContainer>
  )
}

/** Bar corner radii, in the order each chart needs them. */
function radius(theme: ChartTheme, corners: [number, number, number, number]): [number, number, number, number] {
  return theme.prefs.barShape === 'square' ? [0, 0, 0, 0] : corners
}

/** A grid the user has switched off is not drawn at all, rather than drawn in the surface color. */
function gridStroke(theme: ChartTheme): string | undefined {
  return theme.prefs.showGrid ? theme.grid : 'transparent'
}

// -------------------------------------------------------------------- frame

interface ChartFrameProps {
  title: string
  subtitle?: string
  wide?: boolean
  height?: number
  empty?: boolean
  emptyLabel?: string
  footer?: ReactNode
  children: ReactNode
}

export function ChartFrame({
  title,
  subtitle,
  wide = false,
  height = 250,
  empty = false,
  emptyLabel = 'No values in the current selection.',
  footer,
  children,
}: ChartFrameProps) {
  return (
    <section className={`chart${wide ? ' chart--wide' : ''}`}>
      <div className="chart__head">
        <h3 className="chart__title">{title}</h3>
        {subtitle && <span className="chart__sub">{subtitle}</span>}
      </div>
      {empty ? (
        <div className="chart__empty">{emptyLabel}</div>
      ) : (
        <>
          <div className="chart__body" style={{ height }}>
            {children}
          </div>
          {footer}
        </>
      )}
    </section>
  )
}

// ------------------------------------------------------------------ tooltip

interface TooltipEntry {
  name: string
  value: number
  color: string
}

interface KitTooltipProps {
  active?: boolean
  label?: string | number
  payload?: Array<{ name?: string; value?: unknown; color?: string; payload?: Record<string, unknown> }>
  titleOf?: (label: string, row: Record<string, unknown>) => string
  rowsOf: (row: Record<string, unknown>, entries: TooltipEntry[]) => Array<{ label: string; value: string; color?: string }>
}

function KitTooltip({ active, label, payload, titleOf, rowsOf }: KitTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  const row = (payload[0]?.payload ?? {}) as Record<string, unknown>
  const entries: TooltipEntry[] = payload.map((p) => ({
    name: String(p.name ?? ''),
    value: typeof p.value === 'number' ? p.value : Number(p.value ?? 0),
    color: p.color ?? 'currentColor',
  }))

  const rows = rowsOf(row, entries)
  if (rows.length === 0) return null

  return (
    <div className="tooltip">
      <div className="tooltip__title">{titleOf ? titleOf(String(label ?? ''), row) : String(label ?? '')}</div>
      {rows.map((r, i) => (
        <div className="tooltip__row" key={`${r.label}-${i}`}>
          <span className="tooltip__name">
            {r.color && <span className="tooltip__swatch" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="tooltip__value">{r.value}</span>
        </div>
      ))}
    </div>
  )
}

// ------------------------------------------------------------ category bars

export interface CategoryBarDatum {
  name: string
  value: number
  [key: string]: unknown
}

interface CategoryBarsProps {
  data: CategoryBarDatum[]
  theme: ChartTheme
  formatValue: (n: number) => string
  tooltipRows: (row: Record<string, unknown>) => Array<{ label: string; value: string }>
  labelWidth?: number
  size?: ChartSize
}

/** Horizontal bars for ranked categories. One measure, so one color. */
export function CategoryBars({
  data,
  theme,
  formatValue,
  tooltipRows,
  labelWidth = 132,
  size,
}: CategoryBarsProps) {
  return (
    <Sized size={size}>
      <BarChart data={data} layout="vertical" margin={{ top: 2, right: 54, bottom: 2, left: 0 }} barCategoryGap="30%">
        <CartesianGrid horizontal={false} stroke={gridStroke(theme)} strokeDasharray="3 3" />
        <XAxis
          type="number"
          tick={{ fill: theme.tick, fontSize: 11, fontFamily: theme.fontCondensed }}
          tickFormatter={formatValue}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={labelWidth}
          tick={{ fill: theme.ink, fontSize: 12, fontFamily: theme.fontCondensed }}
          axisLine={false}
          tickLine={false}
          interval={0}
        />
        <Tooltip
          cursor={{ fill: theme.seriesSoft }}
          content={<KitTooltip rowsOf={(row) => tooltipRows(row)} />}
        />
        <Bar dataKey="value" radius={radius(theme, [0, 4, 4, 0])} maxBarSize={22} isAnimationActive={false}>
          {data.map((entry) => (
            <Cell
              key={entry.name}
              fill={entry.name.startsWith(OTHER_LABEL) ? theme.inkMuted : theme.series}
            />
          ))}
        </Bar>
      </BarChart>
    </Sized>
  )
}

// ----------------------------------------------------------- stacked columns

interface StackedColumnsProps {
  data: Array<Record<string, unknown>>
  stackKeys: string[]
  theme: ChartTheme
  formatValue: (n: number) => string
  /** Shorter form for axis ticks, where the unit is already implied by the title. */
  axisFormat?: (n: number) => string
  tooltipTitle?: (label: string, row: Record<string, unknown>) => string
  extraTooltipRows?: (row: Record<string, unknown>) => Array<{ label: string; value: string }>
  /** Counts have no half values, so the axis should not offer any. */
  wholeNumbers?: boolean
  size?: ChartSize
}

export function StackedColumns({
  data,
  stackKeys,
  theme,
  formatValue,
  axisFormat,
  tooltipTitle,
  extraTooltipRows,
  wholeNumbers = false,
  size,
}: StackedColumnsProps) {
  // Recharts takes barCategoryGap off both sides of a band, so 30% leaves a 40% bar, which is
  // the brand reference's Excel gap width of 150 (a gap one and a half times the bar).
  return (
    <Sized size={size}>
      <BarChart data={data} margin={{ top: 6, right: 8, bottom: 2, left: 4 }} barCategoryGap="30%">
        <CartesianGrid vertical={false} stroke={gridStroke(theme)} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tick={{ fill: theme.tick, fontSize: 11, fontFamily: theme.fontCondensed }}
          axisLine={false}
          tickLine={false}
          minTickGap={4}
        />
        <YAxis
          tick={{ fill: theme.tick, fontSize: 11, fontFamily: theme.fontCondensed }}
          tickFormatter={axisFormat ?? formatValue}
          axisLine={false}
          tickLine={false}
          width={56}
          allowDecimals={!wholeNumbers}
        />
        <Tooltip
          cursor={{ fill: theme.seriesSoft }}
          content={
            <KitTooltip
              titleOf={tooltipTitle}
              rowsOf={(row, entries) => [
                ...entries
                  .filter((e) => e.value > 0)
                  .reverse()
                  .map((e) => ({ label: e.name, value: formatValue(e.value), color: e.color })),
                ...(extraTooltipRows ? extraTooltipRows(row) : []),
              ]}
            />
          }
        />
        {stackKeys.map((key, index) => (
          <Bar
            key={key}
            dataKey={`byType.${key}`}
            name={key}
            stackId="a"
            fill={stackColor(key, index, theme)}
            /* A surface-colored hairline keeps adjoining segments from bleeding together. */
            stroke={theme.surface}
            strokeWidth={1.5}
            maxBarSize={54}
            isAnimationActive={false}
            radius={index === stackKeys.length - 1 ? radius(theme, [4, 4, 0, 0]) : undefined}
          />
        ))}
      </BarChart>
    </Sized>
  )
}

export function ChartLegend({ keys, theme }: { keys: string[]; theme: ChartTheme }) {
  if (keys.length < 2) return null
  return (
    <div className="legendrow">
      {keys.map((key, index) => (
        <span className="legendrow__item" key={key}>
          <span className="legendrow__swatch" style={{ background: stackColor(key, index, theme) }} />
          {key}
        </span>
      ))}
    </div>
  )
}

// ------------------------------------------------------------------ trend

interface TrendLineProps {
  data: Array<Record<string, unknown>>
  dataKey: string
  theme: ChartTheme
  formatValue: (n: number) => string
  tooltipLabel: string
  extraTooltipRows?: (row: Record<string, unknown>) => Array<{ label: string; value: string }>
  size?: ChartSize
}

export function TrendLine({
  data,
  dataKey,
  theme,
  formatValue,
  tooltipLabel,
  extraTooltipRows,
  size,
}: TrendLineProps) {
  const filled = theme.prefs.trendStyle === 'area'
  // The same chart either way: one measure, one axis, the line in the same place. A fill only
  // weights it, which helps across a room and costs nothing on a screen.
  const Chart = filled ? AreaChart : LineChart
  const Mark = filled ? Area : Line

  return (
    <Sized size={size}>
      <Chart data={data} margin={{ top: 8, right: 12, bottom: 2, left: 4 }}>
        <CartesianGrid vertical={false} stroke={theme.grid} />
        <XAxis
          dataKey="label"
          tick={{ fill: theme.tick, fontSize: 11, fontFamily: theme.fontCondensed }}
          axisLine={false}
          tickLine={false}
          minTickGap={4}
        />
        <YAxis
          tick={{ fill: theme.tick, fontSize: 11, fontFamily: theme.fontCondensed }}
          tickFormatter={formatValue}
          axisLine={false}
          tickLine={false}
          width={58}
          domain={['auto', 'auto']}
        />
        <Tooltip
          cursor={{ stroke: theme.axis, strokeWidth: 1 }}
          content={
            <KitTooltip
              rowsOf={(row, entries) => [
                ...entries.map((e) => ({
                  label: tooltipLabel,
                  value: formatValue(e.value),
                  color: e.color,
                })),
                ...(extraTooltipRows ? extraTooltipRows(row) : []),
              ]}
            />
          }
        />
        <Mark
          type="monotone"
          dataKey={dataKey}
          stroke={theme.series}
          strokeWidth={2}
          fill={filled ? theme.seriesSoft : 'none'}
          dot={{ r: 3, fill: theme.surface, stroke: theme.series, strokeWidth: 2 }}
          activeDot={{ r: 5, fill: theme.series, stroke: theme.surface, strokeWidth: 2 }}
          connectNulls
          isAnimationActive={false}
        />
      </Chart>
    </Sized>
  )
}

// --------------------------------------------------------------- histogram

interface HistogramProps {
  data: Array<{ label: string; count: number }>
  theme: ChartTheme
  unitLabel: string
  size?: ChartSize
}

export function Histogram({ data, theme, unitLabel, size }: HistogramProps) {
  return (
    <Sized size={size}>
      <BarChart data={data} margin={{ top: 6, right: 8, bottom: 2, left: 4 }} barCategoryGap="20%">
        <CartesianGrid vertical={false} stroke={gridStroke(theme)} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tick={{ fill: theme.tick, fontSize: 11, fontFamily: theme.fontCondensed }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={2}
        />
        <YAxis
          tick={{ fill: theme.tick, fontSize: 11, fontFamily: theme.fontCondensed }}
          axisLine={false}
          tickLine={false}
          width={38}
          allowDecimals={false}
        />
        <Tooltip
          cursor={{ fill: theme.seriesSoft }}
          content={
            <KitTooltip
              titleOf={(label) => `${label} ${unitLabel}`}
              rowsOf={(_row, entries) => [{ label: 'Deals', value: String(entries[0]?.value ?? 0) }]}
            />
          }
        />
        <Bar
          dataKey="count"
          fill={theme.series}
          radius={radius(theme, [4, 4, 0, 0])}
          maxBarSize={64}
          isAnimationActive={false}
        />
      </BarChart>
    </Sized>
  )
}

// ------------------------------------------------------------ from a spec

/** Draw any dashboard chart from its spec, on screen or at a fixed size for an export. */
export function ChartFromSpec({ spec, theme, size }: { spec: ChartSpec; theme: ChartTheme; size?: ChartSize }) {
  switch (spec.kind) {
    case 'stacked':
      return (
        <StackedColumns
          data={spec.data}
          stackKeys={spec.stackKeys}
          theme={theme}
          formatValue={spec.formatValue}
          axisFormat={spec.axisFormat}
          wholeNumbers={spec.wholeNumbers}
          extraTooltipRows={spec.extraTooltipRows}
          size={size}
        />
      )
    case 'trend':
      return (
        <TrendLine
          data={spec.data}
          dataKey={spec.dataKey}
          theme={theme}
          formatValue={spec.formatValue}
          tooltipLabel={spec.tooltipLabel}
          extraTooltipRows={spec.extraTooltipRows}
          size={size}
        />
      )
    case 'bars':
      return (
        <CategoryBars
          data={spec.data}
          theme={theme}
          formatValue={spec.formatValue}
          tooltipRows={spec.tooltipRows}
          labelWidth={spec.labelWidth}
          size={size}
        />
      )
    case 'histogram':
      return <Histogram data={spec.data} theme={theme} unitLabel={spec.unitLabel} size={size} />
  }
}

/** A dashboard chart card: the frame, the chart and, for a stacked chart, its legend. */
export function SpecChart({ spec, theme, heightScale = 1 }: { spec: ChartSpec; theme: ChartTheme; heightScale?: number }) {
  return (
    <ChartFrame
      title={spec.title}
      subtitle={spec.subtitle}
      wide={spec.wide}
      height={Math.round(spec.height * heightScale)}
      empty={spec.empty}
      emptyLabel={spec.emptyLabel}
      footer={spec.kind === 'stacked' ? <ChartLegend keys={spec.stackKeys} theme={theme} /> : undefined}
    >
      <ChartFromSpec spec={spec} theme={theme} />
    </ChartFrame>
  )
}
