import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../state/AppContext'
import { importMapsLibrary } from '../lib/googleMaps'
import { haversineMeters } from '../lib/geometry'
import { PropertyPopup } from './PropertyPopup'
import { MapSearch } from './MapSearch'
import { IconAlert, IconFilter, IconPin, IconX } from './Icons'
import type { Site } from '../types'

/**
 * The photorealistic Google engine.
 *
 * Worth knowing what this does and does not solve. Google's 3D tiles are a single
 * photogrammetry mesh: terrain, textures and buildings baked into one continuous model with no
 * per-building features in it. Nothing can be picked out of the mesh, so identifying a
 * building here has nothing to do with geometry. Instead Google reports a place id for the
 * place that was clicked, and the geocoder records a place id for every comp, so a click is
 * resolved by comparing two identifiers. That is exact: no footprint, no polygon-size rule, no
 * neighbour to get wrong.
 *
 * The cost of that exactness is that a comp geocoded by a key-less provider has no place id,
 * and Google may report a place the comp set has never heard of. Both cases fall back to the
 * nearest comp within a short distance of the click, and beyond that distance nothing opens.
 *
 * The draw tools are MapLibre-only and stay there. This view is for looking at a building.
 */

const DEFAULT_CENTER = { lat: 39.5, lng: -98.35, altitude: 0 }
const DEFAULT_RANGE_M = 4_000_000
const SITE_RANGE_M = 900
const SITE_TILT = 62
/** How near a click has to be to a comp before it counts as that comp, when no place id matches. */
const CLICK_TOLERANCE_M = 90

interface LatLngAltitude {
  lat: number
  lng: number
  altitude?: number
}

/** Only the members this view touches, so the Google types are not a build dependency. */
interface Map3DElementLike extends HTMLElement {
  center: LatLngAltitude
  range: number
  tilt: number
  heading?: number
  mode?: string
  flyCameraTo?: (options: { endCamera: Record<string, unknown>; durationMillis: number }) => void
}

interface Marker3DLike extends HTMLElement {
  position: LatLngAltitude
  label?: string
}

interface Maps3DLibrary {
  Map3DElement: new (options: Record<string, unknown>) => Map3DElementLike
  Marker3DInteractiveElement?: new (options: Record<string, unknown>) => Marker3DLike
  Marker3DElement?: new (options: Record<string, unknown>) => Marker3DLike
  MapMode?: Record<string, string>
}

/**
 * Resolve a click to a comp.
 *
 * The place id is the authority when both sides have one. Failing that, proximity decides, and
 * only inside a tolerance tight enough that the answer is the building under the cursor rather
 * than the nearest comp on the block.
 */
export function siteForClick(
  sites: readonly Site[],
  placeId: string,
  at: { lat: number; lng: number } | null,
  toleranceMeters = CLICK_TOLERANCE_M,
): Site | null {
  if (placeId) {
    const exact = sites.find((s) => s.placeId && s.placeId === placeId)
    if (exact) return exact
  }
  if (!at) return null

  let best: Site | null = null
  let bestDistance = Infinity
  for (const site of sites) {
    const distance = haversineMeters(site.lat, site.lon, at.lat, at.lng)
    if (distance < bestDistance) {
      best = site
      bestDistance = distance
    }
  }
  return best && bestDistance <= toleranceMeters ? best : null
}

interface GoogleMap3DProps {
  hidden: boolean
  railOpen: boolean
  onOpenRail: () => void
}

