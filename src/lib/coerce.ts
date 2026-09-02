/** Value coercion for messy spreadsheet cells. Every parser returns `null` rather than NaN. */

const NULLISH = new Set([
  '', '-', '--', '---', 'n/a', 'na', 'n.a.', 'none', 'null', 'nil', 'tbd', 'unknown',
  'not available', 'not disclosed', 'undisclosed', 'confidential', '#n/a', '#value!', '#ref!',
  '?', 'n/av', 'nav',
])

export function isNullish(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'number') return !Number.isFinite(value)
  if (typeof value === 'string') return NULLISH.has(value.trim().toLowerCase())
  return false
}

export function toText(value: unknown): string {
  if (isNullish(value)) return ''
  if (value instanceof Date) return formatDateISO(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)))
  }
  return String(value).replace(/\s+/g, ' ').trim()
}

/**
 * Parse a number out of anything a spreadsheet might hold:
 * `$1,234.56`, `(1,234)`, `1,234 SF`, `12.5%`, `$28.50 /SF/YR`, `~45`.
 */
export function toNumber(value: unknown): number | null {
  if (isNullish(value)) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (value instanceof Date) return null

  let s = String(value).trim()
  if (!s) return null

  const negativeByParens = /^\(.*\)$/.test(s)
  if (negativeByParens) s = s.slice(1, -1)

  // Keep digits, separators and a leading sign; drop currency symbols, units and stray text.
  s = s.replace(/[^\d.,+-]/g, '')
  if (!s || !/\d/.test(s)) return null

  // European style "1.234,56" -> "1234.56"; US style "1,234.56" -> "1234.56".
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (lastComma > -1) {
    const decimals = s.length - lastComma - 1
    // "1,5" is a decimal comma; "1,500" and "1,234,567" are thousands separators.
    s = decimals === 3 || s.split(',').length > 2 ? s.replace(/,/g, '') : s.replace(',', '.')
  }

  // Collapse a duplicated sign and any trailing separator.
  s = s.replace(/(?!^)[+-]/g, '').replace(/[.,]$/, '')

  const n = Number.parseFloat(s)
  if (!Number.isFinite(n)) return null

  // A trailing % is dropped rather than divided out: "3.5%" reads as 3.5 here, and the
  // escalation formatter decides how to present it.
  return negativeByParens ? -Math.abs(n) : n
}

/** Currency-ish values: same as `toNumber` but never negative-by-accident on `$0.00-`. */
export function toCurrency(value: unknown): number | null {
  const n = toNumber(value)
  return n === null ? null : n
}

export function toArea(value: unknown): number | null {
  const n = toNumber(value)
  if (n === null) return null
  if (n <= 0) return null
  return n
}

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30)
const MS_PER_DAY = 86_400_000

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
  september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
}

/** Build a local-midnight Date so calendar arithmetic and display never slip a day. */
function localDate(year: number, monthIndex: number, day: number): Date | null {
  if (year < 1900 || year > 2200) return null
  if (monthIndex < 0 || monthIndex > 11) return null
  if (day < 1 || day > 31) return null
  const d = new Date(year, monthIndex, day)
  if (d.getFullYear() !== year || d.getMonth() !== monthIndex || d.getDate() !== day) return null
  return d
}

