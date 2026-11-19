import { useMemo, useState } from 'react'
import { useApp } from '../state/AppContext'
import { dealsToCsv, downloadCsv, timestampedName } from '../lib/exportCsv'
import { dealsToXlsx, downloadXlsx } from '../lib/exportXlsx'
import { describeSort, initialDirection, sortDeals, TABLE_COLUMNS as COLUMNS } from '../lib/tableColumns'
import { IconDownload, IconPin } from './Icons'

const PAGE_SIZES = [50, 100, 250, 1000]

export function DataTable() {
  const { filtered, requestFocus, tableSort, setTableSort } = useApp()
  const { key: sortKey, direction } = tableSort
  const [pageSize, setPageSize] = useState(50)
  const [page, setPage] = useState(0)

  const sorted = useMemo(() => sortDeals(filtered, tableSort), [filtered, tableSort])

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const rows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize)

  const toggleSort = (key: string) => {
    if (key === sortKey) {
      setTableSort({ key, direction: direction === 'asc' ? 'desc' : 'asc' })
    } else {
      setTableSort({ key, direction: initialDirection(key) })
    }
    setPage(0)
  }

  return (
    <div className="card">
      <div className="card__header">
        <div>
          <div className="card__title">All matching deals</div>
          <div className="card__subtitle">
            {sorted.length.toLocaleString('en-US')} rows · sorted by {describeSort(tableSort)}
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
          {/* Both write the rows in the table's own sort order. */}
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => downloadXlsx(timestampedName('cbre-hcls-lease-comps', 'xlsx'), dealsToXlsx(sorted))}
            disabled={sorted.length === 0}
          >
            <IconDownload size={13} />
            Export Excel
          </button>
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
