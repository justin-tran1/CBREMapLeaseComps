import L from 'leaflet'
import type { DrawnShape } from '../types'

export type DrawMode = 'polygon' | 'rectangle' | 'circle'

const STROKE_LIGHT = '#003f2d'
const STROKE_DARK = '#17e88f'
const CLOSE_THRESHOLD_PX = 14

export interface DrawOptions {
  map: L.Map
  mode: DrawMode
  dark: boolean
  onComplete: (shape: DrawnShape) => void
  onCancel: () => void
  /** Fires as the shape changes, so the caller can show a live measurement. */
  onPreview?: (shape: DrawnShape | null) => void
}

/**
 * Cursor-driven drawing for the geographic filter.
 *
 * Written directly against Leaflet rather than pulled in as a plugin so the interaction
 * details stay under our control: Escape always cancels, Backspace removes the last
 * vertex, the first vertex is a real click target for closing the ring, and the map's own
 * gestures are suspended only while a shape is in flight.
 */
export class DrawController {
  private readonly map: L.Map
  private readonly mode: DrawMode
  private readonly dark: boolean
  private readonly stroke: string
  private readonly layer: L.LayerGroup
  private readonly onComplete: (shape: DrawnShape) => void
  private readonly onCancel: () => void
  private readonly onPreview?: (shape: DrawnShape | null) => void

  private points: L.LatLng[] = []
  private vertexMarkers: L.CircleMarker[] = []
  private guide: L.Polyline | null = null
  private preview: L.Polygon | L.Rectangle | L.Circle | null = null
  private dragStart: L.LatLng | null = null
  private dragCurrent: L.LatLng | null = null
  private draggingWasEnabled = false
  private destroyed = false

  constructor(options: DrawOptions) {
    this.map = options.map
    this.mode = options.mode
    this.dark = options.dark
    this.stroke = options.dark ? STROKE_DARK : STROKE_LIGHT
    this.onComplete = options.onComplete
    this.onCancel = options.onCancel
    this.onPreview = options.onPreview

    this.layer = L.layerGroup().addTo(this.map)
    this.map.getContainer().classList.add('drawing')
    // Leaflet suppresses text selection inside its own drag handler, which never runs while
    // a shape is being drawn, so suppress it here instead.
    document.body.classList.add('is-drawing')
    this.map.doubleClickZoom.disable()
    this.map.boxZoom.disable()

    if (this.mode === 'polygon') {
      this.map.on('click', this.onPolygonClick)
      this.map.on('mousemove', this.onPolygonMove)
      this.map.on('dblclick', this.onPolygonDblClick)
    } else {
      this.draggingWasEnabled = this.map.dragging.enabled()
      this.map.dragging.disable()
      this.map.on('mousedown', this.onDragStart)
      this.map.on('mousemove', this.onDragMove)
      this.map.on('mouseup', this.onDragEnd)
      // A release outside the map still has to finish the shape.
      document.addEventListener('mouseup', this.onDocumentMouseUp)
    }

    document.addEventListener('keydown', this.onKeyDown)
  }

  private pathStyle(dashed: boolean): L.PathOptions {
    return {
      color: this.stroke,
      weight: 2,
      opacity: 0.95,
      dashArray: dashed ? '6 5' : undefined,
      fillColor: this.stroke,
      fillOpacity: this.dark ? 0.14 : 0.08,
      interactive: false,
    }
  }

  // ---------------------------------------------------------------- polygon

  private onPolygonClick = (event: L.LeafletMouseEvent): void => {
    if (this.destroyed) return

    // Clicking the first vertex again closes the ring.
    if (this.points.length >= 3) {
      const first = this.map.latLngToContainerPoint(this.points[0])
      if (first.distanceTo(event.containerPoint) <= CLOSE_THRESHOLD_PX) {
        this.finishPolygon()
        return
      }
    }

    this.points.push(event.latlng)
    this.addVertexMarker(event.latlng, this.points.length === 1)
    this.redrawPolygon(event.latlng)
  }

  private onPolygonMove = (event: L.LeafletMouseEvent): void => {
    if (this.destroyed || this.points.length === 0) return
    this.redrawPolygon(event.latlng)
  }

  private onPolygonDblClick = (event: L.LeafletMouseEvent): void => {
    if (this.destroyed) return
    L.DomEvent.stop(event)
    this.finishPolygon()
  }

  private addVertexMarker(latlng: L.LatLng, isFirst: boolean): void {
    const marker = L.circleMarker(latlng, {
      radius: isFirst ? 6 : 4,
      color: this.stroke,
      weight: 2,
      fillColor: isFirst ? this.stroke : '#ffffff',
      fillOpacity: 1,
      interactive: false,
    }).addTo(this.layer)
    this.vertexMarkers.push(marker)
  }

