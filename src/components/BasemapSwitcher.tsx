import { useEffect, useRef, useState } from 'react'
import { BASEMAPS, BOUNDARY_MIN_ZOOM, getBasemap, type BoundaryKind } from '../lib/basemaps'
import { IconCheck, IconLayers } from './Icons'
import type { BasemapId } from '../types'

/** The administrative outlines, in the order they appear in the panel. */
const BOUNDARY_OPTIONS: Array<{ kind: BoundaryKind; label: string; note: string }> = [
  {
    kind: 'city',
    label: 'City limits',
    note: `Incorporated place boundaries, from zoom ${BOUNDARY_MIN_ZOOM.city}`,
  },
  {
    kind: 'county',
    label: 'County lines',
    note: `County boundaries, from zoom ${BOUNDARY_MIN_ZOOM.county}`,
  },
]

interface BasemapSwitcherProps {
  value: BasemapId
  onChange: (id: BasemapId) => void
  boundaries: Record<BoundaryKind, boolean>
  onBoundaryChange: (kind: BoundaryKind, on: boolean) => void
}

export function BasemapSwitcher({
  value,
  onChange,
  boundaries,
  onBoundaryChange,
}: BasemapSwitcherProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const current = getBasemap(value)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="basemap floatcard" ref={wrapRef}>
      <button
        type="button"
        className="maptool"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="Change the basemap"
        style={{ padding: '8px 11px' }}
      >
        <IconLayers size={15} />
        {current.label}
      </button>

      {open && (
        <div className="basemap__panel">
          <div role="radiogroup" aria-label="Basemap">
          {BASEMAPS.map((map) => (
            <button
              key={map.id}
              type="button"
              role="radio"
              aria-checked={map.id === value}
              className="basemap__option"
              onClick={() => {
                onChange(map.id)
                setOpen(false)
              }}
            >
              <span className="basemap__swatch" style={{ background: map.swatch }} />
              <span className="grow">
                {map.label}
                <span className="basemap__sub">{map.description}</span>
              </span>
              {map.id === value && <IconCheck size={14} />}
            </button>
          ))}
          </div>

          {/*
            Overlays, not basemaps: both can be on at once and neither replaces the imagery, so
            they are checkboxes under their own heading rather than more radios. Ticking one
            leaves the panel open, because comparing the two means ticking both.
          */}
          <div className="basemap__overlays" role="group" aria-label="Boundaries">
            <div className="basemap__heading">Boundaries</div>
            {BOUNDARY_OPTIONS.map((option) => (
              <label key={option.kind} className="basemap__toggle">
                <input
                  type="checkbox"
                  checked={boundaries[option.kind]}
                  onChange={(e) => onBoundaryChange(option.kind, e.target.checked)}
                />
                <span className="grow">
                  {option.label}
                  <span className="basemap__sub">{option.note}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
