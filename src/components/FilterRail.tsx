import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useApp } from '../state/AppContext'
import { applyFilters, describeActiveFilters, emptyRange } from '../lib/filters'
import { formatDateISO } from '../lib/coerce'
import { shapeAreaLabel, shapeLabel } from '../lib/geometry'
import { fmtCompact } from '../lib/format'
import { IconChevronRight, IconFilter, IconSearch, IconX } from './Icons'
import type { DateRange, Filters, NumericRange } from '../types'

// --------------------------------------------------------------- primitives

interface SectionProps {
  title: string
  activeCount: number
  defaultOpen?: boolean
  children: ReactNode
}

function Section({ title, activeCount, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen || activeCount > 0)
  const bodyId = `fsection-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`

  return (
    <div className="fsection">
      <button
        type="button"
        className="fsection__btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={bodyId}
      >
        <IconChevronRight
          size={12}
          className={`fsection__chevron${open ? ' fsection__chevron--open' : ''}`}
        />
        {title}
        {activeCount > 0 && <span className="fsection__count">{activeCount}</span>}
      </button>
      {open && (
        <div className="fsection__body" id={bodyId}>
          {children}
        </div>
      )}
    </div>
  )
}

function parseInput(text: string): number | null {
  const trimmed = text.trim().replace(/[$,\s]/g, '')
  if (!trimmed) return null
  const n = Number.parseFloat(trimmed)
  return Number.isFinite(n) ? n : null
}

interface RangeFieldProps {
  value: NumericRange
  bounds: NumericRange
  step?: number
  prefix?: string
  suffix?: string
  onChange: (next: NumericRange) => void
}

/**
 * Min/max pair with a debounced commit, so typing "1200" never fires a filter pass
 * for "1", "12" and "120" along the way.
 */
function RangeField({ value, bounds, step = 1, prefix = '', suffix = '', onChange }: RangeFieldProps) {
  const [minText, setMinText] = useState(value.min === null ? '' : String(value.min))
  const [maxText, setMaxText] = useState(value.max === null ? '' : String(value.max))
  const committed = useRef<NumericRange>(value)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Pull external changes (clear all, chip dismissal) back into the inputs.
  useEffect(() => {
    if (value.min !== committed.current.min) setMinText(value.min === null ? '' : String(value.min))
    if (value.max !== committed.current.max) setMaxText(value.max === null ? '' : String(value.max))
    committed.current = value
  }, [value])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const min = parseInput(minText)
      const max = parseInput(maxText)
      if (min === committed.current.min && max === committed.current.max) return
      committed.current = { min, max }
      onChangeRef.current({ min, max })
    }, 320)
    return () => window.clearTimeout(handle)
  }, [minText, maxText])

  const hint =
    bounds.min === null || bounds.max === null
      ? 'No values in this dataset'
      : `Data range ${prefix}${fmtCompact(bounds.min)}${suffix} to ${prefix}${fmtCompact(bounds.max)}${suffix}`

  return (
    <>
      <div className="range-row">
        <input
          className="input"
          type="number"
          inputMode="decimal"
          step={step}
          placeholder="Min"
          value={minText}
          onChange={(e) => setMinText(e.target.value)}
          aria-label="Minimum"
        />
        <span className="range-row__dash">to</span>
        <input
          className="input"
          type="number"
          inputMode="decimal"
          step={step}
          placeholder="Max"
          value={maxText}
          onChange={(e) => setMaxText(e.target.value)}
          aria-label="Maximum"
        />
      </div>
      <span className="range-hint">{hint}</span>
    </>
  )
}

interface DateRangeFieldProps {
  /** Drives the input labels, so a screen reader hears which date it is editing. */
  label: string
  value: DateRange
  bounds: DateRange
  emptyHint: string
  onChange: (next: DateRange) => void
}

