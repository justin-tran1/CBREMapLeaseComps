import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
  ScaleControl,
  type ErrorEvent as MapErrorEvent,
  type GeoJSONSource,
  type LngLatLike,
  type MapGeoJSONFeature,
  type MapMouseEvent,
} from 'maplibre-gl'
import { useApp } from '../state/AppContext'
import { BUILDING_SOURCE_ID, buildStyle, getBasemap, LAYER, SOURCE } from '../lib/basemaps'
import { markerColor } from '../lib/palette'
import { isBuildingGrade } from '../lib/geocode'
import {
  footprintKey,
  haversineMeters,
  pickFootprintForPoint,
  pointInGeometry,
  shapeAreaLabel,
  shapeBounds,
  shapeLabel,
} from '../lib/geometry'
import { BasemapSwitcher } from './BasemapSwitcher'
import { GoogleSettings } from './GoogleSettings'
import { MapSearch } from './MapSearch'
import { PropertyPopup } from './PropertyPopup'
import { DrawController, shapeToFeature, type DrawMode } from './mapDraw'
import {
  IconAlert,
  IconCircle,
  IconCube,
  IconFilter,
  IconPin,
  IconPolygon,
  IconRectangle,
  IconTarget,
  IconX,
} from './Icons'
import type { DrawnShape, Site } from '../types'

const US_CENTER: [number, number] = [-98.35, 39.5]
const US_ZOOM = 3.4
const MAX_ZOOM = 19.5
const PITCH_3D = 55

/** Buildings only exist in the tiles from this zoom, so matching runs no earlier. */
const BUILDING_MIN_ZOOM = 15
/** Cap the per-idle building sweep so a dense viewport cannot stall the frame. */
const BUILDING_MATCH_LIMIT = 400
/**
 * Largest footprint that can plausibly be the one building a suite sits in: 40,000 m² is a
 * 200 m square, which covers a large hospital podium and nothing bigger. Above it the polygon
 * is a campus, a city block or a land parcel, and OpenStreetMap has plenty of all three. Such
 * a polygon is left alone rather than highlighted, because making it clickable is exactly the
 * behaviour of covering far more ground than the subject building.
 */
const BUILDING_MAX_FOOTPRINT_SQ_M = 40_000
/**
 * Half-width, in pixels, of the box the footprint search casts around a comp's coordinate.
 * A single-pixel query is brittle: rounding, or a coordinate landing on a shared wall, can
 * miss the polygon the point is genuinely inside. Widening the net costs nothing in accuracy
 * because every candidate still has to contain the coordinate to be accepted.
 */
const FOOTPRINT_QUERY_PAD_PX = 4

interface Selection {
  siteId: string
  dealId: string | null
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

function pinElement(count: number, selected: boolean): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'pin-wrap'
  const label = count > 99 ? '99+' : String(count)
  const inner =
    count > 1
      ? `<circle cx="13" cy="12.6" r="7.6" fill="rgba(255,255,255,0.26)"/><text class="pin__count" x="13" y="16.2">${label}</text>`
      : '<circle cx="13" cy="12.6" r="4.4" fill="#ffffff"/>'

  wrapper.innerHTML =
    `<svg class="pin${selected ? ' pin--selected' : ''}" width="26" height="34" viewBox="0 0 26 34" aria-hidden="true">` +
    `<path d="M13 33.2S24.6 20.6 24.6 12.8A11.6 11.6 0 1 0 1.4 12.8C1.4 20.6 13 33.2 13 33.2Z" fill="${markerColor(count)}" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>` +
    inner +
    '</svg>'
  return wrapper
}

/** Height props for the highlight extrusion, matched to the building underneath. */
function heightProps(feature: MapGeoJSONFeature): { height: number; base: number } {
  const props = feature.properties ?? {}
  const height = Number(props.render_height ?? props.height ?? 0)
  const base = Number(props.render_min_height ?? props.min_height ?? 0)
  return {
    height: Number.isFinite(height) && height > 0 ? height : 14,
    base: Number.isFinite(base) && base > 0 ? base : 0,
  }
}

interface MapTabProps {
  hidden: boolean
  railOpen: boolean
  onOpenRail: () => void
}

