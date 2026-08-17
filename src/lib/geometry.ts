import type { DrawnShape } from '../types'

const EARTH_RADIUS_M = 6_371_008.8

/** Ray casting on the lat/lon plane. Accurate at metro scale, which is all a draw filter needs. */
export function pointInPolygon(lat: number, lon: number, ring: [number, number][]): boolean {
  if (ring.length < 3) return false
  let inside = false

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [latI, lonI] = ring[i]
    const [latJ, lonJ] = ring[j]

    const straddles = latI > lat !== latJ > lat
    if (!straddles) continue

    const crossingLon = ((lonJ - lonI) * (lat - latI)) / (latJ - latI) + lonI
    if (lon < crossingLon) inside = !inside
  }

  return inside
}

export function haversineMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = Math.PI / 180
  const dLat = (bLat - aLat) * toRad
  const dLon = (bLon - aLon) * toRad
  const lat1 = aLat * toRad
  const lat2 = bLat * toRad

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function shapeContains(shape: DrawnShape, lat: number, lon: number): boolean {
  switch (shape.kind) {
    case 'polygon':
      return pointInPolygon(lat, lon, shape.points)
    case 'rectangle': {
      const [[minLat, minLon], [maxLat, maxLon]] = shape.bounds
      return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon
    }
    case 'circle':
      return haversineMeters(shape.center[0], shape.center[1], lat, lon) <= shape.radiusMeters
    default:
      return false
  }
}

/** Bounding box as [[southLat, westLon], [northLat, eastLon]]. */
export function shapeBounds(shape: DrawnShape): [[number, number], [number, number]] | null {
  switch (shape.kind) {
    case 'polygon': {
      if (shape.points.length === 0) return null
      let minLat = Infinity
      let maxLat = -Infinity
      let minLon = Infinity
      let maxLon = -Infinity
      for (const [lat, lon] of shape.points) {
        minLat = Math.min(minLat, lat)
        maxLat = Math.max(maxLat, lat)
        minLon = Math.min(minLon, lon)
        maxLon = Math.max(maxLon, lon)
      }
      return [
        [minLat, minLon],
        [maxLat, maxLon],
      ]
    }
    case 'rectangle':
      return shape.bounds
    case 'circle': {
      const [lat, lon] = shape.center
      const latDelta = (shape.radiusMeters / EARTH_RADIUS_M) * (180 / Math.PI)
      const lonDelta = latDelta / Math.max(0.01, Math.cos((lat * Math.PI) / 180))
      return [
        [lat - latDelta, lon - lonDelta],
        [lat + latDelta, lon + lonDelta],
      ]
    }
    default:
      return null
  }
}

/** Spherical excess area of a polygon ring, in square metres. */
export function polygonAreaSqMeters(ring: [number, number][]): number {
  if (ring.length < 3) return 0
  const toRad = Math.PI / 180
  let total = 0

  for (let i = 0; i < ring.length; i++) {
    const [lat1, lon1] = ring[i]
    const [lat2, lon2] = ring[(i + 1) % ring.length]
    total += (lon2 - lon1) * toRad * (2 + Math.sin(lat1 * toRad) + Math.sin(lat2 * toRad))
  }

  return Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2)
}

export function shapeAreaLabel(shape: DrawnShape): string {
  let sqMeters = 0
  if (shape.kind === 'polygon') sqMeters = polygonAreaSqMeters(shape.points)
  else if (shape.kind === 'rectangle') {
    const [[minLat, minLon], [maxLat, maxLon]] = shape.bounds
    sqMeters = polygonAreaSqMeters([
      [minLat, minLon],
      [minLat, maxLon],
      [maxLat, maxLon],
      [maxLat, minLon],
    ])
  } else if (shape.kind === 'circle') {
    sqMeters = Math.PI * shape.radiusMeters ** 2
  }

  const sqMiles = sqMeters / 2_589_988.11
  if (sqMiles < 0.1) return `${Math.round(sqMeters / 4046.86)} acres`
  return `${sqMiles.toFixed(sqMiles < 10 ? 2 : 1)} sq mi`
}

export function shapeLabel(shape: DrawnShape): string {
  switch (shape.kind) {
    case 'polygon':
      return `Polygon · ${shape.points.length} points`
    case 'rectangle':
      return 'Rectangle'
    case 'circle':
      return `Radius · ${(shape.radiusMeters / 1609.34).toFixed(2)} mi`
    default:
      return 'Area'
  }
}

// ------------------------------------------------- GeoJSON building footprints

/** Ray casting over a [lng, lat] ring. Separate from `pointInPolygon`, which takes [lat, lon]. */
function pointInLngLatRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [lngI, latI] = ring[i]
    const [lngJ, latJ] = ring[j]
    if (latI > lat === latJ > lat) continue
    const crossingLng = ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI
    if (lng < crossingLng) inside = !inside
  }
  return inside
}

/** A point is inside a polygon when it sits in the outer ring and in none of the holes. */
function pointInLngLatPolygon(lng: number, lat: number, rings: number[][][]): boolean {
  if (rings.length === 0) return false
  if (!pointInLngLatRing(lng, lat, rings[0])) return false
  for (let i = 1; i < rings.length; i++) {
    if (pointInLngLatRing(lng, lat, rings[i])) return false
  }
  return true
}

/** Containment test against a building footprint from the vector tiles. */
export function pointInGeometry(lng: number, lat: number, geometry: GeoJSON.Geometry): boolean {
  if (geometry.type === 'Polygon') return pointInLngLatPolygon(lng, lat, geometry.coordinates)
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((rings) => pointInLngLatPolygon(lng, lat, rings))
  }
  return false
}

/** Stable key for a footprint, so two comps in one tower yield one highlighted building. */
export function footprintKey(geometry: GeoJSON.Geometry): string {
  const first =
    geometry.type === 'Polygon'
      ? geometry.coordinates[0]?.[0]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates[0]?.[0]?.[0]
        : null
  if (!first) return ''
  return `${first[0].toFixed(6)},${first[1].toFixed(6)}`
}