/** A from/to date pair, the span present in the data, and the presets. */
function DateRangeField({ label, value, bounds, emptyHint, onChange }: DateRangeFieldProps) {
  return (
    <>
      <div className="range-row">
        <input
          className="input"
          type="date"
          value={value.start ?? ''}
          max={value.end ?? undefined}
          onChange={(e) => onChange({ ...value, start: e.target.value || null })}
          aria-label={`${label} from`}
        />
        <span className="range-row__dash">to</span>
        <input
          className="input"
          type="date"
          value={value.end ?? ''}
          min={value.start ?? undefined}
          onChange={(e) => onChange({ ...value, end: e.target.value || null })}
          aria-label={`${label} to`}
        />
      </div>
      <span className="range-hint">
        {bounds.start ? `Data range ${bounds.start} to ${bounds.end}` : emptyHint}
      </span>
      <div className="chiprow">
        {DATE_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => onChange(preset.range())}
          >
            {preset.label}
          </button>
        ))}
        {(value.start || value.end) && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => onChange({ start: null, end: null })}
          >
            Clear
          </button>
        )}
      </div>
    </>
  )
}

interface OptionListProps {
  options: string[]
  selected: string[]
  counts: Map<string, number>
  emptyLabel: string
  onChange: (next: string[]) => void
}

function OptionList({ options, selected, counts, emptyLabel, onChange }: OptionListProps) {
  const [query, setQuery] = useState('')
  const selectedSet = useMemo(() => new Set(selected.map((s) => s.toLowerCase())), [selected])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? options.filter((o) => o.toLowerCase().includes(q)) : options
    // Keep chosen values pinned to the top so they never scroll out of reach.
    return [...list].sort((a, b) => {
      const aSel = selectedSet.has(a.toLowerCase()) ? 0 : 1
      const bSel = selectedSet.has(b.toLowerCase()) ? 0 : 1
      if (aSel !== bSel) return aSel - bSel
      return (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b)
    })
  }, [options, query, selectedSet, counts])

  if (options.length === 0) {
    return <div className="optionlist__empty">{emptyLabel}</div>
  }

  const toggle = (option: string) => {
    onChange(
      selectedSet.has(option.toLowerCase())
        ? selected.filter((s) => s.toLowerCase() !== option.toLowerCase())
        : [...selected, option],
    )
  }

  return (
    <>
      {options.length > 8 && (
        <input
          className="input"
          type="search"
          placeholder="Find…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filter the list"
        />
      )}
      <div className="optionlist">
        {visible.length === 0 && <div className="optionlist__empty">No matches</div>}
        {visible.map((option) => (
          <label key={option} className="optionlist__item">
            <input
              type="checkbox"
              checked={selectedSet.has(option.toLowerCase())}
              onChange={() => toggle(option)}
            />
            <span className="optionlist__label" title={option}>
              {option}
            </span>
            <span className="optionlist__count">{counts.get(option) ?? 0}</span>
          </label>
        ))}
      </div>
      {selected.length > 0 && (
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange([])}>
          Clear {selected.length} selected
        </button>
      )}
    </>
  )
}

// ------------------------------------------------------------------- presets

function monthsAgo(count: number): string {
  const now = new Date()
  return formatDateISO(new Date(now.getFullYear(), now.getMonth() - count, now.getDate()))
}

const DATE_PRESETS: Array<{ label: string; range: () => { start: string | null; end: string | null } }> = [
  { label: 'Last 12 months', range: () => ({ start: monthsAgo(12), end: null }) },
  { label: 'Last 24 months', range: () => ({ start: monthsAgo(24), end: null }) },
  { label: 'Last 3 years', range: () => ({ start: monthsAgo(36), end: null }) },
  {
    label: 'Year to date',
    range: () => ({ start: formatDateISO(new Date(new Date().getFullYear(), 0, 1)), end: null }),
  },
]

// ---------------------------------------------------------------------- rail

interface FilterRailProps {
  open: boolean
  onToggle: () => void
}

