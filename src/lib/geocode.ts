/**
 * Address geocoding.
 *
 * Everything runs in the browser, and every result is cached in localStorage so a re-upload
 * of the same book costs no network calls.
 *
 *  - google   Google Geocoding API. Needs a key. The only provider that reports rooftop
 *             precision explicitly, and it returns a place id, so it is tried first when a
 *             key is present.
 *  - photon   Komoot's OpenStreetMap geocoder. Worldwide, key-less, and it names the OSM
 *             object it matched, which is how a building-grade result is recognised.
 *  - census   US Census Bureau geocoder. US only, key-less, and always a street-range
 *             interpolation: reliable for plotting a pin, never precise enough to name a
 *             building.
 *  - osm      Nominatim. Worldwide, key-less, capped at one request per second by policy, so
 *             it is a last resort rather than a first choice.
 *
 * Precision is carried on every hit and is what decides whether a comp may claim a building.
 */

import { getGoogleKey, hasGoogleKey } from './googleMaps'
import type { GeocodePrecision } from '../types'

export type { GeocodePrecision }

export type GeocodeProviderId = 'auto' | 'google' | 'census' | 'photon' | 'osm'

export const PRECISION_RANK: Record<GeocodePrecision, number> = {
  approximate: 0,
  interpolated: 1,
  parcel: 2,
  rooftop: 3,
}

export const PRECISION_LABEL: Record<GeocodePrecision, string> = {
  approximate: 'Approximate',
  interpolated: 'Street interpolation',
  parcel: 'Address point',
  rooftop: 'Rooftop',
}

/**
 * A comp may only claim a building when its coordinate is rooftop-grade.
 *
 * This is the rule that stops the map naming the wrong building. A street-interpolated
 * coordinate sits in the roadway, so whichever footprint happens to contain it is a
 * neighbour as often as not. Such a comp still plots a pin and still fills the dashboard; it
 * just never turns a building green.
 */
export const MIN_BUILDING_PRECISION: GeocodePrecision = 'rooftop'

export function isBuildingGrade(precision: GeocodePrecision): boolean {
  return PRECISION_RANK[precision] >= PRECISION_RANK[MIN_BUILDING_PRECISION]
}

/** Good enough to stop asking other providers. Below this, a second opinion is worth having. */
const SUFFICIENT_PRECISION: GeocodePrecision = 'parcel'

export interface GeocodeHit {
  lat: number
  lon: number
  accuracy: string
  provider: string
  precision: GeocodePrecision
  /** Google place id, when Google resolved the address. Enables exact click matching in 3D. */
  placeId?: string
}

export interface ProviderInfo {
  id: GeocodeProviderId
  label: string
  description: string
  /** Hidden from the picker until a Google API key is present. */
  needsGoogleKey?: boolean
}

export const GEOCODE_PROVIDERS: ProviderInfo[] = [
  {
    id: 'auto',
    label: 'Automatic (recommended)',
    description:
      'Takes the most precise answer available: Google first when a key is set, then Photon, then the Census, then Nominatim.',
  },
  {
    id: 'google',
    label: 'Google Geocoding',
    description: 'Rooftop coordinates and a place id. Needs a Google Maps Platform key.',
    needsGoogleKey: true,
  },
  { id: 'photon', label: 'Photon (OpenStreetMap)', description: 'Worldwide, key-less. Often matches the building itself.' },
  {
    id: 'census',
    label: 'US Census Bureau',
    description: 'United States only, key-less. Interpolates along the street, so it cannot name a building.',
  },
  { id: 'osm', label: 'Nominatim (OpenStreetMap)', description: 'Worldwide, key-less. Limited to one lookup per second.' },
]

/** Providers the picker should offer right now. */
export function availableProviders(googleKeyPresent = hasGoogleKey()): ProviderInfo[] {
  return GEOCODE_PROVIDERS.filter((p) => !p.needsGoogleKey || googleKeyPresent)
}

