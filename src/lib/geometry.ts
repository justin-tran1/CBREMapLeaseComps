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

/** Ring area on the sphere, in square metres, for a [lng, lat] ring. */
function lngLatRingAreaSqMeters(ring: number[][]): number {
  if (ring.length < 3) return 0
  const toRad = Math.PI / 180
  let total = 0

  for (let i = 0; i < ring.length; i++) {
    const [lng1, lat1] = ring[i]
    const [lng2, lat2] = ring[(i + 1) % ring.length]
    total += (lng2 - lng1) * toRad * (2 + Math.sin(lat1 * toRad) + Math.sin(lat2 * toRad))
  }

  return Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2)
}

/** Footprint area of a building polygon, holes subtracted. */
export function geometryAreaSqMeters(geometry: GeoJSON.Geometry): number {
  const polygonArea = (rings: number[][][]): number =>
    rings.reduce((sum, ring, i) => sum + (i === 0 ? lngLatRingAreaSqMeters(ring) : -lngLatRingAreaSqMeters(ring)), 0)

  if (geometry.type === 'Polygon') return Math.max(0, polygonArea(geometry.coordinates))
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.reduce((sum, rings) => sum + Math.max(0, polygonArea(rings)), 0)
  }
  return 0
}

/**
 * Split a geometry into its separate polygons, each with its own holes.
 *
 * This is the difference between one building and a whole block. Vector tile generators union
 * neighbouring buildings into a single multi-part feature at lower zooms, so one feature can
 * carry twenty unrelated footprints spread across a neighbourhood. Treating that feature as
 * one shape is what coloured in a whole district for a single comp.
 */
export function polygonPartsOf(geometry: GeoJSON.Geometry): GeoJSON.Polygon[] {
  if (geometry.type === 'Polygon') return [geometry]
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.map((rings) => ({ type: 'Polygon', coordinates: rings }))
  }
  return []
}

export interface FootprintPick<T> {
  candidate: T
  /** The single polygon the point falls in, never the whole multi-part feature. */
  geometry: GeoJSON.Polygon
  areaSqMeters: number
}

/**
 * Choose the footprint that actually belongs to a comp.
 *
 * Three things go wrong without this:
 *
 *  - Screen-space picking against extruded buildings can return a neighbour whose facade
 *    happens to cover the queried pixel, so a candidate is only accepted when it
 *    geographically contains the point.
 *  - A feature can be a union of many buildings, so the search runs over the individual parts
 *    and returns only the part the point is in. The area test applies to that part as well,
 *    since summing a union's parts hides how big any one of them is.
 *  - OpenStreetMap frequently maps a campus or a whole block as one polygon with the
 *    individual buildings nested inside it, so the smallest containing footprint wins.
 *
 * A footprint larger than `maxAreaSqMeters` is refused outright rather than highlighted,
 * because a polygon that big is a campus or a land parcel, not the building a suite sits in.
 */
export function pickFootprintForPoint<T extends { geometry: GeoJSON.Geometry }>(
  candidates: readonly T[],
  lng: number,
  lat: number,
  maxAreaSqMeters: number,
): FootprintPick<T> | null {
  let best: FootprintPick<T> | null = null

  for (const candidate of candidates) {
    for (const part of polygonPartsOf(candidate.geometry)) {
      if (!pointInGeometry(lng, lat, part)) continue
      const areaSqMeters = geometryAreaSqMeters(part)
      if (areaSqMeters <= 0 || areaSqMeters > maxAreaSqMeters) continue
      if (!best || areaSqMeters < best.areaSqMeters) {
        best = { candidate, geometry: part, areaSqMeters }
      }
    }
  }

  return best
}

/**
 * Push a footprint's outline outward by a few centimetres.
 *
 * The highlight is a second extrusion drawn over the building it highlights. Two solids
 * sharing a wall to the millimetre leaves the depth buffer no way to decide which is in front,
 * and the result is the speckling of grey through green that makes a highlighted building look
 * shredded. Growing the highlight very slightly puts its surfaces clear of the original.
 *
 * Vertices move away from the ring's own centre, which is exact for convex footprints and
 * close enough on concave ones that a few centimetres of error cannot be seen.
 */
export function inflatePolygon(polygon: GeoJSON.Polygon, meters: number): GeoJSON.Polygon {
  const outer = polygon.coordinates[0]
  if (!outer || outer.length < 3 || meters <= 0) return polygon

  let sumLng = 0
  let sumLat = 0
  for (const [lng, lat] of outer) {
    sumLng += lng
    sumLat += lat
  }
  const centreLng = sumLng / outer.length
  const centreLat = sumLat / outer.length

  const degPerMeterLat = 1 / 111_320
  const cosLat = Math.max(0.01, Math.cos((centreLat * Math.PI) / 180))

  const grow = (ring: number[][], outward: number): number[][] =>
    ring.map(([lng, lat]) => {
      // Work in metres so the shift is the same distance in both axes.
      const dx = (lng - centreLng) * cosLat
      const dy = lat - centreLat
      const length = Math.hypot(dx, dy)
      if (length === 0) return [lng, lat]
      const scale = outward / (length / degPerMeterLat)
      return [lng + (lng - centreLng) * scale, lat + (lat - centreLat) * scale]
    })

  return {
    type: 'Polygon',
    coordinates: polygon.coordinates.map((ring, index) =>
      // Holes shrink, so a courtyard does not creep over the highlight's own wall.
      grow(ring, index === 0 ? meters : -meters),
    ),
  }
}
