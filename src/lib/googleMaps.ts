/**
 * Google Maps Platform: the API key and the Maps JavaScript loader.
 *
 * Everything Google requires a key, and this tool has no server to keep one in. The key is
 * pasted into the app and lives in this browser's local storage only. It is never written to
 * the repository, baked into a build, or sent anywhere except Google.
 *
 * The whole application works without a key. Google is an upgrade, not a dependency: the
 * key-less geocoders stay in place, and the Google map engine simply does not appear.
 */

const KEY_STORAGE = 'cbre-hcls-mapper.googleApiKey'

/**
 * 3D Maps is a Preview feature, which is served on the beta release channel. One constant so
 * a channel change is a one-line edit.
 * https://developers.google.com/maps/documentation/javascript/load-maps-js-api
 */
const MAPS_JS_CHANNEL = 'beta'
const MAPS_JS_LIBRARIES = ['maps3d', 'places'] as const

let cachedKey: string | null = null

export function getGoogleKey(): string {
  if (cachedKey !== null) return cachedKey
  try {
    cachedKey = localStorage.getItem(KEY_STORAGE) ?? ''
  } catch {
    cachedKey = ''
  }
  return cachedKey
}

export function setGoogleKey(key: string): void {
  const trimmed = key.trim()
  cachedKey = trimmed
  try {
    if (trimmed) localStorage.setItem(KEY_STORAGE, trimmed)
    else localStorage.removeItem(KEY_STORAGE)
  } catch {
    // Private browsing. The key holds for this session only.
  }
}

export function hasGoogleKey(): boolean {
  return getGoogleKey() !== ''
}

/**
 * A Maps Platform key is a long opaque string, so this only rules out the obvious paste
 * mistakes: a URL, a quoted value, or something far too short to be a key.
 */
export function looksLikeGoogleKey(key: string): boolean {
  const k = key.trim()
  if (k.length < 20) return false
  if (/^["']|["']$/.test(k)) return false
  if (/\s/.test(k)) return false
  if (/^https?:/i.test(k)) return false
  return true
}

// ------------------------------------------------------- Maps JavaScript API

/** Minimal shape of what this application touches on the Google namespace. */
interface GoogleNamespace {
  maps?: {
    importLibrary?: (name: string) => Promise<Record<string, unknown>>
  }
}

declare global {
  interface Window {
    google?: GoogleNamespace
  }
}

export function mapsJsUrl(key: string): string {
  const params = new URLSearchParams({
    key,
    v: MAPS_JS_CHANNEL,
    libraries: MAPS_JS_LIBRARIES.join(','),
    loading: 'async',
  })
  return `https://maps.googleapis.com/maps/api/js?${params.toString()}`
}

const SCRIPT_ID = 'google-maps-js'
let loader: Promise<void> | null = null

/**
 * Inject the Maps JavaScript bootstrap once and resolve when `importLibrary` is available.
 *
 * A failed load has to reject rather than hang, because the usual causes are all things a
 * user needs told: no billing on the project, the key restricted to other referrers, or a
 * corporate proxy blocking Google. A rejected loader is also discarded so a corrected key
 * can try again without a page reload.
 */
export function loadMapsJs(key: string): Promise<void> {
  if (loader) return loader

  loader = new Promise<void>((resolve, reject) => {
    if (window.google?.maps?.importLibrary) {
      resolve()
      return
    }

    const existing = document.getElementById(SCRIPT_ID)
    if (existing) existing.remove()

    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = mapsJsUrl(key)
    script.async = true
    script.onload = () => {
      if (window.google?.maps?.importLibrary) resolve()
      else reject(new Error('Google Maps loaded without the library loader'))
    }
    script.onerror = () =>
      reject(new Error('Could not load Google Maps. Check the key, its referrer restrictions, and that billing is on.'))
    document.head.appendChild(script)
  })

  loader = loader.catch((err: unknown) => {
    loader = null
    throw err
  })

  return loader
}

/** For tests, and for a key change that has to re-bootstrap. */
export function resetMapsJs(): void {
  loader = null
  document.getElementById(SCRIPT_ID)?.remove()
}

export async function importMapsLibrary<T = Record<string, unknown>>(
  key: string,
  name: string,
): Promise<T> {
  await loadMapsJs(key)
  const load = window.google?.maps?.importLibrary
  if (!load) throw new Error('Google Maps library loader unavailable')
  return (await load(name)) as T
}