// Bumped for the precision field: v2 entries were all labelled as though the Census returned
// rooftop coordinates, and trusting them would keep naming the wrong buildings.
const CACHE_KEY = 'cbre-hcls-mapper.geocache.v3'
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
  if (!entry) return null
  return {
    lat: entry.lat,
    lon: entry.lon,
    accuracy: entry.accuracy,
    provider: entry.provider,
    // An entry written before precision existed is treated as the weakest grade rather than
    // assumed good, so a stale cache cannot reintroduce a wrong building.
    precision: entry.precision ?? 'approximate',
    ...(entry.placeId ? { placeId: entry.placeId } : {}),
  }
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

/**
 * Grade an OpenStreetMap match from the tags the geocoder reports.
 *
 * Both OSM geocoders name the object they matched. `building=*` is a footprint, and
 * `place=house` is an address node sitting on one, so either is the building itself. A
 * house-number match without a building is an address point on the parcel. A street match is
 * the centerline, which is no better than the Census.
 */
export function osmPrecision(objectClass: string, objectType: string, photonType = ''): GeocodePrecision {
  const cls = objectClass.trim().toLowerCase()
  const type = objectType.trim().toLowerCase()
  const kind = photonType.trim().toLowerCase()

  if (cls === 'building' || type === 'building' || type === 'house' || kind === 'house') return 'rooftop'
  if (cls === 'addr' || type === 'housenumber' || kind === 'housenumber') return 'parcel'
  if (cls === 'highway' || type === 'street' || kind === 'street') return 'approximate'
  if (cls === 'amenity' || cls === 'office' || cls === 'shop' || cls === 'healthcare') return 'parcel'
  return 'approximate'
}

/** Google's own precision vocabulary, mapped onto ours. */
export function googlePrecision(locationType: string): GeocodePrecision {
  switch (locationType.trim().toUpperCase()) {
    case 'ROOFTOP':
      return 'rooftop'
    case 'RANGE_INTERPOLATED':
      return 'interpolated'
    case 'GEOMETRIC_CENTER':
      return 'parcel'
    default:
      return 'approximate'
  }
}

export interface GoogleGeocodeResponse {
  status?: string
  error_message?: string
  results?: Array<{
    geometry?: { location?: { lat?: unknown; lng?: unknown }; location_type?: unknown }
    place_id?: unknown
    partial_match?: unknown
  }>
}

/** Turn a Google Geocoding payload into a hit. Exported so the tests read the real parser. */
export function parseGoogleResponse(data: GoogleGeocodeResponse): GeocodeHit | null {
  if (data?.status && data.status !== 'OK') {
    // ZERO_RESULTS is an answer, not a fault. Everything else is worth surfacing, because
    // REQUEST_DENIED and OVER_QUERY_LIMIT both mean the key needs attention.
    if (data.status === 'ZERO_RESULTS') return null
    throw new Error(data.error_message ? `Google: ${data.error_message}` : `Google: ${data.status}`)
  }

  const result = data?.results?.[0]
  const lat = num(result?.geometry?.location?.lat)
  const lon = num(result?.geometry?.location?.lng)
  if (!validCoords(lat, lon)) return null

  const locationType = String(result?.geometry?.location_type ?? '')
  // A partial match resolved something other than the address asked for, so it cannot be
  // trusted to name a building however precise Google says the coordinate is.
  const precision = result?.partial_match === true ? 'approximate' : googlePrecision(locationType)
  const placeId = typeof result?.place_id === 'string' ? result.place_id : ''

  return {
    lat: lat as number,
    lon: lon as number,
    accuracy: `Google ${PRECISION_LABEL[precision].toLowerCase()}`,
    provider: 'Google',
    precision,
    ...(placeId ? { placeId } : {}),
  }
}

