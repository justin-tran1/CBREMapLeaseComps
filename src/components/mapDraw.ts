import type { GeoJSONSource, LngLat, Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl'
import { SOURCE } from '../lib/basemaps'
import type { DrawnShape } from '../types'

export type DrawMode = 'polygon' | 'rectangle' | 'circle'

const CLOSE_THRESHOLD_PX = 14
const CIRCLE_STEPS = 64

export interface DrawOptions {
  map: MapLibreMap
  mode: DrawMode
  onComplete: (shape: DrawnShape) => void
  onCancel: () => void
  /** Fires as the shape changes, so the caller can show a live measurement. */
  onPreview?: (shape: DrawnShape | null) => void
}

type Ring = [number, number][]

/** A circle on the ground, as a polygon ring in [lng, lat] order. */
export function circleRing(centerLat: number, centerLng: number, radiusMeters: number): Ring {
  const ring: Ring = []
  const latRadius = (radiusMeters / 6_371_008.8) * (180 / Math.PI)
  const lngRadius = latRadius / Math.max(0.01, Math.cos((centerLat * Math.PI) / 180))

  for (let i = 0; i <= CIRCLE_STEPS; i++) {
    const angle = (i / CIRCLE_STEPS) * Math.PI * 2
    ring.push([centerLng + lngRadius * Math.cos(angle), centerLat + latRadius * Math.sin(angle)])
  }
  return ring
}

/** Turn a committed filter shape into GeoJSON for the map to draw. */
export function shapeToFeature(shape: DrawnShape): GeoJSON.Feature {
  let ring: Ring

  if (shape.kind === 'polygon') {
    ring = shape.points.map(([lat, lng]) => [lng, lat] as [number, number])
    if (ring.length > 0) ring.push(ring[0])
  } else if (shape.kind === 'rectangle') {
    const [[south, west], [north, east]] = shape.bounds
    ring = [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ]
  } else {
    ring = circleRing(shape.center[0], shape.center[1], shape.radiusMeters)
  }

  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }
}

function emptyCollection(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] }
}

/**
 * Cursor-driven drawing for the geographic filter.
 *
 * Written directly against MapLibre rather than pulled in as a plugin so the interaction
 * details stay under our control: Escape always cancels, Backspace removes the last vertex,
 * the first vertex is a real click target for closing the ring, and the map's own gestures
 * are suspended only while a shape is in flight.
 */
export class DrawController {
  private readonly map: MapLibreMap
  private readonly mode: DrawMode
  private readonly onComplete: (shape: DrawnShape) => void
  private readonly onCancel: () => void
  private readonly onPreview?: (shape: DrawnShape | null) => void

  private points: LngLat[] = []
  private dragStart: LngLat | null = null
  private dragCurrent: LngLat | null = null
  private previousCursor = ''
  private destroyed = false

  constructor(options: DrawOptions) {
    this.map = options.map
    this.mode = options.mode
    this.onComplete = options.onComplete
    this.onCancel = options.onCancel
    this.onPreview = options.onPreview

    const canvas = this.map.getCanvas()
    this.previousCursor = canvas.style.cursor
    canvas.style.cursor = 'crosshair'
    document.body.classList.add('is-drawing')

    this.map.doubleClickZoom.disable()

    if (this.mode === 'polygon') {
      this.map.on('click', this.onPolygonClick)
      this.map.on('mousemove', this.onPolygonMove)
      this.map.on('dblclick', this.onPolygonDblClick)
    } else {
      this.map.dragPan.disable()
      this.map.on('mousedown', this.onDragStart)
      this.map.on('mousemove', this.onDragMove)
      this.map.on('mouseup', this.onDragEnd)
      // A release outside the canvas still has to finish the shape.
      document.addEventListener('mouseup', this.onDocumentMouseUp)
    }

    document.addEventListener('keydown', this.onKeyDown)
  }

  private setPreviewData(features: GeoJSON.Feature[]): void {
    const source = this.map.getSource(SOURCE.draw) as GeoJSONSource | undefined
    source?.setData({ type: 'FeatureCollection', features })
  }

  private clearPreviewData(): void {
    const source = this.map.getSource(SOURCE.draw) as GeoJSONSource | undefined
    source?.setData(emptyCollection())
  }

  // ---------------------------------------------------------------- polygon

  private onPolygonClick = (event: MapMouseEvent): void => {
    if (this.destroyed) return

    // Clicking the first vertex again closes the ring.
    if (this.points.length >= 3) {
      const first = this.map.project(this.points[0])
      if (Math.hypot(first.x - event.point.x, first.y - event.point.y) <= CLOSE_THRESHOLD_PX) {
        this.finishPolygon()
        return
      }
    }

    this.points.push(event.lngLat)
    this.redrawPolygon(event.lngLat)
  }

  private onPolygonMove = (event: MapMouseEvent): void => {
    if (this.destroyed || this.points.length === 0) return
    this.redrawPolygon(event.lngLat)
  }

  private onPolygonDblClick = (event: MapMouseEvent): void => {
    if (this.destroyed) return
    event.preventDefault()
    this.finishPolygon()
  }

  private redrawPolygon(cursor: LngLat): void {
    const path: Ring = [...this.points, cursor].map((p) => [p.lng, p.lat] as [number, number])

    const features: GeoJSON.Feature[] = [
      { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: path } },
      ...this.points.map((p, i) => ({
        type: 'Feature' as const,
        properties: { first: i === 0 },
        geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
      })),
    ]

