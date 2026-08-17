/**
 * Address geocoding.
 *
 * Everything runs in the browser against free, key-less services, and every result is
 * cached in localStorage so a re-upload of the same book costs no network calls.
 *
 *  - census   US Census Bureau geocoder. US only, no rate limit, very accurate on US street
 *             addresses. First choice for lease comps.
 *  - photon   Komoot's OpenStreetMap geocoder. Worldwide, tolerant of partial addresses.
 *  - osm      Nominatim. Worldwide, capped at one request per second by usage policy.
 */

export type GeocodeProviderId = 'auto' | 'census' | 'photon' | 'osm'

export interface GeocodeHit {
  lat: number
  lon: number
  accuracy: string
  provider: string
}

export interface ProviderInfo {
  id: GeocodeProviderId
  label: string
  description: string
}

export const GEOCODE_PROVIDERS: ProviderInfo[] = [
  {
    id: 'auto',
    label: 'Automatic (recommended)',
    description: 'US Census first, then OpenStreetMap services for anything it cannot match.',
  },
  { id: 'census', label: 'US Census Bureau', description: 'United States addresses only. Fast and accurate.' },
  { id: 'photon', label: 'Photon (OpenStreetMap)', description: 'Worldwide. Handles partial addresses well.' },
  { id: 'osm', label: 'Nominatim (OpenStreetMap)', description: 'Worldwide. Limited to one lookup per second.' },
]

const CACHE_KEY = 'cbre-lease-mapper.geocache.v2'
const CACHE_LIMIT = 25_000
const REQUEST_TIMEOUT_MS = 20_000

interface CacheEntry extends GeocodeHit {
  ts: number
}

type CacheShape = Record<string, CacheEntry>

let cache: CacheShape | null = null

function loadCache(): CacheShape {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    cache = raw ? (JSON.parse(raw) as CacheShape) : {}
  } catch {
    cache = {}
  }
  return cache
}

let flushTimer: number | null = null

function scheduleFlush(): void {
  if (flushTimer !== null) return
  flushTimer = window.setTimeout(() => {
    flushTimer = null
    persistCache()
  }, 800)
}

function persistCache(): void {
  const current = loadCache()
  try {
    const keys = Object.keys(current)
    if (keys.length > CACHE_LIMIT) {
      // Drop the oldest entries rather than letting the cache grow without bound.
      keys
        .sort((a, b) => (current[a]?.ts ?? 0) - (current[b]?.ts ?? 0))
        .slice(0, keys.length - CACHE_LIMIT)
        .forEach((k) => delete current[k])
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(current))
  } catch {
    // Private browsing or a full quota. The cache stays in memory for this session.
  }
}

export function getCached(key: string): GeocodeHit | null {
  const entry = loadCache()[key]
  return entry ? { lat: entry.lat, lon: entry.lon, accuracy: entry.accuracy, provider: entry.provider } : null
}

export function putCached(key: string, hit: GeocodeHit): void {
  loadCache()[key] = { ...hit, ts: Date.now() }
  scheduleFlush()
}

export function cacheSize(): number {
  return Object.keys(loadCache()).length
}

export function clearGeocodeCache(): void {
  cache = {}
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    /* nothing to clean up */
  }
}

async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const timeout = new AbortController()
  const timer = window.setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS)
  const onAbort = () => timeout.abort()
  signal.addEventListener('abort', onAbort, { once: true })

  try {
    const response = await fetch(url, {
      signal: timeout.signal,
      headers: { Accept: 'application/json' },
      referrerPolicy: 'strict-origin-when-cross-origin',
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } finally {
    window.clearTimeout(timer)
    signal.removeEventListener('abort', onAbort)
  }
}

function num(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value))
  return Number.isFinite(n) ? n : null
}

function validCoords(lat: number | null, lon: number | null): boolean {
  return (
    lat !== null &&
    lon !== null &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    !(lat === 0 && lon === 0)
  )
}

async function geocodeCensus(query: string, signal: AbortSignal): Promise<GeocodeHit | null> {
  const url =
    'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress' +
    `?address=${encodeURIComponent(query)}&benchmark=Public_AR_Current&format=json`

  const data = (await fetchJson(url, signal)) as {
    result?: { addressMatches?: Array<{ coordinates?: { x?: unknown; y?: unknown }; matchedAddress?: string }> }
  }

  const match = data?.result?.addressMatches?.[0]
  if (!match?.coordinates) return null

  const lat = num(match.coordinates.y)
  const lon = num(match.coordinates.x)
  if (!validCoords(lat, lon)) return null

  return { lat: lat as number, lon: lon as number, accuracy: 'Rooftop / street match', provider: 'US Census' }
}

