/** Display formatters. Everything returns the em-dash placeholder for missing data. */

export const EMPTY = '—'

const money0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const money2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const int = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const dec1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export function fmtMoney(n: number | null | undefined, decimals: 0 | 2 = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return EMPTY
  return decimals === 0 ? money0.format(n) : money2.format(n)
}

export function fmtNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return EMPTY
  return int.format(n)
}

export function fmtArea(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return EMPTY
  return `${int.format(Math.round(n))} SF`
}

/**
 * True only when the sheet explicitly says the rate is monthly. Magnitude is never used
 * to infer this: annualising the wrong row would silently multiply a rent by twelve.
 */
export function isMonthlyQuote(rateType: string): boolean {
  const t = (rateType || '').toLowerCase()
  return /\b(month|monthly|mo|mth|mos)\b/.test(t) || t.includes('/mo') || t.includes('per month')
}

function isAnnualQuote(rateType: string): boolean {
  const t = (rateType || '').toLowerCase()
  return /\b(annual|annually|year|yearly|yr|yrs)\b/.test(t) || t.includes('/yr') || t.includes('per year')
}

/**
 * Work out the unit a rent figure is quoted in.
 * The sheet's own rate-type text wins; otherwise the magnitude decides, since a
 * per-square-foot rate and a monthly total are orders of magnitude apart.
 */
export function rentUnit(value: number | null, rateType: string): string {
  if (isMonthlyQuote(rateType)) return '/SF/Mo'
  if (isAnnualQuote(rateType)) return '/SF/Yr'
  if (value === null || !Number.isFinite(value)) return ''
  // Per-SF rates live well under a few hundred dollars; anything larger reads as a total.
  return value > 0 && value < 400 ? '/SF/Yr' : ''
}

export function fmtRent(value: number | null | undefined, rateType = ''): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EMPTY
  const unit = rentUnit(value, rateType)
  const base = unit ? money2.format(value) : money0.format(value)
  return unit ? `${base} ${unit}` : base
}

/** Term stated in years, for places where the hero number has to stay short. */
export function fmtYears(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return EMPTY
  const years = n / 12
  if (years < 1) return `${Math.round(n * 10) / 10} mos`
  return `${dec1.format(years)} yrs`
}

export function fmtMonths(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return EMPTY
  const rounded = Math.round(n * 10) / 10
  const months = Number.isInteger(rounded) ? String(rounded) : dec1.format(rounded)
  if (rounded < 12) return `${months} mo${rounded === 1 ? '' : 's'}`
  const years = rounded / 12
  const yearLabel = Number.isInteger(Math.round(years * 10) / 10)
    ? String(Math.round(years))
    : dec1.format(years)
  return `${months} mos (${yearLabel} yrs)`
}

export function fmtShortMonths(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return EMPTY
  const rounded = Math.round(n * 10) / 10
  return `${Number.isInteger(rounded) ? rounded : dec1.format(rounded)} mos`
}

export function fmtDate(d: Date | null | undefined): string {
  if (!d || Number.isNaN(d.getTime())) return EMPTY
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function fmtMonthYear(d: Date | null | undefined): string {
  if (!d || Number.isNaN(d.getTime())) return EMPTY
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export function fmtText(s: string | null | undefined): string {
  const t = (s ?? '').trim()
  return t === '' ? EMPTY : t
}

/** Axis and tile labels: 1.2M, 450K, 82. */
export function fmtCompact(n: number | null | undefined, prefix = ''): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return EMPTY
  if (n === 0) return `${prefix}0`
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000_000) return `${sign}${prefix}${dec1.format(abs / 1_000_000_000)}B`
  if (abs >= 1_000_000) return `${sign}${prefix}${dec1.format(abs / 1_000_000)}M`
  if (abs >= 10_000) return `${sign}${prefix}${int.format(Math.round(abs / 1000))}K`
  if (abs >= 1000) return `${sign}${prefix}${dec1.format(abs / 1000)}K`
  if (abs >= 10) return `${sign}${prefix}${int.format(Math.round(abs))}`
  return `${sign}${prefix}${dec1.format(abs)}`
}

export function fmtPercent(n: number | null | undefined, decimals = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return EMPTY
  return `${n.toFixed(decimals)}%`
}

/**
 * Escalation is quoted every which way: 0.03, 3, "3%", "$0.75", "CPI".
 * Normalise the common numeric forms and leave anything descriptive alone.
 */
export function fmtEscalationRate(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (/[a-z]/i.test(trimmed)) return trimmed // "CPI", "3% annually", "Fixed 3%"

  const n = Number.parseFloat(trimmed.replace(/[$,%\s]/g, ''))
  if (!Number.isFinite(n)) return trimmed

  if (trimmed.includes('$')) return fmtMoney(n)
  if (trimmed.includes('%')) return `${Number(n.toFixed(2))}%`
  // A bare 0.03 is three percent; a bare 3 is also three percent.
  if (n > 0 && n < 1) return `${Number((n * 100).toFixed(2))}%`
  if (n >= 1 && n <= 25) return `${Number(n.toFixed(2))}%`
  return String(Number(n.toFixed(2)))
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : plural ?? `${singular}s`
}
