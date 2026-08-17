import { useEffect, useMemo, useRef, useState } from 'react'
import { fullAddress } from '../lib/normalize'
import { IconSearch, IconX } from './Icons'
import type { Site } from '../types'

const MAX_RESULTS = 12

interface MapSearchProps {
  sites: Site[]
  onSelect: (site: Site) => void
}

interface Indexed {
  site: Site
  haystack: string
  subtitle: string
}

/** Jump straight to a property. This moves the map; it does not filter the data. */
export function MapSearch({ sites, onSelect }: MapSearchProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const index = useMemo<Indexed[]>(
    () =>
      sites.map((site) => {
        const first = site.deals[0]
        const address = first ? fullAddress(first) : [site.address, site.city, site.state].filter(Boolean).join(', ')
        const tenants = [...new Set(site.deals.map((d) => d.lessee).filter(Boolean))]
        const suites = [...new Set(site.deals.map((d) => d.suite).filter(Boolean))]

        return {
          site,
          haystack: [
            site.label,
            address,
            site.zip,
            ...tenants,
            ...suites,
            ...new Set(site.deals.map((d) => d.submarket).filter(Boolean)),
            ...new Set(site.deals.map((d) => d.lessor).filter(Boolean)),
          ]
            .join(' ')
            .toLowerCase(),
          subtitle:
            [address, tenants.length ? tenants.slice(0, 2).join(', ') : ''].filter(Boolean).join(' · ') ||
            `${site.deals.length} deals`,
        }
      }),
    [sites],
  )

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const terms = q.split(/\s+/)
    const matched = index.filter((entry) => terms.every((term) => entry.haystack.includes(term)))
    // Prefer a title that starts with the query, then the busiest addresses.
    return matched
      .sort((a, b) => {
        const aStarts = a.site.label.toLowerCase().startsWith(q) ? 0 : 1
        const bStarts = b.site.label.toLowerCase().startsWith(q) ? 0 : 1
        if (aStarts !== bStarts) return aStarts - bStarts
        return b.site.deals.length - a.site.deals.length || a.site.label.localeCompare(b.site.label)
      })
      .slice(0, MAX_RESULTS)
  }, [index, query])

  useEffect(() => setActive(0), [query])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  useEffect(() => {
    const item = listRef.current?.children[active] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const choose = (entry: Indexed | undefined) => {
    if (!entry) return
    onSelect(entry.site)
    setOpen(false)
    setQuery(entry.site.label)
  }

  const showResults = open && query.trim().length > 0

  return (
    <div className="mapsearch" ref={wrapRef}>
      <div className="mapsearch__input-wrap">
        <IconSearch size={15} className="mapsearch__icon" />
        <input
          className="mapsearch__input"
          type="text"
          role="combobox"
          aria-expanded={showResults}
          aria-controls="mapsearch-results"
          aria-autocomplete="list"
          placeholder="Jump to a property, tenant or address"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setOpen(true)
              setActive((i) => Math.min(i + 1, results.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((i) => Math.max(i - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              choose(results[active])
            } else if (e.key === 'Escape') {
              setOpen(false)
              ;(e.target as HTMLInputElement).blur()
            }
          }}
        />
        {query && (
          <button
            type="button"
            className="mapsearch__clear"
            onClick={() => {
              setQuery('')
              setOpen(false)
            }}
            aria-label="Clear search"
          >
            <IconX size={13} />
          </button>
        )}
      </div>

      {showResults && (
        <ul className="mapsearch__results" id="mapsearch-results" role="listbox" ref={listRef}>
          {results.length === 0 && (
            <li className="mapsearch__empty">
              No property matches "{query.trim()}". Check the filters if you expected a result.
            </li>
          )}
          {results.map((entry, i) => (
            <li
              key={entry.site.id}
              role="option"
              aria-selected={i === active}
              className={`mapsearch__item${i === active ? ' mapsearch__item--active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(entry)}
            >
              <span className="mapsearch__item-title">{entry.site.label}</span>
              <span className="mapsearch__item-sub">
                {entry.subtitle}
                {entry.site.deals.length > 1 && ` · ${entry.site.deals.length} deals`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
