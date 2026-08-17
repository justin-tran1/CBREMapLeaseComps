import type { BasemapId } from '../types'

export interface BasemapDef {
  id: BasemapId
  label: string
  description: string
  url: string
  attribution: string
  maxZoom: number
  subdomains?: string
  /** Drawn on top of the base tiles, for labelled satellite. */
  overlayUrl?: string
  overlayMaxZoom?: number
  /** CSS background used for the swatch in the switcher. */
  swatch: string
  /** Marks a basemap as dark, so marker halos stay visible. */
  dark?: boolean
}

const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const CARTO_ATTR = `${OSM_ATTR} &copy; <a href="https://carto.com/attributions">CARTO</a>`
const ESRI_ATTR = 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>'

export const BASEMAPS: BasemapDef[] = [
  {
    id: 'cbre-light',
    label: 'Light',
    description: 'Muted streets. Best contrast for pins.',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
    attribution: CARTO_ATTR,
    maxZoom: 20,
    swatch: 'linear-gradient(135deg,#f7f7f5 0%,#eceeeb 45%,#dfe3df 100%)',
  },
  {
    id: 'streets',
    label: 'Streets',
    description: 'Full detail OpenStreetMap.',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: OSM_ATTR,
    maxZoom: 19,
    swatch: 'linear-gradient(135deg,#f2efe9 0%,#e6e0d4 40%,#cfe0c9 100%)',
  },
  {
    id: 'gray',
    label: 'Light gray canvas',
    description: 'Neutral base that keeps data in front.',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: `${ESRI_ATTR}, HERE, Garmin`,
    maxZoom: 16,
    swatch: 'linear-gradient(135deg,#f5f5f5 0%,#e8e8e8 50%,#d8d8d8 100%)',
  },
  {
    id: 'satellite',
    label: 'Satellite',
    description: 'Aerial imagery, no labels.',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: `${ESRI_ATTR}, Maxar, Earthstar Geographics`,
    maxZoom: 19,
    swatch: 'linear-gradient(135deg,#3d5a3a 0%,#6b7248 40%,#2f4257 100%)',
    dark: true,
  },
  {
    id: 'hybrid',
    label: 'Satellite + labels',
    description: 'Aerial imagery with roads and place names.',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    overlayUrl:
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    overlayMaxZoom: 19,
    attribution: `${ESRI_ATTR}, Maxar, Earthstar Geographics`,
    maxZoom: 19,
    swatch: 'linear-gradient(135deg,#42603f 0%,#6b7248 40%,#33485e 100%)',
    dark: true,
  },
  {
    id: 'topo',
    label: 'Topographic',
    description: 'Terrain, parcels and street detail.',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: `${ESRI_ATTR}, HERE, Garmin, USGS, NGA`,
    maxZoom: 19,
    swatch: 'linear-gradient(135deg,#efe9dd 0%,#d8ddc4 45%,#bcc9b2 100%)',
  },
  {
    id: 'dark',
    label: 'Dark',
    description: 'Dark canvas for presentations.',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    subdomains: 'abcd',
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
