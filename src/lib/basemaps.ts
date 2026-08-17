import type { StyleSpecification } from 'maplibre-gl'
import { BUILDING } from './palette'
import type { BasemapId } from '../types'

export interface BasemapDef {
  id: BasemapId
  label: string
  description: string
  tiles: string[]
  attribution: string
  maxZoom: number
  /** Drawn over the base tiles, for labelled aerial imagery. */
  overlayTiles?: string[]
  overlayMaxZoom?: number
  /** CSS background for the swatch in the switcher. */
  swatch: string
  /** Dark imagery, so pins and drawn shapes switch to the light treatment. */
  dark?: boolean
}

const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const CARTO_ATTR = `${OSM_ATTR} &copy; <a href="https://carto.com/attributions">CARTO</a>`
const ESRI_ATTR = 'Imagery &copy; <a href="https://www.esri.com/">Esri</a>'
const BUILDING_ATTR = `Buildings ${OSM_ATTR} via <a href="https://openfreemap.org">OpenFreeMap</a>`

function carto(style: string): string[] {
  return ['a', 'b', 'c', 'd'].map((s) => `https://${s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{ratio}.png`)
}

function esri(service: string): string[] {
  return [`https://server.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/tile/{z}/{y}/{x}`]
}

export const BASEMAPS: BasemapDef[] = [
  {
    id: 'aerial',
    label: 'Aerial',
    description: 'Satellite imagery. The default for the 3D view.',
    tiles: esri('World_Imagery'),
    attribution: `${ESRI_ATTR}, Maxar, Earthstar Geographics`,
    maxZoom: 19,
    swatch: 'linear-gradient(135deg,#3d5a3a 0%,#6b7248 40%,#2f4257 100%)',
    dark: true,
  },
  {
    id: 'hybrid',
    label: 'Aerial + labels',
    description: 'Satellite imagery with roads and place names.',
    tiles: esri('World_Imagery'),
    overlayTiles: esri('Reference/World_Boundaries_and_Places'),
    overlayMaxZoom: 19,
    attribution: `${ESRI_ATTR}, Maxar, Earthstar Geographics`,
    maxZoom: 19,
    swatch: 'linear-gradient(135deg,#42603f 0%,#6b7248 40%,#33485e 100%)',
    dark: true,
  },
  {
    id: 'cbre-light',
    label: 'Light',
    description: 'Muted streets. Best contrast for pins.',
    tiles: carto('light_all'),
    attribution: CARTO_ATTR,
    maxZoom: 20,
    swatch: 'linear-gradient(135deg,#f7f7f5 0%,#eceeeb 45%,#dfe3df 100%)',
  },
  {
    id: 'streets',
    label: 'Streets',
    description: 'Full detail OpenStreetMap.',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    attribution: OSM_ATTR,
    maxZoom: 19,
    swatch: 'linear-gradient(135deg,#f2efe9 0%,#e6e0d4 40%,#cfe0c9 100%)',
  },
  {
    id: 'gray',
    label: 'Light gray canvas',
    description: 'Neutral base that keeps data in front.',
    tiles: esri('Canvas/World_Light_Gray_Base'),
    attribution: `${ESRI_ATTR}, HERE, Garmin`,
    maxZoom: 16,
    swatch: 'linear-gradient(135deg,#f5f5f5 0%,#e8e8e8 50%,#d8d8d8 100%)',
  },
  {
    id: 'topo',
    label: 'Topographic',
    description: 'Terrain, parcels and street detail.',
    tiles: esri('World_Topo_Map'),
    attribution: `${ESRI_ATTR}, HERE, Garmin, USGS, NGA`,
    maxZoom: 19,
    swatch: 'linear-gradient(135deg,#efe9dd 0%,#d8ddc4 45%,#bcc9b2 100%)',
  },
  {
    id: 'dark',
    label: 'Dark',
    description: 'Dark canvas for presentations.',
    tiles: carto('dark_all'),
    attribution: CARTO_ATTR,
    maxZoom: 20,
    swatch: 'linear-gradient(135deg,#2b2b2b 0%,#1d1d1d 50%,#101010 100%)',
    dark: true,
  },
]

export const BASEMAP_BY_ID: Record<BasemapId, BasemapDef> = Object.fromEntries(
  BASEMAPS.map((b) => [b.id, b]),
) as Record<BasemapId, BasemapDef>

export function getBasemap(id: BasemapId): BasemapDef {
  return BASEMAP_BY_ID[id] ?? BASEMAPS[0]
}

// ---------------------------------------------------------------- style spec

/** Free, key-less OpenStreetMap building footprints with heights. */
const BUILDING_SOURCE_URL = 'https://tiles.openfreemap.org/planet'
export const BUILDING_SOURCE_ID = 'openmaptiles'
export const BUILDING_SOURCE_LAYER = 'building'

export const LAYER = {
  base: 'basemap',
  baseLabels: 'basemap-labels',
  buildings: 'buildings-3d',
  buildingPick: 'buildings-pick',
  buildingsComps: 'buildings-with-comps',
  buildingsActive: 'buildings-active',
  drawFill: 'draw-fill',
  drawLine: 'draw-line',
  drawVertex: 'draw-vertex',
  shapeFill: 'shape-fill',
  shapeLine: 'shape-line',
} as const

export const SOURCE = {
  buildingsComps: 'comps-buildings',
  buildingsActive: 'active-building',
  draw: 'draw-preview',
  shape: 'filter-shape',
} as const

const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] }

/**
 * The whole style is assembled here rather than fetched, so every basemap goes through one
 * code path and the 3D building layers sit in the same place regardless of which imagery
 * is underneath.
 */
