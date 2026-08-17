import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { autoMapColumns } from '../lib/fields'
import { applyFilters, computeBounds, computeFacets, emptyFilters } from '../lib/filters'
import {
  cacheSize,
  clearGeocodeCache,
  geocodeBatch,
  getCached,
  type GeocodeProviderId,
} from '../lib/geocode'
import { addressKey, buildLocationGroups, buildSites, normalizeDeals } from '../lib/normalize'
import { readSpreadsheet } from '../lib/parse'
import type {
  BasemapId,
  ColumnMap,
  Filters,
  GeocodeProgress,
  LeaseDeal,
  ParsedSheet,
  Site,
} from '../types'

export type Phase = 'upload' | 'mapping' | 'ready'
export type TabId = 'map' | 'dashboard'
export type ThemeId = 'light' | 'dark'

const THEME_KEY = 'cbre-hcls-mapper.theme'
const BASEMAP_KEY = 'cbre-hcls-mapper.basemap.v2'
const PROVIDER_KEY = 'cbre-hcls-mapper.geocoder'

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
  } catch {
    return fallback
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* storage unavailable; the setting simply will not persist */
  }
}

export interface FocusRequest {
  dealId: string
  token: number
}

interface AppState {
  phase: Phase
  tab: TabId
  theme: ThemeId
  basemap: BasemapId

  fileName: string
  sheet: ParsedSheet | null
  columnMap: ColumnMap
  parseError: string
  loadingFile: boolean

  deals: LeaseDeal[]
  filtered: LeaseDeal[]
  sites: Site[]
  filteredSites: Site[]
  facets: ReturnType<typeof computeFacets>
  bounds: ReturnType<typeof computeBounds>

  filters: Filters
  geocodeProvider: GeocodeProviderId
  geocode: GeocodeProgress
  geocodeCacheSize: number
  unlocatedCount: number

  focusRequest: FocusRequest | null

  setTab: (tab: TabId) => void
  setTheme: (theme: ThemeId) => void
  setBasemap: (basemap: BasemapId) => void
  setFilters: (update: Filters | ((prev: Filters) => Filters)) => void
  resetFilters: () => void

  loadFile: (file: File) => Promise<void>
  changeSheet: (sheetName: string) => Promise<void>
  setColumnMap: (map: ColumnMap) => void
  confirmMapping: () => void
  reopenMapping: () => void
  reset: () => void

  setGeocodeProvider: (provider: GeocodeProviderId) => void
  startGeocoding: (onlyMissing?: boolean) => void
  cancelGeocoding: () => void
  purgeGeocodeCache: () => void

  requestFocus: (dealId: string) => void
  clearFocus: () => void
}

const AppContext = createContext<AppState | null>(null)