async function geocodeGoogle(query: string, signal: AbortSignal): Promise<GeocodeHit | null> {
  const key = getGoogleKey()
  if (!key) throw new Error('No Google API key set')

  const url =
    'https://maps.googleapis.com/maps/api/geocode/json' +
    `?address=${encodeURIComponent(query)}&key=${encodeURIComponent(key)}`

  return parseGoogleResponse((await fetchJson(url, signal)) as GoogleGeocodeResponse)
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

  /*
   * Always interpolated, never rooftop. The Census geocoder walks the house-number range
   * along a TIGER street centerline and returns a point on that line, so the coordinate sits
   * in the roadway. It is dependable for a pin and unusable for naming a building, and
   * labelling it "rooftop" is what put comps on their neighbours' buildings.
   */
  return {
    lat: lat as number,
    lon: lon as number,
    accuracy: 'Census street interpolation',
    provider: 'US Census',
    precision: 'interpolated',
  }
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

  const props = feature?.properties ?? {}
  const type = String(props.type ?? 'place')
  const precision = osmPrecision(String(props.osm_key ?? ''), String(props.osm_value ?? ''), type)

  return {
    lat: lat as number,
    lon: lon as number,
    accuracy: `Photon ${type}`,
    provider: 'Photon',
    precision,
  }
}

async function geocodeNominatim(query: string, signal: AbortSignal): Promise<GeocodeHit | null> {
  const url =
    'https://nominatim.openstreetmap.org/search' +
    `?format=json&limit=1&addressdetails=0&q=${encodeURIComponent(query)}`

  const data = (await fetchJson(url, signal)) as Array<{
    lat?: unknown
    lon?: unknown
    type?: unknown
    class?: unknown
  }>
  const hit = Array.isArray(data) ? data[0] : null
  if (!hit) return null

  const lat = num(hit.lat)
  const lon = num(hit.lon)
  if (!validCoords(lat, lon)) return null

  return {
    lat: lat as number,
    lon: lon as number,
    accuracy: `OSM ${String(hit.class ?? 'place')}/${String(hit.type ?? 'place')}`,
    provider: 'Nominatim',
    precision: osmPrecision(String(hit.class ?? ''), String(hit.type ?? '')),
  }
}

const RUNNERS: Record<Exclude<GeocodeProviderId, 'auto'>, (q: string, s: AbortSignal) => Promise<GeocodeHit | null>> =
  {
    google: geocodeGoogle,
    census: geocodeCensus,
    photon: geocodePhoton,
    osm: geocodeNominatim,
  }

/**
 * Providers a request should try, in order.
 *
 * Photon leads the key-less chain because it is the only one that can return a building-grade
 * match, and the Census follows as the dependable fallback for a US coordinate. Nominatim is
 * last: its one-per-second policy makes it too slow to lead, but it is a good second opinion
 * when nothing better has turned up. Google leads whenever a key is set.
 */
export function chainFor(
  provider: GeocodeProviderId,
  googleKeyPresent = hasGoogleKey(),
): Array<Exclude<GeocodeProviderId, 'auto'>> {
  if (provider !== 'auto') return [provider]
  return googleKeyPresent ? ['google', 'photon', 'census', 'osm'] : ['photon', 'census', 'osm']
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

  /*
   * Best precision wins, not first answer wins.
   *
   * The old loop stopped at the first provider that returned anything, and with the Census
   * leading that meant every US address settled for a street interpolation even when Photon
   * held the actual building. Now each provider runs until something precise enough is in
   * hand, and the most precise answer seen is the one kept.
   */
  let best: GeocodeHit | null = null
  let lastError = ''

  for (const id of chainFor(provider)) {
    if (best && PRECISION_RANK[best.precision] >= PRECISION_RANK[SUFFICIENT_PRECISION]) break
    if (signal.aborted) return { key: task.key, hit: null, error: 'Cancelled' }

    try {
      if (id === 'osm') await throttleOsm()
      if (signal.aborted) return { key: task.key, hit: null, error: 'Cancelled' }

      const hit = await RUNNERS[id](task.query, signal)
      if (hit && (!best || PRECISION_RANK[hit.precision] > PRECISION_RANK[best.precision])) {
        best = hit
      } else if (!hit) {
        lastError = 'No match found'
      }
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

  if (best) {
    putCached(task.key, best)
    return { key: task.key, hit: best, error: '' }
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
