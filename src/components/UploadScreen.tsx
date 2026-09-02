import { useCallback, useRef, useState, type DragEvent } from 'react'
import { useApp } from '../state/AppContext'
import { FIELDS, FIELD_GROUPS } from '../lib/fields'
import { ACCEPTED_EXTENSIONS } from '../lib/parse'
import { downloadCsv } from '../lib/exportCsv'
import { sampleFile } from '../lib/sampleData'
import { IconAlert, IconDownload, IconInfo, IconUpload } from './Icons'

const TEMPLATE_EXAMPLE: Record<string, string> = {
  propertyName: 'Alexandria Center at Kendall',
  address: '500 Kendall St',
  city: 'Cambridge',
  state: 'MA',
  zip: '02142',
  county: 'Middlesex',
  market: 'Boston',
  submarket: 'East Cambridge',
  district: 'Kendall Square',
  latitude: '42.36560',
  longitude: '-71.08600',
  propertyType: 'Life Sciences',
  propertySubtype: 'Lab / R&D',
  buildingClass: 'A',
  yearBuilt: '2019',
  leaseDate: '03/01/2025',
  executionDate: '01/16/2025',
  expirationDate: '02/28/2030',
  termMonths: '60',
  leaseType: 'Full Service Gross',
  rateType: 'Annual $/SF',
  transactionType: 'New Lease',
  suite: '910',
  floor: '9',
  areaLeased: '38,900',
  officeArea: '',
  baseRent: '$96.50',
  effectiveRent: '$78.20',
  opex: '$28.75',
  escalation: '',
  escalationType: 'Fixed %',
  escalationPercent: '3.0%',
  escalationValue: '0.00',
  escalationComments: '3% in years 1 through 5, then CPI with a 2% floor.',
  freeRent: '6',
  tiAllowance: '$165.00',
  tiAsIs: 'No',
  tiNotes: 'Allowance drawn on completion of the lab fit-out.',
  otherConcessions: 'Early access 60 days before commencement, rent free.',
  lessor: 'Alexandria Real Estate',
  sublessor: '',
  lessee: 'Vertex Therapeutics',
  lessorBroker: 'Amy Nguyen',
  lessorBrokerFirm: 'CBRE',
  lesseeBroker: 'Chris Boyle',
  lesseeBrokerFirm: 'JLL',
  brokers: 'Amy Nguyen; Chris Boyle',
  naicsCode: '541714',
  notes: 'One five-year renewal option at 95% of fair market rent.',
  compId: 'CMP-480117',
  confidentiality: 'No',
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
                next screen, and columns it does not recognize are kept with the row.
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
