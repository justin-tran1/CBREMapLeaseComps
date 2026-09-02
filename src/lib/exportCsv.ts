import { formatDateISO } from './coerce'
import { resolveBrokers, resolveEscalation } from './normalize'
import type { LeaseDeal } from '../types'

function cell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toRow(values: unknown[]): string {
  return values.map(cell).join(',')
}

const COLUMNS: Array<{ header: string; get: (d: LeaseDeal) => unknown }> = [
  { header: 'Row', get: (d) => d.sourceRow },
  { header: 'Comp ID', get: (d) => d.compId },
  { header: 'Confidentiality', get: (d) => d.confidentiality },
  { header: 'Property name', get: (d) => d.propertyName },
  { header: 'Address', get: (d) => d.address },
  { header: 'City', get: (d) => d.city },
  { header: 'State', get: (d) => d.state },
  { header: 'ZIP', get: (d) => d.zip },
  { header: 'Latitude', get: (d) => (d.lat === null ? '' : d.lat.toFixed(6)) },
  { header: 'Longitude', get: (d) => (d.lon === null ? '' : d.lon.toFixed(6)) },
  { header: 'Location source', get: (d) => (d.geoSource === 'none' ? 'Not located' : d.geoAccuracy || d.geoSource) },
  { header: 'Lease date', get: (d) => (d.leaseDate ? formatDateISO(d.leaseDate) : '') },
  { header: 'Term (months)', get: (d) => d.termMonths ?? '' },
  { header: 'Signed date', get: (d) => (d.executionDate ? formatDateISO(d.executionDate) : '') },
  { header: 'Expiration date', get: (d) => (d.expirationDate ? formatDateISO(d.expirationDate) : '') },
  { header: 'Lease type', get: (d) => d.leaseType },
  { header: 'Property subtype', get: (d) => d.propertySubtype },
  { header: 'Rate type', get: (d) => d.rateType },
  { header: 'Area leased (SF)', get: (d) => d.areaLeased ?? '' },
  { header: 'Floor', get: (d) => d.floor },
  { header: 'Suite', get: (d) => d.suite },
  { header: 'Base rent (as quoted)', get: (d) => d.baseRent ?? '' },
  { header: 'Base rent (annual $/SF)', get: (d) => d.baseRentAnnual ?? '' },
  { header: 'OpEx (as quoted)', get: (d) => d.opex ?? '' },
  { header: 'Escalation', get: (d) => resolveEscalation(d) },
  { header: 'Free rent (months)', get: (d) => d.freeRent ?? '' },
  { header: 'TI allowance', get: (d) => d.tiAllowance ?? '' },
  { header: 'TIs as-is', get: (d) => d.tiAsIs },
  { header: 'TI notes', get: (d) => d.tiNotes },
  { header: 'Other concessions', get: (d) => d.otherConcessions },
  { header: 'Lessor', get: (d) => d.lessor },
  { header: 'Sublessor', get: (d) => d.sublessor },
  { header: 'Lessee', get: (d) => d.lessee },
  { header: 'Listing agents', get: (d) => d.lessorBroker },
  { header: 'Listing representative', get: (d) => d.lessorBrokerFirm },
  { header: 'Tenant agents', get: (d) => d.lesseeBroker },
  { header: 'Tenant representative', get: (d) => d.lesseeBrokerFirm },
  { header: 'Associated brokers', get: (d) => resolveBrokers(d) },
  { header: 'Tenant NAICS code', get: (d) => d.naicsCode },
  { header: 'Property type', get: (d) => d.propertyType },
  { header: 'Property class', get: (d) => d.buildingClass },
  { header: 'Year built', get: (d) => d.yearBuilt ?? '' },
  { header: 'Transaction type', get: (d) => d.transactionType },
  { header: 'Market', get: (d) => d.market },
  { header: 'Submarket', get: (d) => d.submarket },
  { header: 'District', get: (d) => d.district },
  { header: 'Office area (SF)', get: (d) => d.officeArea ?? '' },
  { header: 'Notes', get: (d) => d.notes },
]

export function dealsToCsv(deals: LeaseDeal[]): string {
  const lines = [toRow(COLUMNS.map((c) => c.header))]
  for (const deal of deals) lines.push(toRow(COLUMNS.map((c) => c.get(deal))))
  return lines.join('\r\n')
}

export function downloadCsv(filename: string, csv: string): void {
  // The BOM keeps Excel from mangling accented characters on open.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function timestampedName(base: string): string {
  const now = new Date()
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate(),
  ).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
  return `${base}-${stamp}.csv`
}
