import { useEffect, useRef, useState } from 'react'
import { BASEMAPS, getBasemap } from '../lib/basemaps'
import { IconCheck, IconLayers } from './Icons'
import type { BasemapId } from '../types'

interface BasemapSwitcherProps {
  value: BasemapId
  onChange: (id: BasemapId) => void
}

export function BasemapSwitcher({ value, onChange }: BasemapSwitcherProps) {
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
        <div className="basemap__panel" role="radiogroup" aria-label="Basemap">
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
      )}
    </div>
  )
}