  private redrawPolygon(cursor: L.LatLng): void {
    const path = [...this.points, cursor]

    if (this.guide) this.guide.setLatLngs(path)
    else this.guide = L.polyline(path, this.pathStyle(true)).addTo(this.layer)

    if (this.points.length >= 2) {
      if (this.preview instanceof L.Polygon) this.preview.setLatLngs(path)
      else {
        this.clearPreview()
        this.preview = L.polygon(path, this.pathStyle(false)).addTo(this.layer)
      }
      this.onPreview?.({ kind: 'polygon', points: path.map((p) => [p.lat, p.lng] as [number, number]) })
    }
  }

  /**
   * A double-click arrives as click, click, dblclick, so the ring usually ends with two
   * vertices in the same spot. Drop the duplicate before committing.
   */
  private dedupedPoints(): L.LatLng[] {
    const points = [...this.points]
    while (points.length >= 2) {
      const last = this.map.latLngToContainerPoint(points[points.length - 1])
      const prev = this.map.latLngToContainerPoint(points[points.length - 2])
      if (last.distanceTo(prev) > 4) break
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

  private onDragStart = (event: L.LeafletMouseEvent): void => {
    if (this.destroyed) return
    this.dragStart = event.latlng
    this.dragCurrent = event.latlng
  }

  private onDragMove = (event: L.LeafletMouseEvent): void => {
    if (this.destroyed || !this.dragStart) return
    this.dragCurrent = event.latlng

    if (this.mode === 'rectangle') {
      const bounds = L.latLngBounds(this.dragStart, event.latlng)
      if (this.preview instanceof L.Rectangle) this.preview.setBounds(bounds)
      else {
        this.clearPreview()
        this.preview = L.rectangle(bounds, this.pathStyle(false)).addTo(this.layer)
      }
      this.onPreview?.(rectangleShape(bounds))
      return
    }

    const radius = this.dragStart.distanceTo(event.latlng)
    if (this.preview instanceof L.Circle) this.preview.setRadius(radius)
    else {
      this.clearPreview()
      this.preview = L.circle(this.dragStart, { ...this.pathStyle(false), radius }).addTo(this.layer)
    }
    this.onPreview?.({
      kind: 'circle',
      center: [this.dragStart.lat, this.dragStart.lng],
      radiusMeters: radius,
    })
  }

  private onDragEnd = (event: L.LeafletMouseEvent): void => {
    if (this.destroyed || !this.dragStart) return
    this.commitDrag(event.latlng)
  }

  private onDocumentMouseUp = (): void => {
    if (this.destroyed || !this.dragStart) return
    // Leaflet's own mouseup fires first when the release lands inside the map.
    this.commitDrag(this.dragCurrent ?? this.dragStart)
  }

  private commitDrag(end: L.LatLng): void {
    const start = this.dragStart
    if (!start) return
    this.dragStart = null
    this.dragCurrent = null

    if (this.mode === 'rectangle') {
      const bounds = L.latLngBounds(start, end)
      // A stray click should not commit a zero-area filter.
      if (bounds.getNorth() === bounds.getSouth() || bounds.getEast() === bounds.getWest()) {
        this.onCancel()
        return
      }
      this.onComplete(rectangleShape(bounds))
      return
    }

    const radius = start.distanceTo(end)
    if (radius < 25) {
      this.onCancel()
      return
    }
    this.onComplete({ kind: 'circle', center: [start.lat, start.lng], radiusMeters: radius })
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
    const marker = this.vertexMarkers.pop()
    if (marker) this.layer.removeLayer(marker)

    if (this.points.length === 0) {
      this.clearPreview()
      if (this.guide) {
        this.layer.removeLayer(this.guide)
        this.guide = null
      }
      this.onPreview?.(null)
      return
    }
    this.redrawPolygon(this.points[this.points.length - 1])
  }

  private clearPreview(): void {
    if (this.preview) {
      this.layer.removeLayer(this.preview)
      this.preview = null
    }
  }

  /** Number of vertices placed so far, for the on-screen hint. */
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
      if (this.draggingWasEnabled) this.map.dragging.enable()
    }

    this.map.getContainer().classList.remove('drawing')
    document.body.classList.remove('is-drawing')
    this.map.doubleClickZoom.enable()
    this.map.boxZoom.enable()
    this.layer.remove()
    this.onPreview?.(null)
  }
}

function rectangleShape(bounds: L.LatLngBounds): DrawnShape {
  return {
    kind: 'rectangle',
    bounds: [
      [bounds.getSouth(), bounds.getWest()],
      [bounds.getNorth(), bounds.getEast()],
    ],
  }
}

/** Draw a committed filter shape on a layer group. */
export function renderShape(shape: DrawnShape, dark: boolean): L.Layer {
  const stroke = dark ? STROKE_DARK : STROKE_LIGHT
  const style: L.PathOptions = {
    color: stroke,
    weight: 2,
    opacity: 0.95,
    fillColor: stroke,
    fillOpacity: dark ? 0.12 : 0.07,
    interactive: false,
  }

  if (shape.kind === 'polygon') return L.polygon(shape.points, style)
  if (shape.kind === 'rectangle') return L.rectangle(L.latLngBounds(shape.bounds[0], shape.bounds[1]), style)
  return L.circle(shape.center, { ...style, radius: shape.radiusMeters })
}