export function MapTab({ hidden, railOpen, onOpenRail }: MapTabProps) {
  const {
    deals,
    filtered,
    filteredSites,
    filters,
    setFilters,
    basemap,
    setBasemap,
    theme,
    unlocatedCount,
    geocode,
    startGeocoding,
    focusRequest,
    clearFocus,
  } = useApp()

  const hostRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markersRef = useRef(new Map<string, { marker: Marker; count: number; selected: boolean }>())
  const popupRef = useRef<Popup | null>(null)
  const popupHostRef = useRef<HTMLDivElement | null>(null)
  const selectionRef = useRef<Selection | null>(null)
  const didFitRef = useRef(false)
  const wasGeocodingRef = useRef(false)
  const sweepHandleRef = useRef<number | null>(null)
  const activeFootprintRef = useRef('')
  /** Which basemap and theme the live style already reflects. */
  const appliedStyleRef = useRef('')

  const [ready, setReady] = useState(false)
  const [webgl] = useState(webglAvailable)
  const [selection, setSelectionState] = useState<Selection | null>(null)
  const [drawMode, setDrawMode] = useState<DrawMode | null>(null)
  const [previewShape, setPreviewShape] = useState<DrawnShape | null>(null)
  const [threeD, setThreeD] = useState(true)
  const [buildingsFailed, setBuildingsFailed] = useState(false)

  const setSelection = useCallback((next: Selection | null) => {
    selectionRef.current = next
    setSelectionState(next)
  }, [])

  const dark = theme === 'dark'

  // Markers are created once, so their click handlers read the live index through a ref.
  const siteIndexRef = useRef(new Map<string, Site>())
  siteIndexRef.current = useMemo(() => new Map(filteredSites.map((s) => [s.id, s])), [filteredSites])

  const openSite = useCallback(
    (site: Site) => {
      setSelection({ siteId: site.id, dealId: site.deals.length === 1 ? site.deals[0].id : null })
    },
    [setSelection],
  )

  // ------------------------------------------------------------- map set-up

  useEffect(() => {
    const host = hostRef.current
    if (!host || !webgl) return

    const map = new MapLibreMap({
      container: host,
      style: buildStyle(getBasemap(basemap), dark),
      center: US_CENTER,
      zoom: US_ZOOM,
      pitch: 0,
      maxPitch: 75,
      maxZoom: MAX_ZOOM,
      attributionControl: { compact: true },
      // Rotating with a right-drag is the standard gesture; keep the keyboard shortcuts too.
      dragRotate: true,
      pitchWithRotate: true,
    })

    map.addControl(new NavigationControl({ visualizePitch: true, showZoom: true }), 'top-left')
    map.addControl(new ScaleControl({ unit: 'imperial' }), 'bottom-right')

    const popupHost = document.createElement('div')
    popupHostRef.current = popupHost

    const popup = new Popup({
      closeButton: true,
      closeOnClick: false,
      focusAfterOpen: false,
      maxWidth: '360px',
      offset: 34,
      className: 'deal-popup',
    }).setDOMContent(popupHost)
    popup.on('close', () => {
      selectionRef.current = null
      setSelectionState(null)
    })
    popupRef.current = popup

    /*
     * A missing or blocked building source must not break the rest of the map. The failure
     * arrives either tagged with the source id or, when the tile metadata request itself is
     * refused, as a bare fetch error naming the host, so both are treated the same.
     */
    map.on('error', (event: MapErrorEvent & { sourceId?: string }) => {
      const message = String(event?.error?.message ?? '')
      if (event.sourceId === BUILDING_SOURCE_ID || message.includes('openfreemap')) {
        setBuildingsFailed(true)
      }
    })

    mapRef.current = map
    appliedStyleRef.current = `${basemap}|${dark}`

    /*
     * Deliberately not `load`. That event waits on every source, so a network that blocks
     * the building tiles would leave the map permanently uninitialised and drop the pins
     * with it. `styledata` fires as soon as the style itself is parsed, which is all the
     * markers, popups and overlays actually need.
     */
    const markReady = () => setReady(true)
    map.on('styledata', markReady)

    return () => {
      map.off('styledata', markReady)
      popupRef.current = null
      popupHostRef.current = null
      for (const entry of markersRef.current.values()) entry.marker.remove()
      markersRef.current.clear()
      map.remove()
      mapRef.current = null
      setReady(false)
    }
    // The map is created once; basemap and theme are applied by their own effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webgl])

  useEffect(() => {
    if (!ready || hidden) return
    const handle = requestAnimationFrame(() => mapRef.current?.resize())
    return () => cancelAnimationFrame(handle)
  }, [ready, hidden, railOpen])

  // ---------------------------------------------------- basemap and theme

  const applyOverlayData = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const shapeSource = map.getSource(SOURCE.shape) as GeoJSONSource | undefined
    shapeSource?.setData(
      filters.shape
        ? { type: 'FeatureCollection', features: [shapeToFeature(filters.shape)] }
        : EMPTY_FC,
    )
  }, [filters.shape])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return

    // The constructor already applied the current basemap. Re-applying it here would race
    // the first style load and leave the vector source without its tiles.
    const key = `${basemap}|${dark}`
    if (appliedStyleRef.current === key) return
    appliedStyleRef.current = key

    map.setStyle(buildStyle(getBasemap(basemap), dark))
    setBuildingsFailed(false)

    // setStyle replaces every source, so the overlays have to be re-pushed once it settles.
    map.once('styledata', () => {
      applyOverlayData()
      scheduleBuildingSweep(true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, basemap, dark])

  useEffect(() => {
    if (!ready) return
    applyOverlayData()
  }, [ready, applyOverlayData])

  // --------------------------------------------------------------- 3D view

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return

    const visibility = threeD ? 'visible' : 'none'
    for (const id of [LAYER.buildings, LAYER.buildingsComps, LAYER.buildingsActive]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibility)
    }

    const targetPitch = threeD ? PITCH_3D : 0
    if (Math.abs(map.getPitch() - targetPitch) > 1) {
      map.easeTo({ pitch: targetPitch, duration: 550 })
    }
  }, [ready, threeD, basemap])

  // --------------------------------------------------------------- markers

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return

    const registry = markersRef.current
    const seen = new Set<string>()
    const selectedSiteId = selection?.siteId ?? null

    for (const site of filteredSites) {
      seen.add(site.id)
      const isSelected = site.id === selectedSiteId
      const existing = registry.get(site.id)

      if (existing && existing.count === site.deals.length && existing.selected === isSelected) {
        continue
      }

      // MapLibre owns the marker's DOM node, so a changed pin means a fresh marker.
      existing?.marker.remove()

      const element = pinElement(site.deals.length, isSelected)
      attachPinHandler(element, site.id)
      const marker = new Marker({ element, anchor: 'bottom' })
        .setLngLat([site.lon, site.lat])
        .addTo(map)
      registry.set(site.id, { marker, count: site.deals.length, selected: isSelected })
    }

    for (const [id, entry] of registry) {
      if (seen.has(id)) continue
      entry.marker.remove()
      registry.delete(id)
    }

    function attachPinHandler(element: HTMLElement, siteId: string): void {
      element.addEventListener('click', (event) => {
        event.stopPropagation()
        const site = siteIndexRef.current.get(siteId)
        if (site) openSite(site)
      })
    }
  }, [ready, filteredSites, selection?.siteId, openSite])

  // --------------------------------------------- buildings holding comps

  /**
   * Work out which building each comp sits in, and hand that set of footprints to the map.
   *
   * Rather than sweeping every footprint in view and testing it against every comp, each
   * visible comp is projected to the screen and queried at that one point. That keeps the
   * work proportional to the number of comps on screen rather than the number of buildings.
   *
   * The footprints this produces are the only ones the map ever makes clickable, so a comp
   * whose building cannot be identified with confidence contributes nothing here and is
   * reached through its pin instead. Guessing would put the deal on a neighbour.
   */
  const runBuildingSweep = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    const source = map.getSource(SOURCE.buildingsComps) as GeoJSONSource | undefined
    if (!source) return

    if (!threeD || map.getZoom() < BUILDING_MIN_ZOOM || !map.getLayer(LAYER.buildingPick)) {
      source.setData(EMPTY_FC)
      return
    }

    const bounds = map.getBounds()
    const features: GeoJSON.Feature[] = []
    const seen = new Set<string>()
    let checked = 0

    for (const site of siteIndexRef.current.values()) {
      if (checked >= BUILDING_MATCH_LIMIT) break
      /*
       * A coordinate has to be rooftop-grade before it may name a building. A street
       * interpolation sits in the roadway, so the footprint containing it belongs to whichever
       * neighbour the interpolation drifted towards. Skipping those is what stops the map
       * showing the wrong building; the comp is still on the map, on its pin.
       */
      if (!isBuildingGrade(site.precision)) continue
      if (!bounds.contains([site.lon, site.lat] as LngLatLike)) continue
      checked++

      const { x, y } = map.project([site.lon, site.lat])
      const pad = FOOTPRINT_QUERY_PAD_PX
      let hits: MapGeoJSONFeature[]
      try {
        // The flat pick layer, never the extrusion, and a small box rather than one pixel.
        hits = map.queryRenderedFeatures(
          [
            [x - pad, y - pad],
            [x + pad, y + pad],
          ],
          { layers: [LAYER.buildingPick] },
        )
      } catch {
        continue
      }

      // Must contain the coordinate, smallest wins, and nothing campus-sized is accepted.
      const hit = pickFootprintForPoint(hits, site.lon, site.lat, BUILDING_MAX_FOOTPRINT_SQ_M)
      if (!hit) continue

      const key = footprintKey(hit.geometry)
      if (!key || seen.has(key)) continue
      seen.add(key)

      features.push({
        type: 'Feature',
        properties: { ...heightProps(hit), siteId: site.id },
        geometry: hit.geometry,
      })
    }

    source.setData({ type: 'FeatureCollection', features })
  }, [threeD])

  const scheduleBuildingSweep = useCallback(
    (immediate = false) => {
      if (sweepHandleRef.current !== null) window.clearTimeout(sweepHandleRef.current)
      sweepHandleRef.current = window.setTimeout(() => {
        sweepHandleRef.current = null
        runBuildingSweep()
      }, immediate ? 60 : 260)
    },
    [runBuildingSweep],
  )

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return

    const onIdle = () => scheduleBuildingSweep()
    map.on('idle', onIdle)
    scheduleBuildingSweep(true)

    return () => {
      map.off('idle', onIdle)
      if (sweepHandleRef.current !== null) {
        window.clearTimeout(sweepHandleRef.current)
        sweepHandleRef.current = null
      }
    }
  }, [ready, scheduleBuildingSweep, filteredSites])

  // ------------------------------------------- clicking a building or map

  const setActiveFootprint = useCallback((feature: MapGeoJSONFeature | null) => {
    const map = mapRef.current
    if (!map) return
    const source = map.getSource(SOURCE.buildingsActive) as GeoJSONSource | undefined
    if (!source) return

    const key = feature ? footprintKey(feature.geometry) : ''
    if (key === activeFootprintRef.current) return
    activeFootprintRef.current = key

    source.setData(
      feature
        ? {
            type: 'FeatureCollection',
            features: [
              { type: 'Feature', properties: heightProps(feature), geometry: feature.geometry },
            ],
          }
        : EMPTY_FC,
    )
  }, [])

  /**
   * The comp behind a clicked footprint.
   *
   * The sweep stamps every footprint it emits with the site that claimed it, which answers
   * this outright almost every time. Two comps that geocoded to different points inside one
   * building do share a footprint, and there the click position settles it.
   */
  const siteForFootprint = useCallback(
    (feature: MapGeoJSONFeature, atLng: number, atLat: number): Site | null => {
      const inside: Site[] = []
      for (const site of siteIndexRef.current.values()) {
        if (pointInGeometry(site.lon, site.lat, feature.geometry)) inside.push(site)
      }

      if (inside.length === 0) {
        const stamped = feature.properties?.siteId
        return typeof stamped === 'string' ? siteIndexRef.current.get(stamped) ?? null : null
      }

      return inside.reduce((best, site) =>
        haversineMeters(site.lat, site.lon, atLat, atLng) <
        haversineMeters(best.lat, best.lon, atLat, atLng)
          ? site
          : best,
      )
    },
    [],
  )

  /*
   * Only the vetted footprints are clickable.
   *
   * Querying every building in view and then asking which comps fall inside the answer is
   * what made the target so much larger than the building: a campus or block polygon holding
   * one comp turned the whole campus into a hit area. The comps layer already holds one
   * footprint per identified building, so hit-testing that layer alone makes the target
   * exactly the green solid on screen, which is the building the user is aiming at.
   */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return

    const pickBuilding = (event: MapMouseEvent): MapGeoJSONFeature | null => {
      if (!map.getLayer(LAYER.buildingsComps)) return null
      const hits = map.queryRenderedFeatures(event.point, { layers: [LAYER.buildingsComps] })
      // Extrusion hits come back nearest-camera first, so this is the one being looked at.
      return hits[0] ?? null
    }

    const onClick = (event: MapMouseEvent) => {
      if (drawMode) return
      const building = pickBuilding(event)
      if (!building) return

      const site = siteForFootprint(building, event.lngLat.lng, event.lngLat.lat)
      if (!site) return

      setActiveFootprint(building)
      openSite(site)
    }

    let hoverKey = ''
    const onMove = (event: MapMouseEvent) => {
      if (drawMode) return
      const building = pickBuilding(event)
      const key = building ? footprintKey(building.geometry) : ''
      if (key === hoverKey) return
      hoverKey = key

      map.getCanvas().style.cursor = building ? 'pointer' : ''
      if (!selectionRef.current) setActiveFootprint(building)
    }

    map.on('click', onClick)
    map.on('mousemove', onMove)
    return () => {
      map.off('click', onClick)
      map.off('mousemove', onMove)
      map.getCanvas().style.cursor = ''
    }
  }, [ready, drawMode, openSite, siteForFootprint, setActiveFootprint])

  // ---------------------------------------------------------------- popup

  const selectedSite = selection ? siteIndexRef.current.get(selection.siteId) ?? null : null
  const selectedDeal =
    selectedSite && selection?.dealId
      ? selectedSite.deals.find((d) => d.id === selection.dealId) ?? null
      : null

  useEffect(() => {
    if (!selection) return
    if (!selectedSite) {
      setSelection(null)
      return
    }
    if (selection.dealId && !selectedDeal) {
      setSelection({
        siteId: selectedSite.id,
        dealId: selectedSite.deals.length === 1 ? selectedSite.deals[0].id : null,
      })
    }
  }, [selection, selectedSite, selectedDeal, setSelection])

  useEffect(() => {
    const map = mapRef.current
    const popup = popupRef.current
    if (!map || !popup || !ready) return

    if (!selectedSite) {
      if (popup.isOpen()) popup.remove()
      setActiveFootprint(null)
      return
    }

    popup.setLngLat([selectedSite.lon, selectedSite.lat])
    if (!popup.isOpen()) popup.addTo(map)
  }, [ready, selectedSite, setActiveFootprint])

  useLayoutEffect(() => {
    const popup = popupRef.current
    if (!selectedSite || !popup?.isOpen()) return
    // Swapping the picker for the detail view changes the height, and MapLibre only
    // re-measures on a position change, so re-set the anchor it already has.
    popup.setLngLat(popup.getLngLat())
  }, [selectedSite, selectedDeal])

  // ---------------------------------------------------------- view fitting

  const fitToSites = useCallback((animate = true) => {
    const map = mapRef.current
    if (!map) return

    const sites = siteIndexRef.current
    if (sites.size === 0) {
      map.easeTo({ center: US_CENTER, zoom: US_ZOOM, duration: animate ? 600 : 0 })
      return
    }

    const bounds = new LngLatBounds()
    for (const site of sites.values()) bounds.extend([site.lon, site.lat])

    map.fitBounds(bounds, { padding: 72, maxZoom: 16, duration: animate ? 700 : 0 })
  }, [])

  useEffect(() => {
    if (!ready || hidden || didFitRef.current || filteredSites.length === 0) return
    didFitRef.current = true
    fitToSites(false)
  }, [ready, hidden, filteredSites, fitToSites])

  useEffect(() => {
    if (filteredSites.length === 0) didFitRef.current = false
  }, [filteredSites.length])

  useEffect(() => {
    if (wasGeocodingRef.current && !geocode.running) {
      wasGeocodingRef.current = false
      if (!hidden) fitToSites()
    }
    if (geocode.running) wasGeocodingRef.current = true
  }, [geocode.running, hidden, fitToSites])

  // --------------------------------------------------------------- drawing

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !drawMode) return

    setSelection(null)

    const controller = new DrawController({
      map,
      mode: drawMode,
      onComplete: (shape) => {
        setFilters((prev) => ({ ...prev, shape }))
        setDrawMode(null)
      },
      onCancel: () => setDrawMode(null),
      onPreview: setPreviewShape,
    })

    return () => {
      controller.destroy()
      setPreviewShape(null)
    }
  }, [ready, drawMode, setFilters, setSelection])

  // ----------------------------------------------------------- focus jumps

  const jumpToSite = useCallback(
    (site: Site, dealId: string | null = null) => {
      const map = mapRef.current
      if (!map) return
      map.flyTo({
        center: [site.lon, site.lat],
        zoom: Math.max(map.getZoom(), 16.5),
        pitch: threeD ? PITCH_3D : 0,
        duration: 900,
      })
      setSelection({
        siteId: site.id,
        dealId: dealId ?? (site.deals.length === 1 ? site.deals[0].id : null),
      })
    },
    [setSelection, threeD],
  )

  useEffect(() => {
    if (!focusRequest || !ready || hidden) return
    const site = filteredSites.find((s) => s.deals.some((d) => d.id === focusRequest.dealId))
    if (site) jumpToSite(site, focusRequest.dealId)
    clearFocus()
  }, [focusRequest, ready, hidden, filteredSites, clearFocus, jumpToSite])

  // ----------------------------------------------------------------- render

  const activeShape = previewShape ?? filters.shape
  const mappedCount = filtered.filter((d) => d.lat !== null && d.lon !== null).length
  const hiddenByLocation = filtered.length - mappedCount
  const buildingGradeCount = filteredSites.filter((s) => isBuildingGrade(s.precision)).length
  const looselyLocated = filteredSites.length - buildingGradeCount

  const drawHint =
    drawMode === 'polygon'
      ? 'Click to place points. Click the first point, double-click, or press Enter to close. Backspace removes a point, Escape cancels.'
      : drawMode === 'rectangle'
        ? 'Drag to draw a rectangle. Escape cancels.'
        : drawMode === 'circle'
          ? 'Drag out from the centre to set a radius. Escape cancels.'
          : ''

  if (!webgl) {
    return (
      <div className="mapwrap" style={hidden ? { display: 'none' } : undefined}>
        <div className="empty-state">
          <IconAlert size={26} />
          <div className="empty-state__title">This browser cannot draw the 3D map</div>
          <p className="small" style={{ maxWidth: '54ch', margin: 0 }}>
            The map needs WebGL, which is switched off or unavailable here. Try Chrome or Edge, or
            ask IT to enable hardware acceleration. The Dashboard tab works without it and still
            covers every filter, chart and the full data table.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mapwrap" style={hidden ? { display: 'none' } : undefined}>
      <div ref={hostRef} className="mapcanvas" role="application" aria-label="Lease comp map" />

      <div className="map-overlay map-topleft">
        <div className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
          {!railOpen && (
            <button
              type="button"
              className="btn floatcard"
              onClick={onOpenRail}
              title="Show filters"
              style={{ flex: '0 0 auto' }}
            >
              <IconFilter size={14} />
              Filters
            </button>
          )}
          <MapSearch sites={filteredSites} onSelect={(site) => jumpToSite(site)} />
        </div>

        {drawMode && (
          <div className="map-hint" role="status">
            <IconPolygon size={14} />
            <span>{drawHint}</span>
            <button
              type="button"
              className="chip__x"
              onClick={() => setDrawMode(null)}
              aria-label="Cancel drawing"
              style={{ color: 'inherit' }}
            >
              <IconX size={12} />
            </button>
          </div>
        )}
      </div>

      <div className="map-overlay map-topright">
        <BasemapSwitcher value={basemap} onChange={setBasemap} />
        <GoogleSettings />

        <div className="floatcard maptools" role="group" aria-label="Map tools">
          <button
            type="button"
            className="maptool"
            aria-pressed={threeD}
            onClick={() => setThreeD((v) => !v)}
            title="Tilt into the 3D building view, or drop back to a flat map"
          >
            <IconCube size={15} />
            {threeD ? '3D buildings on' : '3D buildings off'}
          </button>

          <div className="maptool__sep" />

          <button
            type="button"
            className="maptool"
            aria-pressed={drawMode === 'polygon'}
            onClick={() => setDrawMode((m) => (m === 'polygon' ? null : 'polygon'))}
            title="Filter to a shape you trace point by point"
          >
            <IconPolygon size={15} />
            Draw area
          </button>
          <button
            type="button"
            className="maptool"
            aria-pressed={drawMode === 'rectangle'}
            onClick={() => setDrawMode((m) => (m === 'rectangle' ? null : 'rectangle'))}
            title="Filter to a rectangle"
          >
            <IconRectangle size={15} />
            Rectangle
          </button>
          <button
            type="button"
            className="maptool"
            aria-pressed={drawMode === 'circle'}
            onClick={() => setDrawMode((m) => (m === 'circle' ? null : 'circle'))}
            title="Filter to a radius"
          >
            <IconCircle size={15} />
            Radius
          </button>

          <div className="maptool__sep" />

          <button
            type="button"
            className="maptool"
            onClick={() => fitToSites()}
            title="Zoom the map to the deals currently showing"
          >
            <IconTarget size={15} />
            Zoom to results
          </button>

          {filters.shape && (
            <button
              type="button"
              className="maptool"
              onClick={() => setFilters((prev) => ({ ...prev, shape: null }))}
              title="Remove the drawn geography filter"
            >
              <IconX size={15} />
              Clear drawn area
            </button>
          )}
        </div>
      </div>

      <div className="map-overlay map-bottomleft">
        {activeShape && (
          <div className="floatcard map-status">
            <div className="map-status__line">
              <IconPolygon size={13} />
              <span>
                {shapeLabel(activeShape)} · <strong>{shapeAreaLabel(activeShape)}</strong>
              </span>
            </div>
            {filters.shape && !previewShape && (
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => {
                  const box = shapeBounds(filters.shape as DrawnShape)
                  if (!box) return
                  mapRef.current?.fitBounds(
                    [
                      [box[0][1], box[0][0]],
                      [box[1][1], box[1][0]],
                    ],
                    { padding: 56 },
                  )
                }}
              >
                Zoom to drawn area
              </button>
            )}
          </div>
        )}

        <div className="floatcard map-status">
          <div className="map-status__line">
            <IconPin size={13} />
            <span>
              <strong>{mappedCount.toLocaleString('en-US')}</strong> of{' '}
              {deals.length.toLocaleString('en-US')} deals mapped across{' '}
              <strong>{filteredSites.length.toLocaleString('en-US')}</strong>{' '}
              {filteredSites.length === 1 ? 'location' : 'locations'}
            </span>
          </div>

          {threeD && !buildingsFailed && (
            <div className="map-status__line muted">
              <IconCube size={13} />
              <span>Zoom past street level, then click a green building for its deals</span>
            </div>
          )}

          {/*
            Say why a building is not green, because silence reads as a bug. A comp located by
            street interpolation sits in the roadway, so the map declines to name a building
            for it rather than colour in a neighbour.
          */}
          {threeD && !buildingsFailed && looselyLocated > 0 && (
            <div className="map-status__line muted">
              <IconTarget size={13} />
              <span>
                {buildingGradeCount.toLocaleString('en-US')} of{' '}
                {filteredSites.length.toLocaleString('en-US')} located precisely enough to name a
                building. {looselyLocated.toLocaleString('en-US')} came back as a street
                interpolation and stay on their pins.
              </span>
            </div>
          )}

          {buildingsFailed && (
            <div className="map-status__line" style={{ color: 'var(--warn-ink)' }}>
              <IconAlert size={13} />
              <span>Building shapes could not load. Pins and every filter still work.</span>
            </div>
          )}

          {hiddenByLocation > 0 && (
            <div className="map-status__line" style={{ color: 'var(--warn-ink)' }}>
              <IconAlert size={13} />
              <span>
                {hiddenByLocation.toLocaleString('en-US')} matching{' '}
                {hiddenByLocation === 1 ? 'row has' : 'rows have'} no coordinates
              </span>
            </div>
          )}

          {unlocatedCount > 0 && !geocode.running && (
            <button type="button" className="btn btn--sm btn--primary" onClick={() => startGeocoding(true)}>
              Locate {unlocatedCount.toLocaleString('en-US')} remaining{' '}
              {unlocatedCount === 1 ? 'address' : 'addresses'}
            </button>
          )}
        </div>

        <div className="floatcard legend" aria-hidden="true">
          <span className="legend__item">
            <span className="legend__dot" style={{ background: markerColor(1) }} /> 1 to 3 deals
          </span>
          <span className="legend__item">
            <span className="legend__dot" style={{ background: markerColor(4) }} /> 4 to 9
          </span>
          <span className="legend__item">
            <span className="legend__dot" style={{ background: markerColor(10) }} /> 10 or more
          </span>
        </div>
      </div>

      {popupHostRef.current &&
        selectedSite &&
        createPortal(
          <PropertyPopup
            site={selectedSite}
            deal={selectedDeal}
            onSelectDeal={(dealId) => setSelection({ siteId: selectedSite.id, dealId })}
          />,
          popupHostRef.current,
        )}
    </div>
  )
}
