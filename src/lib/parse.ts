import * as XLSX from '@e965/xlsx'
import type { ParsedSheet } from '../types'

/**
 * Legacy .xls and older CSV exports are often Windows-1252 rather than UTF-8, and without
 * the codepage tables an accented tenant or landlord name comes through as mojibake. The
 * tables are large, so they load on the first read rather than on first paint.
 */
let codepagesReady: Promise<void> | null = null

function ensureCodepages(): Promise<void> {
  if (!codepagesReady) {
    codepagesReady = import('@e965/xlsx/dist/cpexcel.full.mjs')
      .then((cptable) => {
        XLSX.set_cptable(cptable)
      })
      .catch(() => {
        // Tables unavailable: UTF-8 still reads correctly, which covers every modern export.
      })
  }
  return codepagesReady
}

export const ACCEPTED_EXTENSIONS = ['.xlsx', '.xlsm', '.xlsb', '.xls', '.csv', '.tsv', '.txt']

type Matrix = unknown[][]

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
}

function cellCount(row: unknown[] | undefined): number {
  if (!row) return 0
  return row.reduce<number>((n, c) => (isBlank(c) ? n : n + 1), 0)
}

/**
 * Exports often carry a title block, a logo row, or a blank spacer above the real header.
 * Score the first rows and pick the one that looks most like a header: mostly text,
 * widest, and followed by rows of a similar width.
 */
function findHeaderRow(matrix: Matrix): number {
  const limit = Math.min(matrix.length, 25)
  let bestIndex = 0
  let bestScore = -Infinity

  for (let i = 0; i < limit; i++) {
    const row = matrix[i]
    const filled = cellCount(row)
    if (filled < 2) continue

    const textCells = (row ?? []).filter(
      (c) => typeof c === 'string' && c.trim() !== '' && !/^\d+(\.\d+)?$/.test(c.trim()),
    ).length
    const textRatio = textCells / filled

    // How consistently do the following rows fill the same columns?
    let following = 0
    let consistent = 0
    for (let j = i + 1; j < Math.min(matrix.length, i + 6); j++) {
      following++
      if (cellCount(matrix[j]) >= Math.max(2, filled * 0.4)) consistent++
    }
    const consistency = following === 0 ? 0 : consistent / following

    const score = filled * 1.5 + textRatio * 20 + consistency * 25 - i * 1.5
    if (score > bestScore) {
      bestScore = score
      bestIndex = i
    }
  }

  return bestIndex
}

function buildHeaders(rawHeaderRow: unknown[], width: number): string[] {
  const seen = new Map<string, number>()
  const headers: string[] = []

  for (let c = 0; c < width; c++) {
    const cell = rawHeaderRow?.[c]
    let name = isBlank(cell) ? '' : String(cell).replace(/\s+/g, ' ').trim()
    if (!name) name = `Column ${c + 1}`

    const count = seen.get(name) ?? 0
    seen.set(name, count + 1)
    if (count > 0) name = `${name} (${count + 1})`

    headers.push(name)
  }

  return headers
}

export interface ReadOptions {
  /** Force a specific sheet. Defaults to the first sheet that has data. */
  sheetName?: string
}

export async function readSpreadsheet(file: File, options: ReadOptions = {}): Promise<ParsedSheet> {
  const [buffer] = await Promise.all([file.arrayBuffer(), ensureCodepages()])

  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(new Uint8Array(buffer), {
      type: 'array',
      cellDates: true,
      cellText: false,
      codepage: 65001,
      raw: false,
    })
  } catch (err) {
    throw new Error(
      `Could not read "${file.name}". Save it as .xlsx or .csv and try again. (${
        err instanceof Error ? err.message : String(err)
      })`,
    )
  }

  const sheetNames = workbook.SheetNames.filter((n) => !!workbook.Sheets[n])
  if (sheetNames.length === 0) throw new Error(`"${file.name}" has no worksheets.`)

  // Prefer the requested sheet, else the first sheet with at least a header and one row.
  let sheetName = options.sheetName && sheetNames.includes(options.sheetName) ? options.sheetName : ''
  if (!sheetName) {
    sheetName =
      sheetNames.find((name) => {
        const ws = workbook.Sheets[name]
        if (!ws || !ws['!ref']) return false
        const range = XLSX.utils.decode_range(ws['!ref'])
        return range.e.r >= 1 && range.e.c >= 1
      }) ?? sheetNames[0]
  }

  const worksheet = workbook.Sheets[sheetName]
  if (!worksheet) throw new Error(`Sheet "${sheetName}" is empty.`)

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  }) as Matrix

  if (matrix.length === 0) throw new Error(`Sheet "${sheetName}" has no rows.`)

  const headerIndex = findHeaderRow(matrix)
  const headerRow = matrix[headerIndex] ?? []
  const width = matrix.reduce((max, row) => Math.max(max, row?.length ?? 0), headerRow.length)
  const headers = buildHeaders(headerRow, width)

  const rows: Record<string, unknown>[] = []
  for (let r = headerIndex + 1; r < matrix.length; r++) {
    const row = matrix[r]
    if (cellCount(row) === 0) continue

    const record: Record<string, unknown> = {}
    for (let c = 0; c < width; c++) {
      record[headers[c]] = row?.[c] ?? null
    }
    rows.push(record)
  }

  if (rows.length === 0) throw new Error(`Sheet "${sheetName}" has headers but no data rows.`)

  return { fileName: file.name, sheetName, sheetNames, headers, rows }
}
