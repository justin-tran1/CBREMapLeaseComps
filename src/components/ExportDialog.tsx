import {
  useDeferredValue,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import { useApp } from '../state/AppContext'
import { buildDashboardModel, chartSpecs } from '../lib/dashboardModel'
import {
  DEFAULT_EXPORT_TITLE,
  DEFAULT_TABLE_COLUMNS,
  EXPORT_GROUPS,
  TABLE_ROW_LIMITS,
  readStoredExportPrefs,
  writeStoredExportPrefs,
  type ExportFormat,
  type ExportGroupId,
  type ExportPrefs,
  type ExportSectionId,
  type TableRowLimit,
} from '../lib/exportPrefs'
import { isConfidential } from '../lib/normalize'
import { TABLE_COLUMNS, describeSort } from '../lib/tableColumns'
import { buildExportInput, sectionStates, type ExportContext } from '../export/input'
import { estimateExport, exportDashboard } from '../export/index'
import { IconDownload, IconX } from './Icons'

const FORMATS: Array<{ id: ExportFormat; label: string; noun: string; description: string }> = [
  {
    id: 'pdf',
    label: 'PDF report',
    noun: 'PDF',
    description: 'Letter landscape. Charts stay sharp at any zoom and print cleanly.',
  },
  {
    id: 'pptx',
    label: 'PowerPoint deck',
    noun: 'PowerPoint',
    description: 'Widescreen, one chart to a slide. Charts stay editable in PowerPoint.',
  },
]

const ALL_COLUMN_KEYS = TABLE_COLUMNS.map((c) => c.key)

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

/**
 * Export the dashboard as a PDF report or a PowerPoint deck, with the parts the person picks.
 *
 * The file follows what the dashboard shows: the deals passing the filters, the chart settings
 * and the table's sort. Choices are kept in this browser, so the next export starts from the
 * last one.
 */
export function ExportDialog() {
  const { deals, filtered, filters, fileName, tableSort, chartPrefs, theme, setExportOpen } = useApp()
  const [prefs, setPrefs] = useState<ExportPrefs>(readStoredExportPrefs)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const panelRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const id = useId()

  useEffect(() => writeStoredExportPrefs(prefs), [prefs])

  // Focus moves into the dialog on open and back to whatever opened it on close. A layout effect,
  // so the hand-back happens in the same commit that removes the dialog: never a frame on <body>.
  useLayoutEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    headingRef.current?.focus()
    return () => {
      if (opener && opener.isConnected) opener.focus()
    }
  }, [])

  const ctx = useMemo<ExportContext>(
    () => ({ deals, filtered, filters, fileName, tableSort, chartPrefs }),
    [deals, filtered, filters, fileName, tableSort, chartPrefs],
  )
  const model = useMemo(() => buildDashboardModel(deals, filtered), [deals, filtered])
  const specs = useMemo(() => chartSpecs(model), [model])
  const states = useMemo(() => sectionStates(model, specs, ctx, prefs), [model, specs, ctx, prefs])
  const confidentialCount = useMemo(() => filtered.filter(isConfidential).length, [filtered])

  // The length is worked out from a deferred copy, so typing a title never waits on it.
  const deferredPrefs = useDeferredValue(prefs)
  const stamp = useMemo(() => new Date(), [])
  const estimate = useMemo(() => {
    const input = buildExportInput(ctx, deferredPrefs, stamp, { model, specs })
    return input.sections.length > 0 ? estimateExport(input) : null
  }, [ctx, deferredPrefs, stamp, model, specs])

  const available = states.filter((s) => s.available)
  const chosen = available.filter((s) => prefs.sections[s.def.id])
  const tableState = states.find((s) => s.def.id === 'table')
  const tableOn = !!tableState?.available && prefs.sections.table
  const format = FORMATS.find((f) => f.id === prefs.format) ?? FORMATS[0]
  const nothingMatches = filtered.length === 0
  const canDownload = !busy && chosen.length > 0

  const update = (patch: Partial<ExportPrefs>) => setPrefs((current) => ({ ...current, ...patch }))

  const setSection = (sectionId: ExportSectionId, on: boolean) =>
    setPrefs((current) => ({ ...current, sections: { ...current.sections, [sectionId]: on } }))

  const setGroup = (group: ExportGroupId, on: boolean) =>
    setPrefs((current) => {
      const sections = { ...current.sections }
      for (const state of states) if (state.def.group === group) sections[state.def.id] = on
      return { ...current, sections }
    })

  const setColumn = (key: string, on: boolean) =>
    setPrefs((current) => {
      const keys = new Set(current.tableColumns)
      if (on) keys.add(key)
      else keys.delete(key)
      // Kept in the table's own order, whatever order they were ticked in.
      const tableColumns = ALL_COLUMN_KEYS.filter((k) => keys.has(k))
      return tableColumns.length === 0 ? current : { ...current, tableColumns }
    })

  const close = () => {
    if (!busy) setExportOpen(false)
  }

  const download = async () => {
    if (!canDownload) return
    setBusy(true)
    setError(null)
    try {
      const input = buildExportInput(ctx, prefs, new Date(), { model, specs })
      await exportDashboard(input)
      setExportOpen(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(`The file could not be built. ${message}`)
    } finally {
      setBusy(false)
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      close()
      return
    }
    if (event.key !== 'Tab' || !panelRef.current) return
    // Keep Tab inside the dialog while it is open.
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.getClientRects().length > 0 && !el.closest('fieldset:disabled'),
    )
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === headingRef.current || active === panelRef.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const onBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) close()
  }

  const columnCount = prefs.tableColumns.length
  const isDefaultColumns =
    columnCount === DEFAULT_TABLE_COLUMNS.length && DEFAULT_TABLE_COLUMNS.every((k) => prefs.tableColumns.includes(k))
  const tableRowsAvailable = filtered.length - (prefs.omitConfidential ? confidentialCount : 0)

  let lengthText = ''
  if (estimate) {
    lengthText =
      estimate.unit === 'page'
        ? `About ${plural(estimate.length, 'page', 'pages')}`
        : plural(estimate.length, 'slide', 'slides')
  }

  return (
    <div className="xdlg" onMouseDown={onBackdrop}>
      <div
        ref={panelRef}
        className="xdlg__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-sub`}
        aria-busy={busy}
        // Focusable, so a click on plain text inside keeps focus, and Escape and Tab, in the dialog.
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <header className="xdlg__head">
          <div className="grow">
            <h2 className="xdlg__title" id={`${id}-title`} tabIndex={-1} ref={headingRef}>
              Export dashboard
            </h2>
            <p className="xdlg__sub" id={`${id}-sub`}>
              {nothingMatches
                ? 'No deals match the current filters. Clear a filter to export.'
                : `Built from the ${plural(filtered.length, 'deal', 'deals')} passing the current filters, with your chart settings and the table's sort.`}
            </p>
          </div>
          <button type="button" className="chip__x xdlg__close" onClick={close} disabled={busy} aria-label="Close export">
            <IconX size={14} />
          </button>
        </header>

        <div className="xdlg__body">
          <section className="xdlg__col" aria-labelledby={`${id}-include`}>
            <div className="xdlg__colhead">
              <h3 className="xdlg__label" id={`${id}-include`}>
                Include
              </h3>
              <span className="xdlg__count">
                {chosen.length} of {available.length} {available.length === 1 ? 'part' : 'parts'}
              </span>
            </div>

            {EXPORT_GROUPS.map((group) => {
              const members = states.filter((s) => s.def.group === group.id)
              const live = members.filter((s) => s.available)
              const allOn = live.length > 0 && live.every((s) => prefs.sections[s.def.id])
              const allOff = live.every((s) => !prefs.sections[s.def.id])
              return (
                <div key={group.id} className="xgroup" role="group" aria-labelledby={`${id}-group-${group.id}`}>
                  <div className="xgroup__head">
                    <span className="xgroup__name" id={`${id}-group-${group.id}`}>
                      {group.label}
                    </span>
                    <span className="xgroup__actions">
                      <button
                        type="button"
                        className="linkbtn"
                        onClick={() => setGroup(group.id, true)}
                        disabled={live.length === 0 || allOn}
                        aria-label={`Include every ${group.label.toLowerCase()} part`}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        className="linkbtn"
                        onClick={() => setGroup(group.id, false)}
                        disabled={live.length === 0 || allOff}
                        aria-label={`Leave out every ${group.label.toLowerCase()} part`}
                      >
                        None
                      </button>
                    </span>
                  </div>

                  {members.map((state) => (
                    <label key={state.def.id} className={`xpart${state.available ? '' : ' xpart--off'}`}>
                      <input
                        type="checkbox"
                        checked={state.available && prefs.sections[state.def.id]}
                        disabled={!state.available}
                        onChange={(event) => setSection(state.def.id, event.target.checked)}
                      />
                      <span className="grow">
                        <span className="xpart__name">{state.label}</span>
                        {(state.available ? state.hint : state.reason) && (
                          <span className="xpart__sub">{state.available ? state.hint : state.reason}</span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              )
            })}
          </section>

          <section className="xdlg__col xdlg__col--options" aria-label="Options">
            <fieldset className="xfield">
              <legend className="xdlg__label">Format</legend>
              <div className="xformats">
                {FORMATS.map((option) => (
                  <label key={option.id} className={`xformat${prefs.format === option.id ? ' xformat--on' : ''}`}>
                    <input
                      type="radio"
                      name={`${id}-format`}
                      value={option.id}
                      checked={prefs.format === option.id}
                      onChange={() => update({ format: option.id })}
                    />
                    <span className="grow">
                      <span className="xformat__name">{option.label}</span>
                      <span className="xformat__sub">{option.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="xfield">
              <label className="xdlg__label" htmlFor={`${id}-name`}>
                Title
              </label>
              <input
                id={`${id}-name`}
                className="input"
                type="text"
                value={prefs.title}
                maxLength={120}
                placeholder={DEFAULT_EXPORT_TITLE}
                onChange={(event) => update({ title: event.target.value })}
              />
              <span className="range-hint">
                {prefs.format === 'pdf'
                  ? 'Shown on the cover and at the top of every page.'
                  : 'Shown on the title slide.'}{' '}
                Leave blank for the default.
              </span>
            </div>

            <fieldset className="xfield" disabled={!tableOn}>
              <legend className="xdlg__label">Deal table</legend>
              {!tableOn && <span className="range-hint">Include the deal table to choose its columns and rows.</span>}

              <details className="xcols">
                <summary>
                  Columns <span className="xcols__count">{columnCount} of {ALL_COLUMN_KEYS.length}</span>
                </summary>
                <div className="xcols__grid">
                  {TABLE_COLUMNS.map((column) => {
                    const on = prefs.tableColumns.includes(column.key)
                    return (
                      <label key={column.key} className="checkbox">
                        <input
                          type="checkbox"
                          checked={on}
                          // The last column stays: a table needs one.
                          disabled={on && columnCount === 1}
                          onChange={(event) => setColumn(column.key, event.target.checked)}
                        />
                        {column.longLabel ?? column.label}
                      </label>
                    )
                  })}
                </div>
                <div className="xcols__actions">
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => update({ tableColumns: [...DEFAULT_TABLE_COLUMNS] })}
                    disabled={isDefaultColumns}
                  >
                    Default set
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => update({ tableColumns: [...ALL_COLUMN_KEYS] })}
                    disabled={columnCount === ALL_COLUMN_KEYS.length}
                  >
                    Every column
                  </button>
                </div>
              </details>

              <div className="xfield xfield--row">
                <label className="xfield__inline" htmlFor={`${id}-rows`}>
                  Rows
                </label>
                <select
                  id={`${id}-rows`}
                  className="select"
                  value={String(prefs.tableRows)}
                  onChange={(event) => {
                    const raw = event.target.value
                    update({ tableRows: (raw === 'all' ? 'all' : Number(raw)) as TableRowLimit })
                  }}
                >
                  {TABLE_ROW_LIMITS.map((limit) => (
                    <option key={String(limit)} value={String(limit)}>
                      {limit === 'all' ? `All ${plural(tableRowsAvailable, 'row', 'rows')}` : `First ${limit}`}
                    </option>
                  ))}
                </select>
              </div>
              <span className="range-hint">In the table's current order: {describeSort(tableSort)}.</span>

              <label className="checkbox xfield__check">
                <input
                  type="checkbox"
                  checked={prefs.omitConfidential}
                  onChange={(event) => update({ omitConfidential: event.target.checked })}
                />
                <span>
                  Leave out confidential deals
                  {confidentialCount > 0 && <span className="muted"> ({confidentialCount.toLocaleString('en-US')})</span>}
                </span>
              </label>
              <span className="range-hint">Charts and headline numbers still count them.</span>
            </fieldset>
          </section>
        </div>

        <footer className="xdlg__foot">
          {/* Marked stale for the moment it takes the deferred estimate to catch up with a change. */}
          <div className="xdlg__estimate grow" aria-live="polite" data-stale={deferredPrefs !== prefs || undefined}>
            {estimate ? (
              <>
                <span className="xdlg__length">{lengthText}</span>
                {estimate.tableFontSize !== undefined && estimate.tableFontSize <= 8 && (
                  <span className="range-hint">
                    The table sets in {estimate.tableFontSize} pt to fit {plural(columnCount, 'column', 'columns')}. Fewer
                    columns give larger type.
                  </span>
                )}
                {theme === 'dark' && <span className="range-hint">Files always use the light theme.</span>}
              </>
            ) : (
              <span className="range-hint">
                {nothingMatches ? 'Nothing to export yet.' : 'Choose at least one part to export.'}
              </span>
            )}
            {error && (
              <span className="xdlg__error" role="alert">
                {error}
              </span>
            )}
          </div>
          <div className="xdlg__actions">
            <button type="button" className="btn" onClick={close} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn btn--primary" onClick={download} disabled={!canDownload}>
              {busy ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  Building {format.noun}…
                </>
              ) : (
                <>
                  <IconDownload size={14} />
                  Download {format.noun}
                </>
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