export function toDate(value: unknown): Date | null {
  if (isNullish(value)) return null

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    // SheetJS emits date-only cells as UTC midnight. Read the UTC parts so a
    // negative-offset timezone does not shift the date backwards a day.
    const looksUtcMidnight =
      value.getUTCHours() === 0 && value.getUTCMinutes() === 0 && value.getUTCSeconds() === 0
    return looksUtcMidnight
      ? localDate(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
      : localDate(value.getFullYear(), value.getMonth(), value.getDate())
  }

  if (typeof value === 'number') {
    // Excel serial date. 60 is Excel's phantom 1900-02-29, so anything below it is suspect.
    if (value < 1 || value > 80_000) return null
    const ms = EXCEL_EPOCH_UTC + Math.round(value) * MS_PER_DAY
    const d = new Date(ms)
    return localDate(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  }

  const s = String(value).trim()
  if (!s) return null

  // ISO: 2024-03-15 or 2024-03-15T00:00:00
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ]|$)/.exec(s)
  if (iso) return localDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))

  // Slash or dash numeric: 3/15/2024, 15-03-2024, 3.15.24
  const numeric = /^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{2,4})/.exec(s)
  if (numeric) {
    let a = Number(numeric[1])
    let b = Number(numeric[2])
    let y = Number(numeric[3])
    if (y < 100) y += y < 70 ? 2000 : 1900

    if (a > 999) {
      // yyyy/mm/dd
      return localDate(a, b - 1, y)
    }
    // Assume US month-first, but fall back to day-first when month is out of range.
    if (a > 12 && b <= 12) [a, b] = [b, a]
    return localDate(y, a - 1, b)
  }

  // Textual: 15 Mar 2024, Mar 15 2024, March 2024, Mar-24
  const textual = s.toLowerCase().replace(/[,]/g, ' ').replace(/\s+/g, ' ').trim()
  const dayFirst = /^(\d{1,2})[\s-]([a-z]{3,9})[\s-](\d{2,4})$/.exec(textual)
  if (dayFirst) {
    const m = MONTHS[dayFirst[2]]
    let y = Number(dayFirst[3])
    if (y < 100) y += y < 70 ? 2000 : 1900
    if (m !== undefined) return localDate(y, m, Number(dayFirst[1]))
  }
  const monthFirst = /^([a-z]{3,9})[\s-](\d{1,2})(?:[\s-](\d{2,4}))?$/.exec(textual)
  if (monthFirst) {
    const m = MONTHS[monthFirst[1]]
    if (m !== undefined) {
      if (monthFirst[3] !== undefined) {
        let y = Number(monthFirst[3])
        if (y < 100) y += y < 70 ? 2000 : 1900
        return localDate(y, m, Number(monthFirst[2]))
      }
      // "Mar 24" with no day: treat the number as a two-digit year.
      let y = Number(monthFirst[2])
      y += y < 70 ? 2000 : 1900
      return localDate(y, m, 1)
    }
  }
  const monthYear = /^([a-z]{3,9})[\s-](\d{4})$/.exec(textual)
  if (monthYear) {
    const m = MONTHS[monthYear[1]]
    if (m !== undefined) return localDate(Number(monthYear[2]), m, 1)
  }

  // Bare year
  if (/^\d{4}$/.test(s)) {
    const y = Number(s)
    if (y >= 1900 && y <= 2100) return localDate(y, 0, 1)
  }

  const parsed = Date.parse(s)
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed)
    return localDate(d.getFullYear(), d.getMonth(), d.getDate())
  }

  return null
}

export function formatDateISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export type DurationUnit = 'months' | 'years'

/**
 * Parse a duration to months. `hintUnit` comes from the column header
 * (or from the column-wide analysis in `detectDurationUnit`).
 */
export function toMonths(value: unknown, hintUnit: DurationUnit = 'months'): number | null {
  if (isNullish(value)) return null

  if (typeof value === 'string') {
    const s = value.toLowerCase()

    // "5 years 6 months" / "5 yr 6 mo"
    const combo = /(\d+(?:\.\d+)?)\s*(?:years?|yrs?|y)\b[^\d]*(\d+(?:\.\d+)?)\s*(?:months?|mos?|m)\b/.exec(s)
    if (combo) return Number(combo[1]) * 12 + Number(combo[2])

    const years = /(\d+(?:\.\d+)?)\s*(?:years?|yrs?|y)\b/.exec(s)
    if (years) return Number(years[1]) * 12

    const months = /(\d+(?:\.\d+)?)\s*(?:months?|mos?|mths?)\b/.exec(s)
    if (months) return Number(months[1])

    const days = /(\d+(?:\.\d+)?)\s*days?\b/.exec(s)
    if (days) return Number(days[1]) / 30.4375
  }

  const n = toNumber(value)
  if (n === null || n <= 0) return null
  return hintUnit === 'years' ? n * 12 : n
}