export function buildStyle(basemap: BasemapDef, dark: boolean): StyleSpecification {
  const style: StyleSpecification = {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      [LAYER.base]: {
        type: 'raster',
        tiles: basemap.tiles.map((t) => t.replace('{ratio}', devicePixelRatio > 1.5 ? '@2x' : '')),
        tileSize: 256,
        maxzoom: basemap.maxZoom,
        attribution: basemap.attribution,
      },
      [BUILDING_SOURCE_ID]: {
        type: 'vector',
        url: BUILDING_SOURCE_URL,
        attribution: BUILDING_ATTR,
      },
      [SOURCE.buildingsComps]: { type: 'geojson', data: EMPTY_FC },
      [SOURCE.buildingsActive]: { type: 'geojson', data: EMPTY_FC },
      [SOURCE.shape]: { type: 'geojson', data: EMPTY_FC },
      [SOURCE.draw]: { type: 'geojson', data: EMPTY_FC },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': dark ? '#0a2119' : '#e9eeec' },
      },
      {
        id: LAYER.base,
        type: 'raster',
        source: LAYER.base,
        paint: { 'raster-opacity': 1 },
      },
    ],
  }

  if (basemap.overlayTiles) {
    style.sources[LAYER.baseLabels] = {
      type: 'raster',
      tiles: basemap.overlayTiles,
      tileSize: 256,
      maxzoom: basemap.overlayMaxZoom ?? basemap.maxZoom,
    }
    style.layers.push({ id: LAYER.baseLabels, type: 'raster', source: LAYER.baseLabels })
  }

  const buildingDark = basemap.dark === true || dark

  style.layers.push(
    /*
     * Never drawn, only queried. Hit-testing an extrusion tests the whole solid, walls and
     * roof included, so at a tilt the building whose facade covers a pixel answers for
     * ground the building does not stand on, and the footprint genuinely under that ground
     * can be hidden behind it. A flat fill answers in ground space, which is where a comp's
     * coordinate lives. MapLibre skips drawing a fill at zero opacity but still indexes it,
     * so this costs a query target and no pixels.
     */
    {
      id: LAYER.buildingPick,
      type: 'fill',
      source: BUILDING_SOURCE_ID,
      'source-layer': BUILDING_SOURCE_LAYER,
      minzoom: 14,
      paint: { 'fill-opacity': 0 },
    },
    // Every building in view, so the city reads as a 3D scene rather than flat imagery.
    {
      id: LAYER.buildings,
      type: 'fill-extrusion',
      source: BUILDING_SOURCE_ID,
      'source-layer': BUILDING_SOURCE_LAYER,
      minzoom: 14,
      paint: {
        'fill-extrusion-color': buildingDark ? BUILDING.plainDark : BUILDING.plain,
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 12],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': buildingDark ? 0.72 : 0.66,
        'fill-extrusion-vertical-gradient': true,
      },
    },
    // Buildings holding at least one deal in the current selection.
    {
      id: LAYER.buildingsComps,
      type: 'fill-extrusion',
      source: SOURCE.buildingsComps,
      paint: {
        'fill-extrusion-color': buildingDark ? BUILDING.withCompsDark : BUILDING.withComps,
        'fill-extrusion-height': ['coalesce', ['get', 'height'], 14],
        'fill-extrusion-base': ['coalesce', ['get', 'base'], 0],
        'fill-extrusion-opacity': 0.94,
        'fill-extrusion-vertical-gradient': true,
      },
    },
    // The building under the cursor, or the one whose deals are open.
    {
      id: LAYER.buildingsActive,
      type: 'fill-extrusion',
      source: SOURCE.buildingsActive,
      paint: {
        'fill-extrusion-color': BUILDING.highlight,
        'fill-extrusion-height': ['coalesce', ['get', 'height'], 14],
        'fill-extrusion-base': ['coalesce', ['get', 'base'], 0],
        'fill-extrusion-opacity': 0.95,
      },
    },
    // The committed geography filter.
    {
      id: LAYER.shapeFill,
      type: 'fill',
      source: SOURCE.shape,
      paint: {
        'fill-color': buildingDark ? '#17e88f' : '#003f2d',
        'fill-opacity': buildingDark ? 0.16 : 0.1,
      },
    },
    {
      id: LAYER.shapeLine,
      type: 'line',
      source: SOURCE.shape,
      paint: { 'line-color': buildingDark ? '#17e88f' : '#003f2d', 'line-width': 2 },
    },
    // The shape currently being traced.
    {
      id: LAYER.drawFill,
      type: 'fill',
      source: SOURCE.draw,
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: {
        'fill-color': buildingDark ? '#17e88f' : '#003f2d',
        'fill-opacity': buildingDark ? 0.18 : 0.1,
      },
    },
    {
      id: LAYER.drawLine,
      type: 'line',
      source: SOURCE.draw,
      filter: ['!=', ['geometry-type'], 'Point'],
      paint: {
        'line-color': buildingDark ? '#17e88f' : '#003f2d',
        'line-width': 2,
        'line-dasharray': [2, 1.5],
      },
    },
    {
      id: LAYER.drawVertex,
      type: 'circle',
      source: SOURCE.draw,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': ['case', ['==', ['get', 'first'], true], 6, 4],
        'circle-color': ['case', ['==', ['get', 'first'], true], buildingDark ? '#17e88f' : '#003f2d', '#ffffff'],
        'circle-stroke-color': buildingDark ? '#17e88f' : '#003f2d',
        'circle-stroke-width': 2,
      },
    },
  )

  return style
}