    if (this.points.length >= 2) {
      features.unshift({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [[...path, path[0]]] },
      })
      this.onPreview?.({
        kind: 'polygon',
        points: path.map(([lng, lat]) => [lat, lng] as [number, number]),
      })
    }

    this.setPreviewData(features)
  }

  /**
   * A double-click arrives as click, click, dblclick, so the ring usually ends with two
   * vertices in the same spot. Drop the duplicate before committing.
   */
  private dedupedPoints(): LngLat[] {
    const points = [...this.points]
    while (points.length >= 2) {
      const last = this.map.project(points[points.length - 1])
      const prev = this.map.project(points[points.length - 2])
      if (Math.hypot(last.x - prev.x, last.y - prev.y) > 4) break
      points.pop()
    }
    return points
  }

  private finishPolygon(): void {
    const points = this.dedupedPoints()
    if (points.length < 3) return
    this.onComplete({
      kind: 'polygon',
      points: points.map((p) => [p.lat, p.lng] as [number, number]),
    })
  }

  // ------------------------------------------------------ rectangle & circle

  private onDragStart = (event: MapMouseEvent): void => {
    if (this.destroyed) return
    this.dragStart = event.lngLat
    this.dragCurrent = event.lngLat
  }

  private onDragMove = (event: MapMouseEvent): void => {
    if (this.destroyed || !this.dragStart) return
    this.dragCurrent = event.lngLat

    const shape = this.shapeFrom(this.dragStart, event.lngLat)
    this.setPreviewData([shapeToFeature(shape)])
    this.onPreview?.(shape)
  }

  private onDragEnd = (event: MapMouseEvent): void => {
    if (this.destroyed || !this.dragStart) return
    this.commitDrag(event.lngLat)
  }

  private onDocumentMouseUp = (): void => {
    if (this.destroyed || !this.dragStart) return
    // MapLibre's own mouseup fires first when the release lands inside the canvas.
    this.commitDrag(this.dragCurrent ?? this.dragStart)
  }

  private shapeFrom(start: LngLat, end: LngLat): DrawnShape {
    if (this.mode === 'rectangle') {
      return {
        kind: 'rectangle',
        bounds: [
          [Math.min(start.lat, end.lat), Math.min(start.lng, end.lng)],
          [Math.max(start.lat, end.lat), Math.max(start.lng, end.lng)],
        ],
      }
    }
    return {
      kind: 'circle',
      center: [start.lat, start.lng],
      radiusMeters: metersBetween(start.lat, start.lng, end.lat, end.lng),
    }
  }

  private commitDrag(end: LngLat): void {
    const start = this.dragStart
    if (!start) return
    this.dragStart = null
    this.dragCurrent = null

    const shape = this.shapeFrom(start, end)

    // A stray click should not commit a filter with no area.
    if (shape.kind === 'rectangle') {
      const [[south, west], [north, east]] = shape.bounds
      if (south === north || west === east) {
        this.onCancel()
        return
      }
    } else if (shape.kind === 'circle' && shape.radiusMeters < 25) {
      this.onCancel()
      return
    }

    this.onComplete(shape)
  }

  // ------------------------------------------------------------------- misc

  private onKeyDown = (event: KeyboardEvent): void => {
    if (this.destroyed) return

    // Never swallow a keystroke aimed at a text field, so Backspace still edits the
    // search box if it has focus while a shape is in flight.
    const target = event.target as HTMLElement | null
    const typing =
      !!target &&
      (target.isContentEditable ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT')
    if (typing && event.key !== 'Escape') return

    if (event.key === 'Escape') {
      event.preventDefault()
      this.onCancel()
      return
    }
    if (this.mode !== 'polygon') return

    if (event.key === 'Enter') {
      event.preventDefault()
      this.finishPolygon()
      return
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault()
      this.undoLastPoint()
    }
  }

  private undoLastPoint(): void {
    if (this.points.length === 0) return
    this.points.pop()

    if (this.points.length === 0) {
      this.clearPreviewData()
      this.onPreview?.(null)
      return
    }
    this.redrawPolygon(this.points[this.points.length - 1])
  }

  get vertexCount(): number {
    return this.points.length
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true

    document.removeEventListener('keydown', this.onKeyDown)

    if (this.mode === 'polygon') {
      this.map.off('click', this.onPolygonClick)
      this.map.off('mousemove', this.onPolygonMove)
      this.map.off('dblclick', this.onPolygonDblClick)
    } else {
      this.map.off('mousedown', this.onDragStart)
      this.map.off('mousemove', this.onDragMove)
      this.map.off('mouseup', this.onDragEnd)
      document.removeEventListener('mouseup', this.onDocumentMouseUp)
      this.map.dragPan.enable()
    }

    this.map.getCanvas().style.cursor = this.previousCursor
    document.body.classList.remove('is-drawing')
    this.map.doubleClickZoom.enable()
    this.clearPreviewData()
    this.onPreview?.(null)
  }
}

function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = Math.PI / 180
  const dLat = (bLat - aLat) * toRad
  const dLng = (bLng - aLng) * toRad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLng / 2) ** 2
  return 2 * 6_371_008.8 * Math.asin(Math.min(1, Math.sqrt(h)))
}
