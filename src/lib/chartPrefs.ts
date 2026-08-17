import { useCallback, useEffect, useState } from 'react'
import { CHART_PALETTES, type ChartPaletteId } from './palette'

/**
 * How the dashboard charts are drawn.
 *
 * These are presentation choices, not encoding choices. Nothing here can change what a chart
 * means: the palettes are fixed, ordered and measured, series keep their slot whichever one is
 * chosen, and there is no option that would put two measures on one pair of axes or replace a
 * legend with colour alone. What a user can change is how the result reads in the room it is
 * being shown in.
 */

export type BarShape = 'rounded' | 'square'
export type TrendStyle = 'line' | 'area'
export type ChartDensity = 'comfortable' | 'compact'

export interface ChartPrefs {
  palette: ChartPaletteId
  showGrid: boolean
  barShape: BarShape
  trendStyle: TrendStyle
  density: ChartDensity
}

export const DEFAULT_CHART_PREFS: ChartPrefs = {
  palette: 'cbre',
  showGrid: true,
  barShape: 'rounded',
  trendStyle: 'line',
  density: 'comfortable',
}

const STORAGE_KEY = 'cbre-hcls-mapper.chartPrefs.v1'

const PALETTE_IDS = CHART_PALETTES.map((p) => p.id)

/** Read stored prefs field by field, so a stale or hand-edited value cannot break the charts. */
export function parseChartPrefs(raw: unknown): ChartPrefs {
  const value = (raw ?? {}) as Partial<Record<keyof ChartPrefs, unknown>>
  const pick = <T extends string>(field: unknown, allowed: readonly T[], fallback: T): T =>
    typeof field === 'string' && (allowed as readonly string[]).includes(field) ? (field as T) : fallback

  return {
    palette: pick(value.palette, PALETTE_IDS, DEFAULT_CHART_PREFS.palette),
    showGrid: typeof value.showGrid === 'boolean' ? value.showGrid : DEFAULT_CHART_PREFS.showGrid,
    barShape: pick(value.barShape, ['rounded', 'square'] as const, DEFAULT_CHART_PREFS.barShape),
    trendStyle: pick(value.trendStyle, ['line', 'area'] as const, DEFAULT_CHART_PREFS.trendStyle),
    density: pick(value.density, ['comfortable', 'compact'] as const, DEFAULT_CHART_PREFS.density),
  }
}

function readStored(): ChartPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return parseChartPrefs(raw ? JSON.parse(raw) : null)
  } catch {
    return DEFAULT_CHART_PREFS
  }
}

/** Chart height multiplier, so compact means shorter rather than cramped. */
export function densityScale(density: ChartDensity): number {
  return density === 'compact' ? 0.78 : 1
}

export function useChartPrefs(): {
  prefs: ChartPrefs
  setPref: <K extends keyof ChartPrefs>(key: K, value: ChartPrefs[K]) => void
  reset: () => void
  isDefault: boolean
} {
  const [prefs, setPrefs] = useState<ChartPrefs>(readStored)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
    } catch {
      // Private browsing. The choice holds for this session.
    }
  }, [prefs])

  const setPref = useCallback(<K extends keyof ChartPrefs>(key: K, value: ChartPrefs[K]) => {
    setPrefs((prev) => ({ ...prev, [key]: value }))
  }, [])

  const reset = useCallback(() => setPrefs(DEFAULT_CHART_PREFS), [])

  const isDefault = (Object.keys(DEFAULT_CHART_PREFS) as Array<keyof ChartPrefs>).every(
    (key) => prefs[key] === DEFAULT_CHART_PREFS[key],
  )

  return { prefs, setPref, reset, isDefault }
}
