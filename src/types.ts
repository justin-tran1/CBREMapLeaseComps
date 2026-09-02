/**
 * How tightly a geocoded coordinate pins an address down, worst to best.
 *
 *  - approximate   A street, locality or postcode centre. Hundreds of metres out.
 *  - interpolated  Guessed from the house-number range along a street centerline. Typically
 *                  10 to 40 m out, and routinely on the wrong side of the street.
 *  - parcel        An address point for the property.
 *  - rooftop       The building itself.
 */
export type GeocodePrecision = 'approximate' | 'interpolated' | 'parcel' | 'rooftop'

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
  | 'district'
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
  | 'officeArea'
  // Economics
  | 'baseRent'
  | 'effectiveRent'
  | 'opex'
  | 'escalation'
  | 'escalationType'
  | 'escalationPercent'
  | 'escalationValue'
  | 'escalationComments'
  | 'freeRent'
  | 'tiAllowance'
  | 'tiAsIs'
  | 'tiNotes'
  | 'otherConcessions'
  // Parties
  | 'lessor'
  | 'sublessor'
  | 'lessee'
  | 'lessorBroker'
  | 'lessorBrokerFirm'
  | 'lesseeBroker'
  | 'lesseeBrokerFirm'
  | 'brokers'
  | 'naicsCode'
  // Free text
  | 'notes'
  // Reference
  | 'compId'
  | 'confidentiality'

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
  group:
    | 'Location'
    | 'Asset'
    | 'Dates & term'
    | 'Deal structure'
    | 'Space'
    | 'Economics'
    | 'Parties'
    | 'Notes'
    | 'Reference'
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
  district: string
  lat: number | null
  lon: number | null
  /** Where the coordinates came from. */
  geoSource: 'file' | 'cache' | 'geocoder' | 'none'
  geoAccuracy: string
  geoError: string
  /**
   * How tightly the coordinate pins the address down. Only a rooftop-grade coordinate may
   * claim a building on the map; anything looser plots a pin and stops there.
   */
  geoPrecision: GeocodePrecision
  /** Google place id, when Google resolved the address. Used for exact clicks in the 3D view. */
  placeId: string

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
  /** A secondary area column some exports still carry. Never used as the leased area. */
  officeArea: number | null

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
  escalationPercent: string
  escalationValue: string
  escalationComments: string
  freeRent: number | null
  tiAllowance: number | null
  tiAsIs: string
  tiNotes: string
  otherConcessions: string

  // Parties
  lessor: string
  sublessor: string
  lessee: string
  lessorBroker: string
  lessorBrokerFirm: string
  lesseeBroker: string
  lesseeBrokerFirm: string
  brokers: string
  naicsCode: string

  notes: string

  // Reference
  compId: string
  confidentiality: string

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
  /** The best precision among the deals here, since they share one coordinate. */
  precision: GeocodePrecision
  /** Set when Google resolved the address, and the handle the 3D view matches clicks against. */
  placeId: string
}

export type BasemapId =
  | 'aerial'
  | 'hybrid'
  | 'cbre-light'
  | 'streets'
  | 'gray'
  | 'topo'
  | 'dark'

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
  /** The Signed Date column: when the deal was executed, not when it commenced. */
  executionDate: DateRange
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
  executionDate: DateRange
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
