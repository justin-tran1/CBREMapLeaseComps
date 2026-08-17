import {
  detectDurationUnit,
  formatDateISO,
  normalizeState,
  normalizeZip,
  titleCaseCity,
  toArea,
  toCoordinate,
  toCurrency,
  toDate,
  toFreeRentMonths,
  toMonths,
  toNumber,
  toText,
} from './coerce'
import { fmtEscalationRate, isMonthlyQuote } from './format'
import type { ColumnMap, LeaseDeal, ParsedSheet, Site } from '../types'

/**
 * Suite, unit, floor and building qualifiers confuse geocoders, so strip them for lookup.
 *
 * The `(?![a-z])` guard is what keeps the keyword from matching the start of a real street
 * name: without it `fl` swallows the "Flower" in "515 S Flower St". A digit may still follow
 * directly so "Suite2200" is caught too.
 */
const UNIT_NOISE =
  /(^|[\s,#])(?:ste|suite|unit|apt|apartment|rm|room|fl|flr|floor|lvl|level|bldg|building)(?![a-z])\.?\s*#?\s*[a-z0-9-]{1,8}\b/gi

export function cleanStreet(address: string): string {
  return address
    .replace(/\s+/g, ' ')
    .replace(UNIT_NOISE, '')
    .replace(/#\s*[a-z0-9-]{1,8}\b/gi, '')
    .replace(/\s*,\s*,+/g, ', ')
    .replace(/[,\s]+$/g, '')
    .trim()
}

function keyPart(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Stable identity for "the same building", used to group deals and to cache geocodes. */
export function addressKey(deal: Pick<LeaseDeal, 'address' | 'city' | 'state' | 'zip' | 'propertyName'>): string {
  const street = keyPart(cleanStreet(deal.address))
  const city = keyPart(deal.city)
  const state = keyPart(deal.state)
  const zip = keyPart(deal.zip).slice(0, 5)

  if (street) return [street, city, state, zip].filter(Boolean).join('|')
  const name = keyPart(deal.propertyName)
  if (name) return ['name:' + name, city, state, zip].filter(Boolean).join('|')
  return ''
}

/** The single-line address handed to the geocoder. */
export function geocodeQuery(
  deal: Pick<LeaseDeal, 'address' | 'city' | 'state' | 'zip' | 'propertyName'>,
): string {
  const street = cleanStreet(deal.address) || deal.propertyName.trim()
  const tail = [deal.city.trim(), deal.state.trim()].filter(Boolean).join(', ')
  const zip = deal.zip.trim()
  return [street, tail, zip].filter(Boolean).join(', ').replace(/,\s*,/g, ',').trim()
}

export function fullAddress(deal: Pick<LeaseDeal, 'address' | 'city' | 'state' | 'zip'>): string {
  const tail = [deal.city, deal.state].filter(Boolean).join(', ')
  return [deal.address, tail, deal.zip].filter((p) => p && p.trim()).join(', ')
}

/** Restate a monthly $/SF quote as annual so measures across property types stay comparable. */
export function annualizeRate(value: number | null, rateType: string): number | null {
  if (value === null || !Number.isFinite(value)) return null
  return isMonthlyQuote(rateType) ? value * 12 : value
}

function pick(row: Record<string, unknown>, map: ColumnMap, key: keyof ColumnMap): unknown {
  const column = map[key]
  if (!column) return null
  return row[column] ?? null
}

/**
 * Turn raw sheet rows into typed deals.
 * Column-wide analysis happens first (term units), then each row is coerced.
 */
export function normalizeDeals(sheet: ParsedSheet, map: ColumnMap): LeaseDeal[] {
  const termColumn = map.termMonths
  const termUnit = termColumn
    ? detectDurationUnit(
        termColumn,
        sheet.rows.slice(0, 400).map((r) => r[termColumn]),
      )
    : 'months'

  return sheet.rows.map((row, index) => {
    const address = toText(pick(row, map, 'address'))
    const city = titleCaseCity(pick(row, map, 'city'))
    const state = normalizeState(pick(row, map, 'state'))
    const zip = normalizeZip(pick(row, map, 'zip'))

    const lat = toCoordinate(pick(row, map, 'latitude'), 'lat')
    const lon = toCoordinate(pick(row, map, 'longitude'), 'lon')
    const hasFileCoords = lat !== null && lon !== null

    const leaseDate = toDate(pick(row, map, 'leaseDate'))
    const expirationDate = toDate(pick(row, map, 'expirationDate'))

    let termMonths = toMonths(pick(row, map, 'termMonths'), termUnit)
    if (termMonths === null && leaseDate && expirationDate && expirationDate > leaseDate) {
      const months =
        (expirationDate.getFullYear() - leaseDate.getFullYear()) * 12 +
        (expirationDate.getMonth() - leaseDate.getMonth()) +
        (expirationDate.getDate() >= leaseDate.getDate() ? 0 : -1)
      if (months > 0) termMonths = months
    }
    if (termMonths !== null && (termMonths <= 0 || termMonths > 1200)) termMonths = null

    const yearBuiltRaw = toNumber(pick(row, map, 'yearBuilt'))
    const yearBuilt = yearBuiltRaw !== null && yearBuiltRaw > 1500 && yearBuiltRaw < 2200 ? yearBuiltRaw : null

    const rateType = toText(pick(row, map, 'rateType'))
    const baseRent = toCurrency(pick(row, map, 'baseRent'))
    const opex = toCurrency(pick(row, map, 'opex'))

    const deal: LeaseDeal = {
      id: `r${index + 1}`,
      sourceRow: index + 1,

      propertyName: toText(pick(row, map, 'propertyName')),
      address,
      city,
      state,
      zip,
      county: toText(pick(row, map, 'county')),
      market: toText(pick(row, map, 'market')),
      submarket: toText(pick(row, map, 'submarket')),
      lat: hasFileCoords ? lat : null,
      lon: hasFileCoords ? lon : null,
      geoSource: hasFileCoords ? 'file' : 'none',
      geoAccuracy: hasFileCoords ? 'From file' : '',
      geoError: '',

      propertyType: toText(pick(row, map, 'propertyType')),
      propertySubtype: toText(pick(row, map, 'propertySubtype')),
      buildingClass: toText(pick(row, map, 'buildingClass')),
      yearBuilt,

      leaseDate,
      executionDate: toDate(pick(row, map, 'executionDate')),
      expirationDate,
      termMonths,

      leaseType: toText(pick(row, map, 'leaseType')),
      rateType,
      transactionType: toText(pick(row, map, 'transactionType')),

      suite: toText(pick(row, map, 'suite')),
      floor: toText(pick(row, map, 'floor')),
      areaLeased: toArea(pick(row, map, 'areaLeased')),

      baseRent,
      baseRentAnnual: annualizeRate(baseRent, rateType),
      effectiveRent: toCurrency(pick(row, map, 'effectiveRent')),
      opex,
      opexAnnual: annualizeRate(opex, rateType),
      escalation: toText(pick(row, map, 'escalation')),
      escalationType: toText(pick(row, map, 'escalationType')),
      escalationRate: toText(pick(row, map, 'escalationRate')),
      freeRent: toFreeRentMonths(pick(row, map, 'freeRent')),
      tiAllowance: toCurrency(pick(row, map, 'tiAllowance')),

      lessor: toText(pick(row, map, 'lessor')),
      lessee: toText(pick(row, map, 'lessee')),
      lessorBroker: toText(pick(row, map, 'lessorBroker')),
      lesseeBroker: toText(pick(row, map, 'lesseeBroker')),
      brokers: toText(pick(row, map, 'brokers')),

      notes: toText(pick(row, map, 'notes')),

      raw: row,
    }

    return deal
  })
}

/**
 * Combine the escalation columns into one readable value.
 * A descriptive escalation column wins; otherwise rate and type are joined.
 */
export function resolveEscalation(deal: LeaseDeal): string {
  const direct = deal.escalation.trim()
  const rate = deal.escalationRate.trim()
  const type = deal.escalationType.trim()

  if (direct) {
    const formatted = fmtEscalationRate(direct)
    if (type && !formatted.toLowerCase().includes(type.toLowerCase())) return `${formatted} · ${type}`
    return formatted
  }
  if (rate) {
    const formatted = fmtEscalationRate(rate)
    return type ? `${formatted} · ${type}` : formatted
  }
  return type
}

/** Everyone who touched the deal, de-duplicated. */
export function resolveBrokers(deal: LeaseDeal): string {
  const parts: string[] = []
  const add = (label: string, value: string) => {
    const v = value.trim()
    if (!v) return
    if (parts.some((p) => p.toLowerCase().includes(v.toLowerCase()))) return
    parts.push(label ? `${v} (${label})` : v)
  }
  add('', deal.brokers)
  add('lessor', deal.lessorBroker)
  add('lessee', deal.lesseeBroker)
  return parts.join(' · ')
}

export function dealLabel(deal: LeaseDeal): string {
  const bits = [
    deal.lessee.trim(),
    deal.suite.trim() ? `Suite ${deal.suite.trim().replace(/^suite\s*/i, '')}` : '',
    deal.floor.trim() ? `Floor ${deal.floor.trim().replace(/^floor\s*/i, '')}` : '',
  ].filter(Boolean)
  if (bits.length) return bits.join(' · ')
  if (deal.leaseDate) return `Deal dated ${formatDateISO(deal.leaseDate)}`
  return `Row ${deal.sourceRow}`
}

export function siteLabel(deals: LeaseDeal[]): string {
  const named = deals.find((d) => d.propertyName.trim())
  if (named) return named.propertyName.trim()
  const addressed = deals.find((d) => d.address.trim())
  if (addressed) return addressed.address.trim()
  const cityOnly = deals.find((d) => d.city.trim())
  return cityOnly ? cityOnly.city.trim() : 'Unnamed location'
}

/** ~1.1 m of precision, enough to fold identical geocoder hits onto one marker. */
function coordKey(lat: number, lon: number): string {
  return `${lat.toFixed(5)},${lon.toFixed(5)}`
}

/**
 * Fold deals into map markers. Deals at the same address share a marker even when the
 * geocoder returns marginally different coordinates, and separately-keyed addresses that
 * resolve to the same point are merged too, so one building never gets two stacked pins.
 */
export function buildSites(deals: LeaseDeal[]): Site[] {
  const byCoord = new Map<string, LeaseDeal[]>()

  for (const deal of deals) {
    if (deal.lat === null || deal.lon === null) continue
    const key = coordKey(deal.lat, deal.lon)
    const bucket = byCoord.get(key)
    if (bucket) bucket.push(deal)
    else byCoord.set(key, [deal])
  }

  const sites: Site[] = []
  for (const [key, group] of byCoord) {
    const first = group[0]
    sites.push({
      id: `s:${key}`,
      lat: first.lat as number,
      lon: first.lon as number,
      label: siteLabel(group),
      address: group.find((d) => d.address.trim())?.address ?? '',
      city: group.find((d) => d.city.trim())?.city ?? '',
      state: group.find((d) => d.state.trim())?.state ?? '',
      zip: group.find((d) => d.zip.trim())?.zip ?? '',
      deals: [...group].sort((a, b) => {
        const at = a.leaseDate?.getTime() ?? 0
        const bt = b.leaseDate?.getTime() ?? 0
        if (at !== bt) return bt - at
        return a.sourceRow - b.sourceRow
      }),
    })
  }

  sites.sort((a, b) => b.deals.length - a.deals.length || a.label.localeCompare(b.label))
  return sites
}

export interface LocationGroup {
  key: string
  query: string
  deals: LeaseDeal[]
  hasCoords: boolean
}

/** Unique addresses to geocode, so 40 deals in one tower cost one lookup. */
export function buildLocationGroups(deals: LeaseDeal[]): LocationGroup[] {
  const groups = new Map<string, LocationGroup>()

  for (const deal of deals) {
    const key = addressKey(deal)
    if (!key) continue

    const existing = groups.get(key)
    if (existing) {
      existing.deals.push(deal)
      if (deal.lat !== null && deal.lon !== null) existing.hasCoords = true
    } else {
      groups.set(key, {
        key,
        query: geocodeQuery(deal),
        deals: [deal],
        hasCoords: deal.lat !== null && deal.lon !== null,
      })
    }
  }

  return [...groups.values()]
}