const IDLE_PROGRESS: GeocodeProgress = {
  total: 0,
  done: 0,
  failed: 0,
  running: false,
  provider: '',
  currentAddress: '',
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('upload')
  const [tab, setTab] = useState<TabId>('map')
  const [theme, setThemeState] = useState<ThemeId>(() => readStored(THEME_KEY, ['light', 'dark'] as const, 'light'))
  const [basemap, setBasemapState] = useState<BasemapId>(() =>
    readStored(BASEMAP_KEY, ['aerial', 'hybrid', 'cbre-light', 'streets', 'gray', 'topo', 'dark'] as const, 'aerial'),
  )

  const [file, setFile] = useState<File | null>(null)
  const [sheet, setSheet] = useState<ParsedSheet | null>(null)
  const [columnMap, setColumnMapState] = useState<ColumnMap>({})
  const [parseError, setParseError] = useState('')
  const [loadingFile, setLoadingFile] = useState(false)

  const [deals, setDeals] = useState<LeaseDeal[]>([])
  const [filters, setFiltersState] = useState<Filters>(emptyFilters)
  const [geocodeProvider, setGeocodeProviderState] = useState<GeocodeProviderId>(() =>
    readStored(PROVIDER_KEY, ['auto', 'census', 'photon', 'osm'] as const, 'auto'),
  )
  const [geocode, setGeocode] = useState<GeocodeProgress>(IDLE_PROGRESS)
  const [geocodeCacheSize, setGeocodeCacheSize] = useState(0)
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const focusToken = useRef(0)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
  }, [theme])

  useEffect(() => {
    setGeocodeCacheSize(cacheSize())
  }, [])

  useEffect(() => () => abortRef.current?.abort(), [])

  const setTheme = useCallback((next: ThemeId) => {
    setThemeState(next)
    writeStored(THEME_KEY, next)
  }, [])

  const setBasemap = useCallback((next: BasemapId) => {
    setBasemapState(next)
    writeStored(BASEMAP_KEY, next)
  }, [])

  const setGeocodeProvider = useCallback((next: GeocodeProviderId) => {
    setGeocodeProviderState(next)
    writeStored(PROVIDER_KEY, next)
  }, [])

  const setFilters = useCallback((update: Filters | ((prev: Filters) => Filters)) => {
    setFiltersState((prev) => (typeof update === 'function' ? update(prev) : update))
  }, [])

  const resetFilters = useCallback(() => setFiltersState(emptyFilters()), [])

  const cancelGeocoding = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setGeocode((prev) => ({ ...prev, running: false, currentAddress: '' }))
  }, [])

  const loadFile = useCallback(
    async (nextFile: File) => {
      cancelGeocoding()
      setLoadingFile(true)
      setParseError('')
      try {
        const parsed = await readSpreadsheet(nextFile)
        setFile(nextFile)
        setSheet(parsed)
        setColumnMapState(autoMapColumns(parsed.headers))
        setDeals([])
        setFiltersState(emptyFilters())
        setGeocode(IDLE_PROGRESS)
        setPhase('mapping')
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Could not read that file.')
        setSheet(null)
        setFile(null)
        setPhase('upload')
      } finally {
        setLoadingFile(false)
      }
    },
    [cancelGeocoding],
  )

  const changeSheet = useCallback(
    async (sheetName: string) => {
      if (!file) return
      setLoadingFile(true)
      setParseError('')
      try {
        const parsed = await readSpreadsheet(file, { sheetName })
        setSheet(parsed)
        setColumnMapState(autoMapColumns(parsed.headers))
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Could not read that sheet.')
      } finally {
        setLoadingFile(false)
      }
    },
    [file],
  )

  const setColumnMap = useCallback((map: ColumnMap) => setColumnMapState(map), [])

  const confirmMapping = useCallback(() => {
    if (!sheet) return
    const next = normalizeDeals(sheet, columnMap)

    // Seed coordinates from the cache so a repeat upload maps instantly.
    for (const deal of next) {
      if (deal.lat !== null && deal.lon !== null) continue
      const key = addressKey(deal)
      if (!key) continue
      const hit = getCached(key)
      if (hit) {
        deal.lat = hit.lat
        deal.lon = hit.lon
        deal.geoSource = 'cache'
        deal.geoAccuracy = `${hit.provider} (cached)`
      }
    }

    setDeals(next)
    setFiltersState(emptyFilters())
    setPhase('ready')
  }, [sheet, columnMap])

  const reopenMapping = useCallback(() => setPhase('mapping'), [])

  const reset = useCallback(() => {
    cancelGeocoding()
    setPhase('upload')
    setFile(null)
    setSheet(null)
    setColumnMapState({})
    setDeals([])
    setFiltersState(emptyFilters())
    setGeocode(IDLE_PROGRESS)
    setParseError('')
    setFocusRequest(null)
  }, [cancelGeocoding])

  const startGeocoding = useCallback(
    (onlyMissing = true) => {
      if (deals.length === 0) return
      abortRef.current?.abort()

      const controller = new AbortController()
      abortRef.current = controller

      const groups = buildLocationGroups(deals).filter((g) => {
        if (!g.query.trim()) return false
        if (!onlyMissing) return true
        return g.deals.some((d) => d.lat === null || d.lon === null)
      })

      if (groups.length === 0) {
        setGeocode({ ...IDLE_PROGRESS, provider: geocodeProvider })
        return
      }

      const pending = new Map<string, { lat: number; lon: number; accuracy: string; provider: string } | null>()
      const errors = new Map<string, string>()
      let flushHandle: number | null = null

      const flush = () => {
        flushHandle = null
        if (pending.size === 0) return

        const batch = new Map(pending)
        const batchErrors = new Map(errors)
        pending.clear()
        errors.clear()

        setDeals((current) => {
          let changed = false
          const next = current.map((deal) => {
            const key = addressKey(deal)
            if (!key || !batch.has(key)) return deal

            const hit = batch.get(key)
            changed = true
            if (!hit) {
              return { ...deal, geoError: batchErrors.get(key) ?? 'Not found' }
            }
            return {
              ...deal,
              lat: hit.lat,
              lon: hit.lon,
              geoSource: 'geocoder' as const,
              geoAccuracy: `${hit.provider} · ${hit.accuracy}`,
              geoError: '',
            }
          })
          return changed ? next : current
        })
      }

      const scheduleFlush = () => {
        if (flushHandle !== null) return
        flushHandle = window.setTimeout(flush, 350)
      }

      setGeocode({
        total: groups.length,
        done: 0,
        failed: 0,
        running: true,
        provider: geocodeProvider,
        currentAddress: '',
      })

      void geocodeBatch(
        groups.map((g) => ({ key: g.key, query: g.query })),
        {
          provider: geocodeProvider,
          signal: controller.signal,
          onProgress: (done, total, failed, currentAddress) => {
            if (controller.signal.aborted) return
            setGeocode((prev) => ({ ...prev, done, total, failed, currentAddress }))
          },
          onResult: (outcome) => {
            if (controller.signal.aborted) return
            pending.set(outcome.key, outcome.hit)
            if (!outcome.hit) errors.set(outcome.key, outcome.error)
            scheduleFlush()
          },
        },
      )
        .catch(() => undefined)
        .finally(() => {
          if (flushHandle !== null) {
            window.clearTimeout(flushHandle)
            flushHandle = null
          }
          flush()
          setGeocodeCacheSize(cacheSize())
          if (abortRef.current === controller) abortRef.current = null
          setGeocode((prev) => ({ ...prev, running: false, currentAddress: '' }))
        })
    },
    [deals, geocodeProvider],
  )

  const purgeGeocodeCache = useCallback(() => {
    clearGeocodeCache()
    setGeocodeCacheSize(0)
  }, [])

  const requestFocus = useCallback((dealId: string) => {
    focusToken.current += 1
    setFocusRequest({ dealId, token: focusToken.current })
    setTab('map')
  }, [])

  const clearFocus = useCallback(() => setFocusRequest(null), [])

  const filtered = useMemo(() => applyFilters(deals, filters), [deals, filters])
  const sites = useMemo(() => buildSites(deals), [deals])
  const filteredSites = useMemo(() => buildSites(filtered), [filtered])
  const facets = useMemo(() => computeFacets(deals), [deals])
  const bounds = useMemo(() => computeBounds(deals), [deals])
  const unlocatedCount = useMemo(() => deals.filter((d) => d.lat === null || d.lon === null).length, [deals])

  const value = useMemo<AppState>(
    () => ({
      phase,
      tab,
      theme,
      basemap,
      fileName: sheet?.fileName ?? '',
      sheet,
      columnMap,
      parseError,
      loadingFile,
      deals,
      filtered,
      sites,
      filteredSites,
      facets,
      bounds,
      filters,
      geocodeProvider,
      geocode,
      geocodeCacheSize,
      unlocatedCount,
      focusRequest,
      setTab,
      setTheme,
      setBasemap,
      setFilters,
      resetFilters,
      loadFile,
      changeSheet,
      setColumnMap,
      confirmMapping,
      reopenMapping,
      reset,
      setGeocodeProvider,
      startGeocoding,
      cancelGeocoding,
      purgeGeocodeCache,
      requestFocus,
      clearFocus,
    }),
    [
      phase, tab, theme, basemap, sheet, columnMap, parseError, loadingFile, deals, filtered,
      sites, filteredSites, facets, bounds, filters, geocodeProvider, geocode, geocodeCacheSize,
      unlocatedCount, focusRequest, setTheme, setBasemap, setFilters, resetFilters, loadFile,
      changeSheet, setColumnMap, confirmMapping, reopenMapping, reset, setGeocodeProvider,
      startGeocoding, cancelGeocoding, purgeGeocodeCache, requestFocus, clearFocus,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppState {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}
