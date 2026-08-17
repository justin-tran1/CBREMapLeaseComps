import { useCallback, useRef, useState, type DragEvent } from 'react'
import { useApp } from '../state/AppContext'
import { FIELDS, FIELD_GROUPS } from '../lib/fields'
import { ACCEPTED_EXTENSIONS } from '../lib/parse'
import { downloadCsv } from '../lib/exportCsv'
import { sampleFile } from '../lib/sampleData'
import { IconAlert, IconDownload, IconInfo, IconUpload } from './Icons'

const TEMPLATE_EXAMPLE: Record<string, string> = {
  propertyName: 'City National Plaza',
  address: '515 S Flower St',
  city: 'Los Angeles',
  state: 'CA',
  zip: '90071',
  county: 'Los Angeles',
  market: 'Greater Los Angeles',
  submarket: 'Downtown LA',
  latitude: '34.05130',
  longitude: '-118.25650',
  propertyType: 'Office',
  propertySubtype: 'CBD Office',
  buildingClass: 'A',
  yearBuilt: '1971',
  leaseDate: '03/01/2025',
  executionDate: '01/16/2025',
  expirationDate: '02/28/2030',
  termMonths: '60',
  leaseType: 'Full Service Gross',
  rateType: 'Annual $/SF',
  transactionType: 'New Lease',
  suite: '2200',
  floor: '22',
  areaLeased: '12,400',
  baseRent: '$46.80',
  effectiveRent: '$41.10',
  opex: '$18.25',
  escalation: '3.0% annually',
  escalationType: 'Fixed %',
  escalationRate: '3.0%',
  freeRent: '4',
  tiAllowance: '$75.00',
  lessor: 'Brookfield Properties',
  lessee: 'Meridian Legal',
  lessorBroker: 'Amy Nguyen',
  lesseeBroker: 'Chris Boyle',
  brokers: 'Amy Nguyen; Chris Boyle',
  notes: 'One five-year renewal option at 95% of fair market rent.',
}

function downloadTemplate(): void {
  const headers = FIELDS.map((f) => f.label)
  const example = FIELDS.map((f) => TEMPLATE_EXAMPLE[f.key] ?? '')
  const row = (cells: string[]) =>
    cells.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')
  downloadCsv('cbre-hcls-lease-comp-template.csv', `${row(headers)}\r\n${row(example)}`)
}

export function UploadScreen() {
  const { loadFile, parseError, loadingFile } = useApp()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)

  const accept = ACCEPTED_EXTENSIONS.join(',')

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0]
      if (file) void loadFile(file)
    },
    [loadFile],
  )

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    handleFiles(event.dataTransfer?.files ?? null)
  }

  return (
    <div className="upload">
      <div className="upload__inner">
        <div className="upload__hero">
          <h1>Map a healthcare and life sciences comp set</h1>
          <p>
            Upload a spreadsheet of lease comparables. Every address is plotted on a 3D map you
            can click through building by building, and the same rows feed a dashboard with the
            filters your analysis needs. Medical office, lab, GMP manufacturing and outpatient
            deals all read the same way. Files stay in this browser and never upload anywhere.
          </p>
        </div>

        {parseError && (
          <div className="alert alert--error" role="alert">
            <IconAlert className="alert__icon" size={16} />
            <span>{parseError}</span>
          </div>
        )}

        <div
          className={`dropzone${dragging ? ' dropzone--active' : ''}`}
          onDragEnter={(e) => {
            e.preventDefault()
            dragDepth.current += 1
            setDragging(true)
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => {
            e.preventDefault()
            dragDepth.current -= 1
            if (dragDepth.current <= 0) {
              dragDepth.current = 0
              setDragging(false)
            }
          }}
          onDrop={onDrop}
        >
          <IconUpload size={30} className="muted" />
          <div className="dropzone__title">
            {loadingFile ? 'Reading your file…' : 'Drop a spreadsheet here'}
          </div>
          <div className="dropzone__hint">
            Excel (.xlsx, .xlsm, .xlsb, .xls) or delimited text (.csv, .tsv). The header row is
            detected automatically, even when the export has a title block above it.
          </div>

          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="sr-only"
            onChange={(e) => {
              handleFiles(e.target.files)
              e.target.value = ''
            }}
          />

          <div className="row" style={{ justifyContent: 'center', marginTop: 4 }}>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => inputRef.current?.click()}
              disabled={loadingFile}
            >
              {loadingFile ? <span className="spinner" /> : <IconUpload size={14} />}
              Choose file
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void loadFile(sampleFile())}
              disabled={loadingFile}
            >
              Load sample data
            </button>
            <button type="button" className="btn btn--ghost" onClick={downloadTemplate}>
              <IconDownload size={14} />
              Template
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card__header">
            <div>
              <div className="card__title">Columns the tool looks for</div>
              <div className="card__subtitle">
                Headers are matched automatically. Anything it gets wrong is a dropdown away on the
                next screen, and columns it does not recognise are kept with the row.
              </div>
            </div>
          </div>
          <div className="card__body stack">
            {FIELD_GROUPS.map((group) => {
              const fields = FIELDS.filter((f) => f.group === group)
              if (fields.length === 0) return null
              return (
                <div key={group} className="row" style={{ alignItems: 'baseline', gap: 10 }}>
                  <div
                    className="field__label"
                    style={{ flex: '0 0 116px', textAlign: 'right', paddingTop: 2 }}
                  >
                    {group}
                  </div>
                  <div className="chiprow grow">
                    {fields.map((f) => (
                      <span key={f.key} className={`tag${f.required ? ' tag--required' : ''}`}>
                        {f.label}
                        {f.required && ' *'}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="alert alert--info">
          <IconInfo className="alert__icon" size={16} />
          <span>
            Rows that already carry latitude and longitude are plotted straight away. Everything
            else is geocoded from the street address, city, state and ZIP, and results are cached in
            this browser so the same addresses never need looking up twice.
          </span>
        </div>
      </div>
    </div>
  )
}
