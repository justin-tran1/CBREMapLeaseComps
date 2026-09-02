import { useMemo, useState } from 'react'
import { useApp } from '../state/AppContext'
import { dealsToCsv, downloadCsv, timestampedName } from '../lib/exportCsv'
import { fmtArea, fmtDate, fmtRent, fmtShortMonths, fmtText, EMPTY } from '../lib/format'
import { resolveEscalation } from '../lib/normalize'
import { IconDownload, IconPin } from './Icons'
import type { LeaseDeal } from '../types'

type SortDirection = 'asc' | 'desc'

interface Column {
  key: string
  label: string
  numeric?: boolean
  render: (deal: LeaseDeal) => string
  sortValue: (deal: LeaseDeal) => string | number | null
}

const COLUMNS: Column[] = [
  { key: 'compId', label: 'Comp ID', render: (d) => fmtText(d.compId), sortValue: (d) => d.compId.toLowerCase() },
  {
    key: 'confidentiality',
    label: 'Conf.',
    render: (d) => fmtText(d.confidentiality),
    sortValue: (d) => d.confidentiality.toLowerCase(),
  },
  {
    key: 'property',
    label: 'Property',
    render: (d) => fmtText(d.propertyName || d.address),
    sortValue: (d) => (d.propertyName || d.address).toLowerCase(),
  },
  { key: 'address', label: 'Address', render: (d) => fmtText(d.address), sortValue: (d) => d.address.toLowerCase() },
  { key: 'city', label: 'City', render: (d) => fmtText(d.city), sortValue: (d) => d.city.toLowerCase() },
  { key: 'state', label: 'State', render: (d) => fmtText(d.state), sortValue: (d) => d.state.toLowerCase() },
  {
    key: 'leaseDate',
    label: 'Lease date',
    render: (d) => fmtDate(d.leaseDate),
    sortValue: (d) => d.leaseDate?.getTime() ?? null,
  },
  {
    key: 'term',
    label: 'Term',
    numeric: true,
    render: (d) => fmtShortMonths(d.termMonths),
    sortValue: (d) => d.termMonths,
  },
  {
    key: 'executionDate',
    label: 'Signed',
    render: (d) => fmtDate(d.executionDate),
    sortValue: (d) => d.executionDate?.getTime() ?? null,
  },
  { key: 'leaseType', label: 'Lease type', render: (d) => fmtText(d.leaseType), sortValue: (d) => d.leaseType.toLowerCase() },
  {
    key: 'subtype',
    label: 'Subtype',
    render: (d) => fmtText(d.propertySubtype),
    sortValue: (d) => d.propertySubtype.toLowerCase(),
  },
  { key: 'floor', label: 'Floor', render: (d) => fmtText(d.floor), sortValue: (d) => d.floor.toLowerCase() },
  { key: 'suite', label: 'Suite', render: (d) => fmtText(d.suite), sortValue: (d) => d.suite.toLowerCase() },
  {
    key: 'area',
    label: 'Area leased',
    numeric: true,
    render: (d) => fmtArea(d.areaLeased),
    sortValue: (d) => d.areaLeased,
  },
  {
    key: 'baseRent',
    label: 'Base rent',
    numeric: true,
    render: (d) => fmtRent(d.baseRent, d.rateType),
    // Sorting compares annualised rates so a monthly quote does not sink to the bottom.
    sortValue: (d) => d.baseRentAnnual,
  },
  {
    key: 'opex',
    label: 'OpEx',
    numeric: true,
    render: (d) => fmtRent(d.opex, d.rateType),
    sortValue: (d) => d.opexAnnual,
  },
  {
    key: 'escalation',
    label: 'Escalation',
    render: (d) => fmtText(resolveEscalation(d)),
    sortValue: (d) => resolveEscalation(d).toLowerCase(),
  },
  {
    key: 'freeRent',
    label: 'Free rent',
    numeric: true,
    render: (d) => (d.freeRent === null ? EMPTY : fmtShortMonths(d.freeRent)),
    sortValue: (d) => d.freeRent,
  },
  {
    key: 'ti',
    label: 'TI allowance',
    numeric: true,
    render: (d) => (d.tiAllowance === null ? EMPTY : fmtRent(d.tiAllowance, 'annual').replace('/SF/Yr', '/SF')),
    sortValue: (d) => d.tiAllowance,
  },
  { key: 'lessor', label: 'Lessor', render: (d) => fmtText(d.lessor), sortValue: (d) => d.lessor.toLowerCase() },
  { key: 'lessee', label: 'Lessee', render: (d) => fmtText(d.lessee), sortValue: (d) => d.lessee.toLowerCase() },
  {
    key: 'submarket',
    label: 'Submarket',
    render: (d) => fmtText(d.submarket),
    sortValue: (d) => d.submarket.toLowerCase(),
  },
]

