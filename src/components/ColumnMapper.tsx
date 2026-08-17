import { useMemo } from 'react'
import { useApp } from '../state/AppContext'
import { autoMapColumns, FIELDS, FIELD_GROUPS, missingRequiredFields } from '../lib/fields'
import { toText } from '../lib/coerce'
import { IconAlert, IconCheck, IconInfo, IconRefresh } from './Icons'
import type { FieldKey } from '../types'

const PREVIEW_LIMIT = 3

export function ColumnMapper() {
  const { sheet, columnMap, setColumnMap, confirmMapping, changeSheet, loadingFile, parseError, deals } = useApp()

  const previews = useMemo(() => {
    const result = new Map<string, string>()
    if (!sheet) return result

    for (const header of sheet.headers) {
      const samples: string[] = []
      for (const row of sheet.rows) {
        const text = toText(row[header])
        if (text) samples.push(text.length > 28 ? `${text.slice(0, 28)}…` : text)
        if (samples.length >= PREVIEW_LIMIT) break
      }
      result.set(header, samples.join(' · '))
    }
    return result
  }, [sheet])

  const usage = useMemo(() => {
    const counts = new Map<string, number>()
    for (const header of Object.values(columnMap)) {
      if (!header) continue
      counts.set(header, (counts.get(header) ?? 0) + 1)
    }
    return counts
  }, [columnMap])

  if (!sheet) return null

  const missing = missingRequiredFields(columnMap)
  const mappedCount = Object.values(columnMap).filter(Boolean).length
  const unusedHeaders = sheet.headers.filter((h) => !usage.has(h))

  const setField = (key: FieldKey, header: string) => {
    const next = { ...columnMap }
    if (header) next[key] = header
    else delete next[key]
    setColumnMap(next)
  }

  return (
    <div className="mapper">
      <div className="mapper__inner">
        <div className="mapper__bar">
          <div className="grow">
            <div className="card__title">Check the column mapping</div>
            <div className="card__subtitle">
              {sheet.rows.length.toLocaleString('en-US')} rows · {sheet.headers.length} columns ·{' '}
              {mappedCount} mapped
            </div>
          </div>

          {sheet.sheetNames.length > 1 && (
            <label className="field" style={{ minWidth: 190 }}>
              <span className="field__label">Worksheet</span>
              <select
                className="select"
                value={sheet.sheetName}
                disabled={loadingFile}
                onChange={(e) => void changeSheet(e.target.value)}
              >
                {sheet.sheetNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <button
            type="button"
            className="btn"
            onClick={() => setColumnMap(autoMapColumns(sheet.headers))}
            title="Discard manual changes and detect the columns again"
          >
            <IconRefresh size={14} />
            Re-detect
          </button>

          <button
            type="button"
            className="btn btn--primary"
            onClick={confirmMapping}
            disabled={missing.length > 0 || loadingFile}
          >
            <IconCheck size={14} />
            {deals.length > 0 ? 'Apply changes' : 'Continue'}
          </button>
        </div>

        {parseError && (
          <div className="alert alert--error" role="alert">
            <IconAlert className="alert__icon" size={16} />
            <span>{parseError}</span>
          </div>
        )}

        {missing.length > 0 ? (
          <div className="alert alert--warn">
            <IconAlert className="alert__icon" size={16} />
            <span>
              Map {missing.map((f) => f.label).join(', ')} before continuing. These drive the map
              pins and the core dashboard measures.
            </span>
          </div>
        ) : (
          <div className="alert alert--info">
            <IconInfo className="alert__icon" size={16} />
            <span>
              Every field below is optional except the ones marked required. Leave a field unmapped
              and it simply shows as blank in the popup and the table. Escalations often span
              several columns, so pick whichever one reads best for the deal summary.
            </span>
          </div>
        )}

        {FIELD_GROUPS.map((group) => {
          const fields = FIELDS.filter((f) => f.group === group)
          if (fields.length === 0) return null

          return (
            <section key={group} className="mapper__group">
              <h2 className="mapper__group-title">{group}</h2>
              <div className="mapper__grid">
                {fields.map((field) => {
                  const value = columnMap[field.key] ?? ''
                  const unmappedRequired = field.required && !value
                  const duplicated = value && (usage.get(value) ?? 0) > 1

                  return (
                    <div
                      key={field.key}
                      className={[
                        'mapper__row',
                        field.required ? 'mapper__row--required' : '',
                        unmappedRequired ? 'mapper__row--unmapped-required' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <label className="mapper__label" htmlFor={`map-${field.key}`}>
                        <span>
                          {field.label}
                          {field.required && ' *'}
                        </span>
                        {field.hint && <span className="mapper__hint">{field.hint}</span>}
                      </label>

                      <select
                        id={`map-${field.key}`}
                        className="select"
                        value={value}
                        onChange={(e) => setField(field.key, e.target.value)}
                      >
                        <option value="">Not mapped</option>
                        {sheet.headers.map((header) => (
                          <option key={header} value={header}>
                            {header}
                          </option>
                        ))}
                      </select>

                      <div className="mapper__preview" title={previews.get(value) || ''}>
                        {value
                          ? previews.get(value) || 'No values in this column'
                          : unmappedRequired
                            ? 'Required for the map and dashboard'
                            : ' '}
                      </div>

                      {duplicated && (
                        <div className="mapper__preview" style={{ color: 'var(--warn-ink)' }}>
                          Also used by another field
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}

        {unusedHeaders.length > 0 && (
          <div className="card">
            <div className="card__header">
              <div>
                <div className="card__title">Columns not mapped to a field ({unusedHeaders.length})</div>
                <div className="card__subtitle">
                  These stay attached to their row and travel with the export. Map any of them above
                  if you want them in the popup, the filters or the charts.
                </div>
              </div>
            </div>
            <div className="card__body">
              <div className="chiprow">
                {unusedHeaders.map((header) => (
                  <span key={header} className="tag" title={previews.get(header) || ''}>
                    {header}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
