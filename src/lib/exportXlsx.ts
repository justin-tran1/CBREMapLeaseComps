import * as XLSX from '@e965/xlsx'
import { downloadBlob } from './download'
import { ROW_COLUMNS, type RowColumn, type RowValue } from './exportCsv'
import type { LeaseDeal } from '../types'

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const DATE_FORMAT = 'm/d/yyyy'
const COORDINATE_FORMAT = '0.000000'
/** Columns are sized to their longest entry, within these bounds, in characters. */
const MIN_WIDTH = 8
const MAX_WIDTH = 50

/**
 * Excel's day number for the calendar day a date shows in the app. Building it from the day,
 * month and year, rather than from the moment, means no time zone can move a lease a day.
 */
function excelDay(date: Date): number {
  const day = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.round((day - Date.UTC(1899, 11, 30)) / 86_400_000)
}

/** A typed cell: real dates and numbers Excel can sort and sum, and text kept as text. */
function toCell(value: RowValue, column: RowColumn): XLSX.CellObject | null {
  if (value === null || value === '') return null
  if (value instanceof Date) return { t: 'n', v: excelDay(value), z: DATE_FORMAT }
  if (typeof value === 'number') {
    return column.coordinate ? { t: 'n', v: value, z: COORDINATE_FORMAT } : { t: 'n', v: value }
  }
  // Comp IDs, NAICS codes and suites stay text, so a leading zero is never lost.
  return { t: 's', v: value }
}

function shownLength(value: RowValue, column: RowColumn): number {
  if (value === null) return 0
  if (value instanceof Date) return 10
  if (typeof value === 'number') return column.coordinate ? value.toFixed(6).length : String(value).length
  return value.length
}

/**
 * The filtered rows as an Excel workbook: the same columns, in the same order, as the CSV, on
 * one sheet with filter arrows on the header row.
 */
export function dealsToXlsx(deals: LeaseDeal[]): Blob {
  const sheet: XLSX.WorkSheet = {}
  const widths = ROW_COLUMNS.map((column) => column.header.length)

  ROW_COLUMNS.forEach((column, c) => {
    sheet[XLSX.utils.encode_cell({ r: 0, c })] = { t: 's', v: column.header }
  })
  deals.forEach((deal, i) => {
    ROW_COLUMNS.forEach((column, c) => {
      const value = column.get(deal)
      const cell = toCell(value, column)
      if (cell) sheet[XLSX.utils.encode_cell({ r: i + 1, c })] = cell
      widths[c] = Math.max(widths[c], shownLength(value, column))
    })
  })

  const ref = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: deals.length, c: ROW_COLUMNS.length - 1 } })
  sheet['!ref'] = ref
  sheet['!autofilter'] = { ref }
  sheet['!cols'] = widths.map((w) => ({ wch: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w + 2)) }))

  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Lease comps')
  // A shared string table, as Excel writes, rather than each text cell inline.
  const data = XLSX.write(book, { bookType: 'xlsx', type: 'array', compression: true, bookSST: true }) as ArrayBuffer
  return new Blob([data], { type: XLSX_TYPE })
}

export function downloadXlsx(filename: string, workbook: Blob): void {
  downloadBlob(filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`, workbook)
}