export function FilterRail({ open, onToggle }: FilterRailProps) {
  const { deals, filtered, filters, setFilters, resetFilters, facets, bounds, unlocatedCount } = useApp()

  const patch = (update: Partial<Filters>) => setFilters((prev) => ({ ...prev, ...update }))

  /**
   * Counts shown next to each option ignore that facet's own selection, so ticking one city
   * does not make every other city read zero.
   */
  const counts = useMemo(() => {
    const build = (key: 'cities' | 'states' | 'leaseTypes' | 'propertySubtypes', pick: (d: (typeof deals)[number]) => string) => {
      const scoped = applyFilters(deals, { ...filters, [key]: [] })
      const map = new Map<string, number>()
      for (const deal of scoped) {
        const value = pick(deal).trim()
        if (!value) continue
        map.set(value, (map.get(value) ?? 0) + 1)
      }
      return map
    }

    return {
      cities: build('cities', (d) => d.city),
      states: build('states', (d) => d.state),
      leaseTypes: build('leaseTypes', (d) => d.leaseType),
      propertySubtypes: build('propertySubtypes', (d) => d.propertySubtype),
    }
  }, [deals, filters])

  const chips = describeActiveFilters(filters)

  if (!open) {
    return (
      <div className="rail rail--collapsed" aria-hidden="true">
        <button type="button" onClick={onToggle} tabIndex={-1} className="sr-only">
          Show filters
        </button>
      </div>
    )
  }

  const dateActive = (d: DateRange) => (d.start ? 1 : 0) + (d.end ? 1 : 0)
  const rangeActive = (r: NumericRange) => (r.min !== null ? 1 : 0) + (r.max !== null ? 1 : 0)

  return (
    <aside className="rail" aria-label="Filters">
      <div className="rail__header">
        <span className="rail__title">
          <IconFilter size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
          Filters
        </span>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={onToggle}
          aria-label="Hide filters"
          title="Hide filters"
        >
          <IconX size={13} />
        </button>
      </div>

      <div className="rail__scroll">
        <div className="fsection__body" style={{ paddingTop: 12 }}>
          <div className="mapsearch__input-wrap" style={{ boxShadow: 'none' }}>
            <IconSearch size={14} className="mapsearch__icon" />
            <input
              className="mapsearch__input"
              type="search"
              placeholder="Keyword across every field"
              value={filters.search}
              onChange={(e) => patch({ search: e.target.value })}
              aria-label="Keyword search"
            />
            {filters.search && (
              <button
                type="button"
                className="mapsearch__clear"
                onClick={() => patch({ search: '' })}
                aria-label="Clear keyword"
              >
                <IconX size={12} />
              </button>
            )}
          </div>

          <div className="small muted">
            <strong style={{ color: 'var(--ink)' }}>{filtered.length.toLocaleString('en-US')}</strong>{' '}
            of {deals.length.toLocaleString('en-US')} deals match
          </div>

          {chips.length > 0 && (
            <div className="chiprow">
              {chips.map((chip) => (
                <span key={chip.id} className="chip">
                  <span className="chip__label" title={chip.label}>
                    {chip.label}
                  </span>
                  <button
                    type="button"
                    className="chip__x"
                    onClick={() => setFilters(chip.clear)}
                    aria-label={`Remove filter ${chip.label}`}
                  >
                    <IconX size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <Section title="City" activeCount={filters.cities.length} defaultOpen>
          <OptionList
            options={facets.cities}
            selected={filters.cities}
            counts={counts.cities}
            emptyLabel="No city column mapped"
            onChange={(cities) => patch({ cities })}
          />
        </Section>

        <Section title="State" activeCount={filters.states.length}>
          <OptionList
            options={facets.states}
            selected={filters.states}
            counts={counts.states}
            emptyLabel="No state column mapped"
            onChange={(states) => patch({ states })}
          />
        </Section>

        <Section title="Lease date" activeCount={dateActive(filters.leaseDate)} defaultOpen>
          <DateRangeField
            label="Lease date"
            value={filters.leaseDate}
            bounds={bounds.leaseDate}
            emptyHint="No lease dates in this dataset"
            onChange={(leaseDate) => patch({ leaseDate })}
          />
          <span className="range-hint">
            When the lease commences. Filter on when it was signed in the next section.
          </span>
        </Section>

        <Section title="Signed date" activeCount={dateActive(filters.executionDate)}>
          <DateRangeField
            label="Signed date"
            value={filters.executionDate}
            bounds={bounds.executionDate}
            emptyHint="No signed dates in this dataset"
            onChange={(executionDate) => patch({ executionDate })}
          />
          <span className="range-hint">
            The Signed Date column: when the deal was executed, which the popup shows as the
            execution date and the table as Executed. A deal signed in one quarter often
            commences in another, so the two filters answer different questions and combine.
          </span>
        </Section>

        <Section title="Area leased (SF)" activeCount={rangeActive(filters.areaLeased)}>
          <RangeField
            value={filters.areaLeased}
            bounds={bounds.areaLeased}
            step={100}
            suffix=" SF"
            onChange={(areaLeased) => patch({ areaLeased })}
          />
        </Section>

        <Section title="Term length (months)" activeCount={rangeActive(filters.termMonths)}>
          <RangeField
            value={filters.termMonths}
            bounds={bounds.termMonths}
            step={1}
            suffix=" mos"
            onChange={(termMonths) => patch({ termMonths })}
          />
        </Section>

        <Section title="Base rent (annual $/SF)" activeCount={rangeActive(filters.baseRent)}>
          <RangeField
            value={filters.baseRent}
            bounds={bounds.baseRent}
            step={0.25}
            prefix="$"
            onChange={(baseRent) => patch({ baseRent })}
          />
          <span className="range-hint">
            Rows the sheet quotes monthly are multiplied by twelve first, so office and
            industrial deals compare on the same basis.
          </span>
        </Section>

        <Section title="Free rent (months)" activeCount={rangeActive(filters.freeRent)}>
          <RangeField
            value={filters.freeRent}
            bounds={bounds.freeRent}
            step={1}
            suffix=" mos"
            onChange={(freeRent) => patch({ freeRent })}
          />
        </Section>

        <Section title="Lease type" activeCount={filters.leaseTypes.length} defaultOpen>
          <OptionList
            options={facets.leaseTypes}
            selected={filters.leaseTypes}
            counts={counts.leaseTypes}
            emptyLabel="No lease type column mapped"
            onChange={(leaseTypes) => patch({ leaseTypes })}
          />
        </Section>

        <Section title="Property subtype" activeCount={filters.propertySubtypes.length}>
          <OptionList
            options={facets.propertySubtypes}
            selected={filters.propertySubtypes}
            counts={counts.propertySubtypes}
            emptyLabel="No property subtype column mapped"
            onChange={(propertySubtypes) => patch({ propertySubtypes })}
          />
        </Section>

        <Section
          title="Drawn area"
          activeCount={filters.shape ? 1 : 0}
          defaultOpen={filters.shape !== null}
        >
          {filters.shape ? (
            <>
              <div className="small">
                {shapeLabel(filters.shape)} · {shapeAreaLabel(filters.shape)}
              </div>
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => patch({ shape: null })}
              >
                <IconX size={12} />
                Remove drawn area
              </button>
            </>
          ) : (
            <div className="small muted">
              Use the draw tools on the Map tab to keep only the deals inside a shape you trace.
            </div>
          )}
        </Section>

        <Section title="Data quality" activeCount={filters.mappedOnly ? 1 : 0}>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={filters.mappedOnly}
              onChange={(e) => patch({ mappedOnly: e.target.checked })}
            />
            Only rows placed on the map
          </label>
          <span className="range-hint">
            {unlocatedCount === 0
              ? 'Every row has a location.'
              : `${unlocatedCount.toLocaleString('en-US')} ${
                  unlocatedCount === 1 ? 'row has' : 'rows have'
                } no location yet. They stay in the dashboard unless this is ticked.`}
          </span>
          <span className="range-hint">
            A range filter only keeps rows that actually carry a value for that measure. Blanks drop
            out while the filter is on.
          </span>
        </Section>
      </div>

      <div className="rail__footer">
        <button
          type="button"
          className="btn grow"
          onClick={resetFilters}
          disabled={chips.length === 0}
        >
          Clear all filters
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() =>
            setFilters((prev) => ({
              ...prev,
              areaLeased: emptyRange(),
              termMonths: emptyRange(),
              baseRent: emptyRange(),
              freeRent: emptyRange(),
            }))
          }
          title="Clear only the numeric ranges"
        >
          Ranges
        </button>
      </div>
    </aside>
  )
}
