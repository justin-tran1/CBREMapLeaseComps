import { useMemo, type ReactNode } from 'react'
import {
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

/**
 * Shared chart chrome.
 *
 * Most charts here carry one measure, so every bar is the same colour: colour is not
 * encoding anything and a rainbow would imply otherwise. The categorical slots appear only
 * where colour genuinely separates series, which in this dashboard is the stacked column.
 */

export interface ChartTheme {
  series: string
  seriesSoft: string
  grid: string
  axis: string
  ink: string
  inkMuted: string
  surface: string
  dark: boolean
}

export function useChartTheme(dark: boolean): ChartTheme {
  return useMemo(
    () =>
      dark
        ? {
            series: '#17e88f',
            seriesSoft: 'rgba(23,232,143,0.16)',
            grid: '#1b3b30',
            axis: '#35604f',
            ink: '#ffffff',
            inkMuted: '#96b3b6',
            surface: '#0f2b23',
            dark: true,
          }
        : {
            series: '#003f2d',
            seriesSoft: 'rgba(0,63,45,0.12)',
            grid: '#e4e9e8',
            axis: '#cad1d3',
            ink: '#012a2d',
            inkMuted: '#7f8480',
            surface: '#ffffff',
            dark: false,
          },
    [dark],
  )
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
}

/** Horizontal bars for ranked categories. One measure, so one colour. */
export function CategoryBars({
  data,
  theme,
  formatValue,
  tooltipRows,
  labelWidth = 132,
}: CategoryBarsProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 2, right: 54, bottom: 2, left: 0 }} barCategoryGap="22%">
        <CartesianGrid horizontal={false} stroke={theme.grid} />
        <XAxis
          type="number"
          tick={{ fill: theme.inkMuted, fontSize: 11 }}
          tickFormatter={formatValue}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={labelWidth}
          tick={{ fill: theme.inkMuted, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          interval={0}
        />
        <Tooltip
          cursor={{ fill: theme.seriesSoft }}
          content={<KitTooltip rowsOf={(row) => tooltipRows(row)} />}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
          {data.map((entry) => (
            <Cell
              key={entry.name}
              fill={entry.name.startsWith(OTHER_LABEL) ? theme.inkMuted : theme.series}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
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
}

export function StackedColumns({
  data,
  stackKeys,
  theme,
  formatValue,
  axisFormat,
  tooltipTitle,
  extraTooltipRows,
}: StackedColumnsProps) {
  const colorFor = (key: string, index: number) =>
    key === OTHER_LABEL ? theme.inkMuted : colorForIndex(index, theme.dark)

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 6, right: 8, bottom: 2, left: 4 }} barCategoryGap="18%">
        <CartesianGrid vertical={false} stroke={theme.grid} />
        <XAxis
          dataKey="label"
          tick={{ fill: theme.inkMuted, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          minTickGap={4}
        />
        <YAxis
          tick={{ fill: theme.inkMuted, fontSize: 11 }}
          tickFormatter={axisFormat ?? formatValue}
          axisLine={false}
          tickLine={false}
          width={56}
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
            fill={colorFor(key, index)}
            /* A surface-coloured hairline keeps adjoining segments from bleeding together. */
            stroke={theme.surface}
            strokeWidth={1.5}
            maxBarSize={54}
            isAnimationActive={false}
            radius={index === stackKeys.length - 1 ? [4, 4, 0, 0] : undefined}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

export function ChartLegend({ keys, dark }: { keys: string[]; dark: boolean }) {
  if (keys.length < 2) return null
  return (
    <div className="legendrow">
      {keys.map((key, index) => (
        <span className="legendrow__item" key={key}>
          <span
            className="legendrow__swatch"
            style={{ background: key === OTHER_LABEL ? (dark ? '#6f7a76' : '#8a8f8c') : colorForIndex(index, dark) }}
          />
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
}

export function TrendLine({
  data,
  dataKey,
  theme,
  formatValue,
  tooltipLabel,
  extraTooltipRows,
}: TrendLineProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 2, left: 4 }}>
        <CartesianGrid vertical={false} stroke={theme.grid} />
        <XAxis
          dataKey="label"
          tick={{ fill: theme.inkMuted, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          minTickGap={4}
        />
        <YAxis
          tick={{ fill: theme.inkMuted, fontSize: 11 }}
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
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke={theme.series}
          strokeWidth={2}
          dot={{ r: 3, fill: theme.surface, stroke: theme.series, strokeWidth: 2 }}
          activeDot={{ r: 5, fill: theme.series, stroke: theme.surface, strokeWidth: 2 }}
          connectNulls
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

// --------------------------------------------------------------- histogram

interface HistogramProps {
  data: Array<{ label: string; count: number }>
  theme: ChartTheme
  unitLabel: string
}

export function Histogram({ data, theme, unitLabel }: HistogramProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 6, right: 8, bottom: 2, left: 4 }} barCategoryGap="12%">
        <CartesianGrid vertical={false} stroke={theme.grid} />
        <XAxis
          dataKey="label"
          tick={{ fill: theme.inkMuted, fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={2}
        />
        <YAxis
          tick={{ fill: theme.inkMuted, fontSize: 11 }}
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
          radius={[4, 4, 0, 0]}
          maxBarSize={64}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