/**
 * Decide whether a term column is quoted in months or years.
 * The header wins; otherwise the column's own distribution decides, because a
 * column of 3s, 5s and 10s is years while a column of 36s, 60s and 120s is months.
 */
export function detectDurationUnit(header: string, samples: unknown[]): DurationUnit {
  const h = header.toLowerCase()
  if (/\b(year|yr|yrs|years)\b/.test(h)) return 'years'
  if (/\b(month|mo|mos|months|mths)\b/.test(h)) return 'months'

  const numbers: number[] = []
  let sawUnitText = false
  let yearText = 0
  let monthText = 0

  for (const s of samples) {
    if (typeof s === 'string') {
      if (/\b(years?|yrs?)\b/i.test(s)) {
        sawUnitText = true
        yearText++
        continue
      }
      if (/\b(months?|mos?|mths?)\b/i.test(s)) {
        sawUnitText = true
        monthText++
        continue
      }
    }
    const n = toNumber(s)
    if (n !== null && n > 0) numbers.push(n)
  }

  if (sawUnitText) return yearText > monthText ? 'years' : 'months'
  if (numbers.length === 0) return 'months'

  numbers.sort((a, b) => a - b)
  const median = numbers[Math.floor(numbers.length / 2)]
  // Real lease terms are rarely under 24 months, and a "years" column rarely exceeds 30.
  return median <= 25 ? 'years' : 'months'
}

/** Free rent is quoted in months almost everywhere, but a few sheets use days or weeks. */
export function toFreeRentMonths(value: unknown): number | null {
  if (isNullish(value)) return null
  if (typeof value === 'string') {
    const s = value.toLowerCase()
    const weeks = /(\d+(?:\.\d+)?)\s*weeks?\b/.exec(s)
    if (weeks) return Number(weeks[1]) / 4.345
    const days = /(\d+(?:\.\d+)?)\s*days?\b/.exec(s)
    if (days) return Number(days[1]) / 30.4375
  }
  const m = toMonths(value, 'months')
  if (m === null) return null
  return m < 0 ? null : m
}

export function toCoordinate(value: unknown, kind: 'lat' | 'lon'): number | null {
  const n = toNumber(value)
  if (n === null) return null
  const limit = kind === 'lat' ? 90 : 180
  if (Math.abs(n) > limit) return null
  if (n === 0) return null // A literal 0/0 in a comp sheet means "blank", not Null Island.
  return n
}

const STATE_CODES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC',
  florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
  indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
  wyoming: 'WY', 'puerto rico': 'PR',
  alberta: 'AB', 'british columbia': 'BC', manitoba: 'MB', 'new brunswick': 'NB',
  'newfoundland and labrador': 'NL', 'nova scotia': 'NS', ontario: 'ON',
  'prince edward island': 'PE', quebec: 'QC', saskatchewan: 'SK',
}

export function normalizeState(value: unknown): string {
  const raw = toText(value)
  if (!raw) return ''
  const trimmed = raw.trim()
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase()
  const code = STATE_CODES[trimmed.toLowerCase()]
  return code ?? trimmed
}

export function normalizeZip(value: unknown): string {
  const raw = toText(value)
  if (!raw) return ''
  // Excel drops the leading zero on New England ZIPs stored as numbers.
  const digits = raw.replace(/[^0-9-]/g, '')
  if (/^\d{1,5}$/.test(digits)) return digits.padStart(5, '0')
  const plusFour = /^(\d{1,5})-?(\d{4})$/.exec(digits)
  if (plusFour) return `${plusFour[1].padStart(5, '0')}-${plusFour[2]}`
  return raw.trim()
}

export function titleCaseCity(value: unknown): string {
  const raw = toText(value)
  if (!raw) return ''
  if (raw !== raw.toUpperCase() && raw !== raw.toLowerCase()) return raw.trim()
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length > 2 || /^(st|mt)$/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ')
    .replace(/\b(Mc)([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase())
    .trim()
}
