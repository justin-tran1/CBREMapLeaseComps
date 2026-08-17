import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import L from 'leaflet'
import { useApp } from '../state/AppContext'
import { getBasemap } from '../lib/basemaps'
import { markerColor } from '../lib/palette'
import { shapeAreaLabel, shapeBounds, shapeLabel } from '../lib/geometry'
import { BasemapSwitcher } from './BasemapSwitcher'
import { MapSearch } from './MapSearch'
import { PropertyPopup } from './PropertyPopup'
import { DrawController, renderShape, type DrawMode } from './mapDraw'
import {
  IconAlert,
  IconCircle,
  IconFilter,
  IconPin,
  IconPolygon,
  IconRectangle,
  IconTarget,
  IconX,
} from './Icons'
import type { DrawnShape, Site } from '../types'

const US_CENTER: L.LatLngExpression = [39.5, -98.35]
const US_ZOOM = 4
const MAX_ZOOM = 20

interface Selection {
  siteId: string
  dealId: string | null
}

function pinIcon(count: number, selected: boolean): L.DivIcon {
  const fill = markerColor(count)
  const label = count > 99 ? '99+' : String(count)
  const inner =
    count > 1
      ? `<circle cx="13" cy="12.6" r="7.6" fill="rgba(255,255,255,0.24)"/><text class="pin__count" x="13" y="16.2">${label}</text>`
      : '<circle cx="13" cy="12.6" r="4.4" fill="#ffffff"/>'

  return L.divIcon({
    className: 'pin-wrap',
    iconSize: [26, 34],
    iconAnchor: [13, 33],
    popupAnchor: [0, -31],
    html:
      `<svg class="pin${selected ? ' pin--selected' : ''}" width="26" height="34" viewBox="0 0 26 34" aria-hidden="true">` +
      `<path d="M13 33.2S24.6 20.6 24.6 12.8A11.6 11.6 0 1 0 1.4 12.8C1.4 20.6 13 33.2 13 33.2Z" fill="${fill}" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>` +
      inner +
      '</svg>',
  })
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
  const mapRef = useRef<L.Map | null>(null)
  const baseLayerRef = useRef<L.TileLayer | null>(null)
  const overlayLayerRef = useRef<L.TileLayer | null>(null)
  const markerLayerRef = useRef<L.LayerGroup | null>(null)
  const markersRef = useRef(new Map<string, { marker: L.Marker; count: number; selected: boolean }>())
  const shapeLayerRef = useRef<L.LayerGroup | null>(null)
  const popupRef = useRef<L.Popup | null>(null)
  const popupHostRef = useRef<HTMLDivElement | null>(null)
  const selectionRef = useRef<Selection | null>(null)
  const didFitRef = useRef(false)
  const wasGeocodingRef = useRef(false)

  const [ready, setReady] = useState(false)
  const [selection, setSelectionState] = useState<Selection | null>(null)
  const [drawMode, setDrawMode] = useState<DrawMode | null>(null)
  const [previewShape, setPreviewShape] = useState<DrawnShape | null>(null)

  const setSelection = useCallback((next: Selection | null) => {
    selectionRef.current = next
    setSelectionState(next)
  }, [])

  const basemapDef = getBasemap(basemap)
  const darkCanvas = basemapDef.dark === true || theme === 'dark'

  // A marker's click handler is created once, so read the current sites through a ref.
  const filteredSitesRef = useRef(new Map<string, Site>())
  filteredSitesRef.current = useMemo(
    () => new Map(filteredSites.map((s) => [s.id, s])),
    [filteredSites],
  )

  // ------------------------------------------------------------- map set-up

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const map = L.map(host, {
      center: US_CENTER,
      zoom: US_ZOOM,
      maxZoom: MAX_ZOOM,
      zoomControl: true,
      worldCopyJump: true,
      zoomSnap: 0.5,
    })

    L.control.scale({ imperial: true, metric: false, position: 'bottomright' }).addTo(map)

    markerLayerRef.current = L.layerGroup().addTo(map)
    shapeLayerRef.current = L.layerGroup().addTo(map)

    const popupHost = document.createElement('div')
    L.DomEvent.disableClickPropagation(popupHost)
    L.DomEvent.disableScrollPropagation(popupHost)
    popupHostRef.current = popupHost

    const popup = L.popup({
      maxWidth: 360,
      minWidth: 340,
      autoPan: true,
      // Extra headroom so an opening popup never slides under the search row.
      autoPanPaddingTopLeft: [24, 76],
      autoPanPaddingBottomRight: [24, 32],
      keepInView: false,
      closeOnClick: false,
      className: 'deal-popup',
    }).setContent(popupHost)
    popupRef.current = popup

    const onPopupClose = (event: L.PopupEvent) => {
      if (event.popup === popupRef.current) {
        selectionRef.current = null
        setSelectionState(null)
      }
    }
    map.on('popupclose', onPopupClose)

    mapRef.current = map
    setReady(true)

    return () => {
      map.off('popupclose', onPopupClose)
      map.remove()
      mapRef.current = null
      baseLayerRef.current = null
      overlayLayerRef.current = null
      markerLayerRef.current = null
      shapeLayerRef.current = null
      popupRef.current = null
      popupHostRef.current = null
      markersRef.current.clear()
      setReady(false)
    }
  }, [])

  // Leaflet needs a nudge whenever its container changes size.
  useEffect(() => {
    if (!ready || hidden) return
    const handle = requestAnimationFrame(() => mapRef.current?.invalidateSize())
    return () => cancelAnimationFrame(handle)
  }, [ready, hidden, railOpen])

  // -------------------------------------------------------------- basemaps

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return

    const def = getBasemap(basemap)

    baseLayerRef.current?.remove()
    overlayLayerRef.current?.remove()
    overlayLayerRef.current = null

    const base = L.tileLayer(def.url, {
      attribution: def.attribution,
      maxZoom: MAX_ZOOM,
      maxNativeZoom: def.maxZoom,
      subdomains: def.subdomains ?? 'abc',
      zIndex: 1,
      crossOrigin: true,
    }).addTo(map)
    baseLayerRef.current = base

    if (def.overlayUrl) {
      overlayLayerRef.current = L.tileLayer(def.overlayUrl, {
        maxZoom: MAX_ZOOM,
        maxNativeZoom: def.overlayMaxZoom ?? def.maxZoom,
        zIndex: 2,
        crossOrigin: true,
      }).addTo(map)
    }
  }, [ready, basemap])

  // --------------------------------------------------------------- markers

  useEffect(() => {
    const layer = markerLayerRef.current
    if (!ready || !layer) return

    const registry = markersRef.current
    const seen = new Set<string>()
    const selectedSiteId = selection?.siteId ?? null

    for (const site of filteredSites) {
      seen.add(site.id)
      const isSelected = site.id === selectedSiteId
      const existing = registry.get(site.id)

      if (existing) {
        if (existing.count !== site.deals.length || existing.selected !== isSelected) {
          existing.marker.setIcon(pinIcon(site.deals.length, isSelected))
          existing.count = site.deals.length
          existing.selected = isSelected
        }
        existing.marker.setZIndexOffset(isSelected ? 1000 : 0)
        continue
      }

      const marker = L.marker([site.lat, site.lon], {
        icon: pinIcon(site.deals.length, isSelected),
        title: site.label,
        riseOnHover: true,
        keyboard: false,
      })

      marker.on('click', () => {
        const target = filteredSitesRef.current.get(site.id)
        if (!target) return
        setSelection({
          siteId: target.id,
          dealId: target.deals.length === 1 ? target.deals[0].id : null,
        })
      })

      marker.addTo(layer)
      registry.set(site.id, { marker, count: site.deals.length, selected: isSelected })
    }

    for (const [id, entry] of registry) {
      if (seen.has(id)) continue
      layer.removeLayer(entry.marker)
      registry.delete(id)
    }
  }, [ready, filteredSites, selection?.siteId, setSelection])

  // ---------------------------------------------------------------- popup

  const selectedSite = selection ? filteredSitesRef.current.get(selection.siteId) ?? null : null
  const selectedDeal =
    selectedSite && selection?.dealId
      ? selectedSite.deals.find((d) => d.id === selection.dealId) ?? null
      : null

  // The chosen deal can be filtered out from under the popup; fall back to the picker.
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
    if (!map || !popup) return

    if (!selectedSite) {
      if (map.hasLayer(popup)) map.closePopup(popup)
      return
    }

    popup.setLatLng([selectedSite.lat, selectedSite.lon])
    if (!map.hasLayer(popup)) popup.openOn(map)
  }, [selectedSite])

  // Re-measure after React swaps the popup contents.
  useLayoutEffect(() => {
    if (!selectedSite) return
    popupRef.current?.update()
  }, [selectedSite, selectedDeal])

  // ---------------------------------------------------------- view fitting

  const fitToSites = useCallback(
    (animate = true) => {
      const map = mapRef.current
      if (!map) return

      const sites = filteredSitesRef.current
      if (sites.size === 0) {
        map.setView(US_CENTER, US_ZOOM)
        return
      }

      const bounds = L.latLngBounds([...sites.values()].map((s) => [s.lat, s.lon] as [number, number]))
      map.fitBounds(bounds, {
        padding: [56, 56],
        maxZoom: 15,
        animate,
      })
    },
    [],
  )

  useEffect(() => {
    if (!ready || hidden) return
    if (didFitRef.current) return
    if (filteredSites.length === 0) return
    didFitRef.current = true
    fitToSites(false)
  }, [ready, hidden, filteredSites, fitToSites])

  useEffect(() => {
    if (filteredSites.length === 0) didFitRef.current = false
  }, [filteredSites.length])

  // Re-frame once a geocoding pass finishes and new pins have landed.
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
      dark: darkCanvas,
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
  }, [ready, drawMode, darkCanvas, setFilters, setSelection])

  useEffect(() => {
    const layer = shapeLayerRef.current
    if (!ready || !layer) return

    layer.clearLayers()
    if (filters.shape) layer.addLayer(renderShape(filters.shape, darkCanvas))
  }, [ready, filters.shape, darkCanvas])

  // ---------------------------------------------------------- focus jumps

  useEffect(() => {
    if (!focusRequest || !ready || hidden) return

    const site = filteredSites.find((s) => s.deals.some((d) => d.id === focusRequest.dealId))
    const map = mapRef.current
    if (site && map) {
      map.flyTo([site.lat, site.lon], Math.max(map.getZoom(), 16), { duration: 0.7 })
      setSelection({ siteId: site.id, dealId: focusRequest.dealId })
    }
    clearFocus()
  }, [focusRequest, ready, hidden, filteredSites, clearFocus, setSelection])

  const jumpToSite = useCallback(
    (site: Site) => {
      const map = mapRef.current
      if (!map) return
      map.flyTo([site.lat, site.lon], Math.max(map.getZoom(), 16), { duration: 0.7 })
      setSelection({ siteId: site.id, dealId: site.deals.length === 1 ? site.deals[0].id : null })
    },
    [setSelection],
  )

  // ----------------------------------------------------------------- render

  const activeShape = previewShape ?? filters.shape
  const mappedCount = filtered.filter((d) => d.lat !== null && d.lon !== null).length
  const hiddenByLocation = filtered.length - mappedCount

  const drawHint =
    drawMode === 'polygon'
      ? 'Click to place points. Click the first point, double-click, or press Enter to close. Backspace removes a point, Escape cancels.'
      : drawMode === 'rectangle'
        ? 'Drag to draw a rectangle. Escape cancels.'
        : drawMode === 'circle'
          ? 'Drag out from the centre to set a radius. Escape cancels.'
          : ''

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
          <MapSearch sites={filteredSites} onSelect={jumpToSite} />
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

        <div className="floatcard maptools" role="group" aria-label="Map tools">
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
                  const bounds = shapeBounds(filters.shape as DrawnShape)
                  if (bounds) mapRef.current?.fitBounds(bounds, { padding: [40, 40] })
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