async function geocodePhoton(query: string, signal: AbortSignal): Promise<GeocodeHit | null> {
  const url = `https://photon.komoot.io/api/?limit=1&q=${encodeURIComponent(query)}`
  const data = (await fetchJson(url, signal)) as {
    features?: Array<{ geometry?: { coordinates?: unknown[] }; properties?: Record<string, unknown> }>
  }

  const feature = data?.features?.[0]
  const coords = feature?.geometry?.coordinates
  if (!Array.isArray(coords) || coords.length < 2) return null

  const lon = num(coords[0])
  const lat = num(coords[1])
  if (!validCoords(lat, lon)) return null

  const type = String(feature?.properties?.type ?? 'place')
  return { lat: lat as number, lon: lon as number, accuracy: `Photon ${type}`, provider: 'Photon' }
}

async function geocodeNominatim(query: string, signal: AbortSignal): Promise<GeocodeHit | null> {
  const url =
    'https://nominatim.openstreetmap.org/search' +
    `?format=json&limit=1&addressdetails=0&q=${encodeURIComponent(query)}`

  const data = (await fetchJson(url, signal)) as Array<{ lat?: unknown; lon?: unknown; type?: unknown }>
  const hit = Array.isArray(data) ? data[0] : null
  if (!hit) return null

  const lat = num(hit.lat)
  const lon = num(hit.lon)
  if (!validCoords(lat, lon)) return null

  return {
    lat: lat as number,
    lon: lon as number,
    accuracy: `OSM ${String(hit.type ?? 'place')}`,
    provider: 'Nominatim',
  }
}

const RUNNERS: Record<Exclude<GeocodeProviderId, 'auto'>, (q: string, s: AbortSignal) => Promise<GeocodeHit | null>> =
  {
    census: geocodeCensus,
    photon: geocodePhoton,
    osm: geocodeNominatim,
  }

/** Providers a request should try, in order. */
function chainFor(provider: GeocodeProviderId): Array<Exclude<GeocodeProviderId, 'auto'>> {
  if (provider === 'auto') return ['census', 'photon', 'osm']
  return [provider]
}

/** Nominatim's usage policy is one request per second; keep a shared gate for it. */
let osmGate: Promise<void> = Promise.resolve()

function throttleOsm(): Promise<void> {
  const wait = osmGate.then(() => new Promise<void>((resolve) => window.setTimeout(resolve, 1150)))
  osmGate = wait
  return wait
}

export interface GeocodeTask {
  key: string
  query: string
}

export interface GeocodeOutcome {
  key: string
  hit: GeocodeHit | null
  error: string
}

export interface GeocodeRunOptions {
  provider: GeocodeProviderId
  signal: AbortSignal
  onProgress: (done: number, total: number, failed: number, currentAddress: string) => void
  onResult: (outcome: GeocodeOutcome) => void
}

async function geocodeOne(
  task: GeocodeTask,
  provider: GeocodeProviderId,
  signal: AbortSignal,
): Promise<GeocodeOutcome> {
  if (!task.query.trim()) return { key: task.key, hit: null, error: 'No address to look up' }

  const cached = getCached(task.key)
  if (cached) return { key: task.key, hit: cached, error: '' }

  let lastError = ''
  for (const id of chainFor(provider)) {
    if (signal.aborted) return { key: task.key, hit: null, error: 'Cancelled' }
    try {
      if (id === 'osm') await throttleOsm()
      if (signal.aborted) return { key: task.key, hit: null, error: 'Cancelled' }

      const hit = await RUNNERS[id](task.query, signal)
      if (hit) {
        putCached(task.key, hit)
        return { key: task.key, hit, error: '' }
      }
      lastError = 'No match found'
    } catch (err) {
      if (signal.aborted) return { key: task.key, hit: null, error: 'Cancelled' }
      lastError =
        err instanceof Error
          ? err.message === 'Failed to fetch'
            ? 'Network blocked or offline'
            : err.message
          : 'Lookup failed'
    }
  }

  return { key: task.key, hit: null, error: lastError || 'No match found' }
}

/**
 * Geocode a batch of unique addresses.
 * Census and Photon run several at a time; Nominatim is forced to a single lane by its
 * own throttle, so the pool size never breaks the usage policy.
 */
export async function geocodeBatch(tasks: GeocodeTask[], options: GeocodeRunOptions): Promise<void> {
  const { provider, signal, onProgress, onResult } = options
  const total = tasks.length
  let done = 0
  let failed = 0

  if (total === 0) {
    onProgress(0, 0, 0, '')
    return
  }

  const concurrency = provider === 'osm' ? 1 : Math.min(6, Math.max(1, total))
  let cursor = 0

  const worker = async (): Promise<void> => {
    while (!signal.aborted) {
      const index = cursor++
      if (index >= total) return

      const task = tasks[index]
      const outcome = await geocodeOne(task, provider, signal)
      if (signal.aborted) return

      done++
      if (!outcome.hit) failed++
      onResult(outcome)
      onProgress(done, total, failed, task.query)
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker))
  persistCache()
}
