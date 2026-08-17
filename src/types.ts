/** Canonical field keys the app understands. Every uploaded column is mapped onto one of these. */
export type FieldKey =
  // Location
  | 'propertyName'
  | 'address'
  | 'city'
  | 'state'
  | 'zip'
  | 'county'
  | 'market'
  | 'submarket'
  | 'latitude'
  | 'longitude'
  // Asset
  | 'propertyType'
  | 'propertySubtype'
  | 'buildingClass'
  | 'yearBuilt'
  // Dates & term
  | 'leaseDate'
  | 'executionDate'
  | 'expirationDate'
  | 'termMonths'
  // Deal structure
  | 'leaseType'
  | 'rateType'
  | 'transactionType'
  // Space
  | 'suite'
  | 'floor'
  | 'areaLeased'
  // Economics
  | 'baseRent'
  | 'effectiveRent'
  | 'opex'
  | 'escalation'
  | 'escalationType'
  | 'escalationRate'
  | 'freeRent'
  | 'tiAllowance'
  // Parties
  | 'lessor'
  | 'lessee'
  | 'lessorBroker'
  | 'lesseeBroker'
  | 'brokers'
  // Free text
  | 'notes'

export type FieldKind =
  | 'text'
  | 'number'
  | 'currency'
  | 'date'
  | 'area'
  | 'months'
  | 'coord'
  | 'percent'

export interface FieldDef {
  key: FieldKey
  label: string
  group: 'Location' | 'Asset' | 'Dates & term' | 'Deal structure' | 'Space' | 'Economics' | 'Parties' | 'Notes'
  kind: FieldKind
  /** Short hint shown in the column mapper. */
  hint?: string
  /** Normalized header phrases that identify this field. Order matters: earlier is a stronger signal. */
  synonyms: string[]
  /** Substrings that disqualify a header from claiming this field. */
  avoid?: string[]
  /** Fields the app cannot run without. */
  required?: boolean
}

/** One row of the uploaded sheet, after normalization. */
export interface LeaseDeal {
  id: string
  /** Row number in the source sheet (1-based, excluding the header row). */
  sourceRow: number

  // Location
  propertyName: string
  address: string
  city: string
  state: string
  zip: string
  county: string
  market: string
  submarket: string
  lat: number | null
  lon: number | null
  /** Where the coordinates came from. */
  geoSource: 'file' | 'cache' | 'geocoder' | 'none'
  geoAccuracy: string
  geoError: string

  // Asset
  propertyType: string
  propertySubtype: string
  buildingClass: string
  yearBuilt: number | null

  // Dates & term
  leaseDate: Date | null
  executionDate: Date | null
  expirationDate: Date | null
  termMonths: number | null

  // Deal structure
  leaseType: string
  rateType: string
  transactionType: string

  // Space
  suite: string
  floor: string
  areaLeased: number | null

  // Economics
  baseRent: number | null
  /**
   * Base rent restated as an annual $/SF figure when the sheet quotes it monthly.
   * Every aggregation and the base-rent filter use this so a monthly-quoted industrial
   * deal never gets averaged against an annual-quoted office deal.
   */
  baseRentAnnual: number | null
  effectiveRent: number | null
  opex: number | null
  opexAnnual: number | null
  escalation: string
  escalationType: string
  escalationRate: string
  freeRent: number | null
  tiAllowance: number | null

  // Parties
  lessor: string
  lessee: string
  lessorBroker: string
  lesseeBroker: string
  brokers: string

  notes: string

  /** Full original row, so nothing from the upload is ever lost. */
  raw: Record<string, unknown>
}

/** A geocoded location that one or more deals share. */
export interface Site {
  id: string
  lat: number
  lon: number
  label: string
  address: string
  city: string
  state: string
  zip: string
  deals: LeaseDeal[]
}

export type BasemapId =
  | 'cbre-light'
  | 'streets'
  | 'satellite'
  | 'hybrid'
  | 'topo'
  | 'dark'
  | 'gray'

export interface NumericRange {
  min: number | null
  max: number | null
}

export interface DateRange {
  start: string | null // ISO yyyy-mm-dd
  end: string | null
}

/** A user-drawn geographic filter. */
export type DrawnShape =
  | { kind: 'polygon'; points: [number, number][] }
  | { kind: 'rectangle'; bounds: [[number, number], [number, number]] }
  | { kind: 'circle'; center: [number, number]; radiusMeters: number }

export interface Filters {
  search: string
  cities: string[]
  states: string[]
  leaseTypes: string[]
  propertySubtypes: string[]
  leaseDate: DateRange
  areaLeased: NumericRange
  termMonths: NumericRange
  baseRent: NumericRange
  freeRent: NumericRange
  shape: DrawnShape | null
  /** Hide rows that could not be placed on the map. Dashboard-only rows stay available. */
  mappedOnly: boolean
}

export interface RangeBounds {
  areaLeased: NumericRange
  termMonths: NumericRange
  baseRent: NumericRange
  freeRent: NumericRange
  leaseDate: DateRange
}

export interface FacetOptions {
  cities: string[]
  states: string[]
  leaseTypes: string[]
  propertySubtypes: string[]
}

export type ColumnMap = Partial<Record<FieldKey, string>>

export interface ParsedSheet {
  fileName: string
  sheetName: string
  sheetNames: string[]
  headers: string[]
  rows: Record<string, unknown>[]
}

export interface GeocodeProgress {
  total: number
  done: number
  failed: number
  running: boolean
  provider: string
  currentAddress: string
}