const PAGE_SIZES = [50, 100, 250, 1000]

export function DataTable() {
  const { filtered, requestFocus } = useApp()
  const [sortKey, setSortKey] = useState('leaseDate')
  const [direction, setDirection] = useState<SortDirection>('desc')
  const [pageSize, setPageSize] = useState(50)
  const [page, setPage] = useState(0)

  const sorted = useMemo(() => {
    const column = COLUMNS.find((c) => c.key === sortKey) ?? COLUMNS[0]
    const factor = direction === 'asc' ? 1 : -1

    return [...filtered].sort((a, b) => {
      const av = column.sortValue(a)
      const bv = column.sortValue(b)

      // Blanks always sink to the bottom, whichever way the column is sorted.
      const aEmpty = av === null || av === '' || av === undefined
      const bEmpty = bv === null || bv === '' || bv === undefined
      if (aEmpty && bEmpty) return a.sourceRow - b.sourceRow
      if (aEmpty) return 1
      if (bEmpty) return -1

      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor
      return String(av).localeCompare(String(bv)) * factor
    })
  }, [filtered, sortKey, direction])

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const rows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize)

  const toggleSort = (key: string) => {
    if (key === sortKey) {
      setDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setDirection(key === 'leaseDate' || key === 'area' || key === 'baseRent' ? 'desc' : 'asc')
    }
    setPage(0)
  }

  return (
    <div className="card">
      <div className="card__header">
        <div>
          <div className="card__title">All matching deals</div>
          <div className="card__subtitle">
            {sorted.length.toLocaleString('en-US')} rows · sorted by{' '}
            {COLUMNS.find((c) => c.key === sortKey)?.label.toLowerCase()} ({direction === 'asc' ? 'ascending' : 'descending'})
          </div>
        </div>
        <div className="row">
          <label className="row small muted" style={{ gap: 6 }}>
            Rows
            <select
              className="select"
              style={{ width: 'auto' }}
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setPage(0)
              }}
              aria-label="Rows per page"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => downloadCsv(timestampedName('cbre-hcls-lease-comps'), dealsToCsv(sorted))}
            disabled={sorted.length === 0}
          >
            <IconDownload size={13} />
            Export CSV
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__title">No deals match the current filters</div>
          <p className="small" style={{ margin: 0 }}>
            Clear a filter in the rail on the left to bring rows back.
          </p>
        </div>
      ) : (
        <>
          <div className="tablewrap">
            <table className="dtable">
              <thead>
                <tr>
                  <th scope="col" style={{ width: 34 }}>
                    <span className="sr-only">Show on map</span>
                  </th>
                  {COLUMNS.map((column) => (
                    <th key={column.key} scope="col" className={column.numeric ? 'num' : undefined}>
                      <button
                        type="button"
                        onClick={() => toggleSort(column.key)}
                        aria-sort={
                          sortKey === column.key ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'
                        }
                      >
                        {column.label}
                        {sortKey === column.key && (
                          <span className="dtable__sort" aria-hidden="true">
                            {direction === 'asc' ? '▲' : '▼'}
                          </span>
                        )}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((deal) => (
                  <tr key={deal.id}>
                    <td>
                      {deal.lat !== null && deal.lon !== null ? (
                        <button
                          type="button"
                          className="linkbtn"
                          title="Show this deal on the map"
                          onClick={() => requestFocus(deal.id)}
                          style={{ textDecoration: 'none' }}
                        >
                          <IconPin size={13} />
                          <span className="sr-only">Show {deal.propertyName || deal.address} on the map</span>
                        </button>
                      ) : (
                        <span className="muted" title="No coordinates for this row">
                          ·
                        </span>
                      )}
                    </td>
                    {COLUMNS.map((column) => {
                      const value = column.render(deal)
                      return (
                        <td key={column.key} className={column.numeric ? 'num' : undefined} title={value}>
                          {value}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <div className="row" style={{ padding: '10px 16px', justifyContent: 'space-between' }}>
              <span className="small muted">
                Showing {(safePage * pageSize + 1).toLocaleString('en-US')} to{' '}
                {Math.min((safePage + 1) * pageSize, sorted.length).toLocaleString('en-US')} of{' '}
                {sorted.length.toLocaleString('en-US')}
              </span>
              <span className="row">
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => setPage(Math.max(0, safePage - 1))}
                  disabled={safePage === 0}
                >
                  Previous
                </button>
                <span className="small muted">
                  Page {safePage + 1} of {pageCount}
                </span>
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
                  disabled={safePage >= pageCount - 1}
                >
                  Next
                </button>
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