export function GoogleMap3D({ hidden, railOpen, onOpenRail }: GoogleMap3DProps) {
  const { filteredSites, googleKey, focusRequest, clearFocus, setMapEngine } = useApp()

  const hostRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Map3DElementLike | null>(null)
  const libRef = useRef<Maps3DLibrary | null>(null)
  const markersRef = useRef<Marker3DLike[]>([])
  const sitesRef = useRef<readonly Site[]>(filteredSites)
  sitesRef.current = filteredSites

  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dealId, setDealId] = useState<string | null>(null)

  const selected = useMemo(
    () => filteredSites.find((s) => s.id === selectedId) ?? null,
    [filteredSites, selectedId],
  )
  const selectedDeal = selected && dealId ? selected.deals.find((d) => d.id === dealId) ?? null : null

  const openSite = useCallback((site: Site) => {
    setSelectedId(site.id)
    setDealId(site.deals.length === 1 ? site.deals[0].id : null)
  }, [])

  const flyTo = useCallback((lat: number, lon: number) => {
    const map = mapRef.current
    if (!map) return
    const endCamera = { center: { lat, lng: lon, altitude: 0 }, range: SITE_RANGE_M, tilt: SITE_TILT }
    if (map.flyCameraTo) map.flyCameraTo({ endCamera, durationMillis: 1500 })
    else Object.assign(map, endCamera)
  }, [])

  // ------------------------------------------------------------------ mount

  useEffect(() => {
    const host = hostRef.current
    if (!host || !googleKey) return

    let cancelled = false

    void (async () => {
      try {
        const lib = await importMapsLibrary<Maps3DLibrary>(googleKey, 'maps3d')
        if (cancelled) return

        const map = new lib.Map3DElement({
          center: DEFAULT_CENTER,
          range: DEFAULT_RANGE_M,
          tilt: 0,
          mode: lib.MapMode?.HYBRID ?? 'HYBRID',
        })
        map.style.width = '100%'
        map.style.height = '100%'

        /*
         * Google's own popover is suppressed. It shows Google's idea of the place, and what a
         * broker needs to see is the deal, so the click is taken over entirely.
         */
        map.addEventListener('gmp-click', (event: Event) => {
          const detail = event as Event & {
            placeId?: string
            position?: { lat?: number; lng?: number }
            preventDefault?: () => void
          }
          detail.preventDefault?.()

          const at =
            typeof detail.position?.lat === 'number' && typeof detail.position?.lng === 'number'
              ? { lat: detail.position.lat, lng: detail.position.lng }
              : null
          const site = siteForClick(sitesRef.current, detail.placeId ?? '', at)
          if (site) openSite(site)
        })

        host.replaceChildren(map)
        mapRef.current = map
        libRef.current = lib
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Google Maps could not start')
        setStatus('failed')
      }
    })()

    return () => {
      cancelled = true
      markersRef.current = []
      mapRef.current = null
      libRef.current = null
      host.replaceChildren()
    }
  }, [googleKey, openSite])

  // ---------------------------------------------------------------- markers

  useEffect(() => {
    const map = mapRef.current
    const lib = libRef.current
    if (!map || !lib || status !== 'ready') return

    for (const marker of markersRef.current) marker.remove()
    markersRef.current = []

    const Marker = lib.Marker3DInteractiveElement ?? lib.Marker3DElement
    if (!Marker) return

    for (const site of filteredSites) {
      const marker = new Marker({
        position: { lat: site.lat, lng: site.lon, altitude: 0 },
        label: site.deals.length > 1 ? `${site.deals.length} deals` : site.label,
        extruded: true,
      })
      marker.addEventListener('gmp-click', (event: Event) => {
        ;(event as Event & { preventDefault?: () => void }).preventDefault?.()
        const current = sitesRef.current.find((s) => s.id === site.id)
        if (current) openSite(current)
      })
      map.append(marker)
      markersRef.current.push(marker)
    }

    return () => {
      for (const marker of markersRef.current) marker.remove()
      markersRef.current = []
    }
  }, [filteredSites, status, openSite])

  // ------------------------------------------------------------ view fitting

  const didFit = useRef(false)
  useEffect(() => {
    if (status !== 'ready' || hidden || didFit.current || filteredSites.length === 0) return
    didFit.current = true
    const first = filteredSites[0]
    flyTo(first.lat, first.lon)
  }, [status, hidden, filteredSites, flyTo])

  useEffect(() => {
    if (!focusRequest || status !== 'ready' || hidden) return
    const site = filteredSites.find((s) => s.deals.some((d) => d.id === focusRequest.dealId))
    if (site) {
      flyTo(site.lat, site.lon)
      setSelectedId(site.id)
      setDealId(focusRequest.dealId)
    }
    clearFocus()
  }, [focusRequest, status, hidden, filteredSites, clearFocus, flyTo])

  // ----------------------------------------------------------------- render

  return (
    <div className="mapwrap" style={hidden ? { display: 'none' } : undefined}>
      <div ref={hostRef} className="mapcanvas" role="application" aria-label="Photorealistic 3D lease comp map" />

      {status === 'loading' && (
        <div className="empty-state" style={{ position: 'absolute', inset: 0 }}>
          <span className="spinner" />
          <div className="empty-state__title">Starting Google Maps</div>
        </div>
      )}

      {status === 'failed' && (
        <div className="empty-state" style={{ position: 'absolute', inset: 0 }}>
          <IconAlert size={26} />
          <div className="empty-state__title">Google Maps could not start</div>
          <p className="small" style={{ maxWidth: '58ch', margin: 0 }}>
            {error} The usual causes are billing not enabled on the Cloud project, the key
            restricted to other referrers, or a corporate proxy blocking Google. Nothing is lost:
            the MapLibre engine needs no key and every filter, chart and export is unaffected.
          </p>
          <button type="button" className="btn btn--primary" onClick={() => setMapEngine('maplibre')}>
            Switch back to MapLibre
          </button>
        </div>
      )}

      <div className="map-overlay map-topleft">
        <div className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
          {!railOpen && (
            <button type="button" className="btn floatcard" onClick={onOpenRail} title="Show filters">
              <IconFilter size={14} />
              Filters
            </button>
          )}
          <MapSearch sites={filteredSites} onSelect={(site) => { flyTo(site.lat, site.lon); openSite(site) }} />
        </div>
      </div>

      {selected && (
        <div className="map-overlay map-topright g3d-panel">
          <div className="floatcard g3d-panel__card">
            <button
              type="button"
              className="chip__x g3d-panel__close"
              onClick={() => {
                setSelectedId(null)
                setDealId(null)
              }}
              aria-label="Close the deal panel"
            >
              <IconX size={12} />
            </button>
            <PropertyPopup site={selected} deal={selectedDeal} onSelectDeal={setDealId} />
          </div>
        </div>
      )}

      <div className="map-overlay map-bottomleft">
        <div className="floatcard map-status">
          <div className="map-status__line">
            <IconPin size={13} />
            <span>
              <strong>{filteredSites.length.toLocaleString('en-US')}</strong>{' '}
              {filteredSites.length === 1 ? 'location' : 'locations'} on the photorealistic map
            </span>
          </div>
          <div className="map-status__line muted">
            <span>
              Click a building or a marker for its deals. Google's 3D tiles are one continuous
              mesh, so a click is matched by place id rather than by footprint. The draw tools are
              on the MapLibre engine.
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
