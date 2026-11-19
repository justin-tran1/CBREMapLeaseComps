import { formatDateISO } from './coerce'
import { downloadBlob } from './download'
import type { FieldKey, LeaseDeal } from '../types'

/** One value of the filtered-rows download, typed so each format can write it natively. */
export type RowValue = string | number | Date | null

export interface RowColumn {
  header: string
  /** The field this header fills on import. */
  field: FieldKey
  /** Coordinates are written to six decimal places. */
  coordinate?: boolean
  get: (d: LeaseDeal) => RowValue
}

/**
 * The download's columns: the practice's own comp export schema, in its order and under its
 * headers, so the filtered rows read like the export they came from and load straight back in.
 * Each column writes the field its header fills on import, which the unit suite holds it to.
 * The CSV and the Excel workbook both write these, each in its own way.
 */
export const ROW_COLUMNS: RowColumn[] = [
  { header: 'Confidentiality', field: 'confidentiality', get: (d) => d.confidentiality },
  { header: 'Signed Date', field: 'executionDate', get: (d) => d.executionDate },
  { header: 'Start Date', field: 'leaseDate', get: (d) => d.leaseDate },
  { header: 'Lease Term', field: 'termMonths', get: (d) => d.termMonths },
  { header: 'End Date', field: 'expirationDate', get: (d) => d.expirationDate },
  { header: 'Lease Transaction Type', field: 'transactionType', get: (d) => d.transactionType },
  { header: 'Lease Type', field: 'leaseType', get: (d) => d.leaseType },
  { header: 'Tenant', field: 'lessee', get: (d) => d.lessee },
  { header: 'Property Subtype', field: 'propertySubtype', get: (d) => d.propertySubtype },
  { header: 'Property Class', field: 'buildingClass', get: (d) => d.buildingClass },
  { header: 'Submarket', field: 'submarket', get: (d) => d.submarket },
  { header: 'District', field: 'district', get: (d) => d.district },
  { header: 'Property Name', field: 'propertyName', get: (d) => d.propertyName },
  { header: 'Address', field: 'address', get: (d) => d.address },
  { header: 'Floor', field: 'floor', get: (d) => d.floor },
  { header: 'Suite', field: 'suite', get: (d) => d.suite },
  { header: 'City', field: 'city', get: (d) => d.city },
  { header: 'Area Leased', field: 'areaLeased', get: (d) => d.areaLeased },
  { header: 'Office Area (Deprecated)', field: 'officeArea', get: (d) => d.officeArea },
  { header: 'Base Rent Yearly', field: 'baseRent', get: (d) => d.baseRent },
  { header: 'Rate Type', field: 'rateType', get: (d) => d.rateType },
  { header: 'OPEX (Yearly)', field: 'opex', get: (d) => d.opex },
  { header: 'Escalation Value', field: 'escalationValue', get: (d) => d.escalationValue },
  { header: 'Escalation Percent', field: 'escalationPercent', get: (d) => d.escalationPercent },
  { header: 'Escalation Comments', field: 'escalationComments', get: (d) => d.escalationComments },
  { header: 'Free Rent Months', field: 'freeRent', get: (d) => d.freeRent },
  { header: 'TI Allowance', field: 'tiAllowance', get: (d) => d.tiAllowance },
  { header: 'TIs As-Is', field: 'tiAsIs', get: (d) => d.tiAsIs },
  { header: 'TI Notes', field: 'tiNotes', get: (d) => d.tiNotes },
  { header: 'Other Concessions', field: 'otherConcessions', get: (d) => d.otherConcessions },
  { header: 'Notes', field: 'notes', get: (d) => d.notes },
  { header: 'Tenant Agent(s)', field: 'lesseeBroker', get: (d) => d.lesseeBroker },
  { header: 'Tenant Representative', field: 'lesseeBrokerFirm', get: (d) => d.lesseeBrokerFirm },
  { header: 'Listing Agent(s)', field: 'lessorBroker', get: (d) => d.lessorBroker },
  { header: 'Listing Representative', field: 'lessorBrokerFirm', get: (d) => d.lessorBrokerFirm },
  { header: 'Sublessor', field: 'sublessor', get: (d) => d.sublessor },
  { header: 'Lessor', field: 'lessor', get: (d) => d.lessor },
  { header: 'Tenant NAICS Code', field: 'naicsCode', get: (d) => d.naicsCode },
  { header: 'Year Built', field: 'yearBuilt', get: (d) => d.yearBuilt },
  { header: 'Property Type', field: 'propertyType', get: (d) => d.propertyType },
  { header: 'Market', field: 'market', get: (d) => d.market },
  { header: 'State', field: 'state', get: (d) => d.state },
  { header: 'Latitude', field: 'latitude', coordinate: true, get: (d) => d.lat },
  { header: 'Longitude', field: 'longitude', coordinate: true, get: (d) => d.lon },
  { header: 'Comp ID', field: 'compId', get: (d) => d.compId },
]

function csvText(value: RowValue, column: RowColumn): string {
  if (value === null) return ''
  if (value instanceof Date) return formatDateISO(value)
  if (typeof value === 'number') return column.coordinate ? value.toFixed(6) : String(value)
  return value
}

function csvCell(text: string): string {
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function dealsToCsv(deals: LeaseDeal[]): string {
  const lines = [ROW_COLUMNS.map((c) => csvCell(c.header)).join(',')]
  for (const deal of deals) {
    lines.push(ROW_COLUMNS.map((c) => csvCell(csvText(c.get(deal), c))).join(','))
  }
  return lines.join('\r\n')
}

export function downloadCsv(filename: string, csv: string): void {
  // The BOM keeps Excel from mangling accented characters on open.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' })
  downloadBlob(filename.endsWith('.csv') ? filename : `${filename}.csv`, blob)
}

export function timestampedName(base: string, extension: 'csv' | 'xlsx' = 'csv'): string {
  const now = new Date()
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate(),
  ).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
  return `${base}-${stamp}.${extension}`
}
