import { useEffect, useRef, useState } from 'react'
import { CHART_PALETTES } from '../lib/palette'
import { IconCheck, IconSliders, IconX } from './Icons'
import type { ChartPrefs } from '../lib/chartPrefs'

interface ChartSettingsProps {
  prefs: ChartPrefs
  setPref: <K extends keyof ChartPrefs>(key: K, value: ChartPrefs[K]) => void
  reset: () => void
  isDefault: boolean
  dark: boolean
}

interface ChoiceProps<T extends string> {
  label: string
  value: T
  options: Array<{ id: T; label: string }>
  onChange: (next: T) => void
}

function Choice<T extends string>({ label, value, options, onChange }: ChoiceProps<T>) {
  return (
    <div className="cset__row">
      <span className="cset__label">{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={option.id === value}
            className="segmented__btn"
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Presentation settings for the dashboard charts.
 *
 * Deliberately no control here can change what a chart means. The palettes are fixed and
 * ordered so a series keeps its colour when the set is filtered, every one of them was checked
 * for colour-vision separation rather than picked by eye, and nothing offers a second y-axis, a
 * rainbow ramp, or a legend traded away for colour alone.
 */
export function ChartSettings({ prefs, setPref, reset, isDefault, dark }: ChartSettingsProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

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
    <div className="cset" ref={wrapRef}>
      <button
        type="button"
        className="btn"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="Change the chart palette and style"
      >
        <IconSliders size={14} />
        Chart settings
        {!isDefault && <span className="cset__dot" aria-hidden="true" />}
      </button>

      {open && (
        <div className="cset__panel">
          <div className="cset__head">
            <span className="cset__title">Chart settings</span>
            <button
              type="button"
              className="chip__x"
              onClick={() => setOpen(false)}
              aria-label="Close chart settings"
            >
              <IconX size={12} />
            </button>
          </div>

          <div className="cset__group" role="radiogroup" aria-label="Series palette">
            <span className="cset__label">Series palette</span>
            {CHART_PALETTES.map((palette) => {
              const swatches = dark ? palette.dark : palette.light
              const [cvd, normal] = dark ? palette.measured.dark : palette.measured.light
              return (
                <button
                  key={palette.id}
                  type="button"
                  role="radio"
                  aria-checked={palette.id === prefs.palette}
                  className="cset__palette"
                  onClick={() => setPref('palette', palette.id)}
                >
                  <span className="cset__swatches" aria-hidden="true">
                    {swatches.map((hex) => (
                      <span key={hex} className="cset__swatch" style={{ background: hex }} />
                    ))}
                  </span>
                  <span className="grow">
                    {palette.label}
                    <span className="basemap__sub">{palette.description}</span>
                    <span className="basemap__sub">
                      Closest pair: ΔE {cvd} colour-vision, {normal} normal
                    </span>
                  </span>
                  {palette.id === prefs.palette && <IconCheck size={14} />}
                </button>
              )
            })}
          </div>

          <div className="cset__group">
            <Choice
              label="Bar corners"
              value={prefs.barShape}
              options={[
                { id: 'rounded', label: 'Rounded' },
                { id: 'square', label: 'Square' },
              ]}
              onChange={(v) => setPref('barShape', v)}
            />
            <Choice
              label="Trend"
              value={prefs.trendStyle}
              options={[
                { id: 'line', label: 'Line' },
                { id: 'area', label: 'Filled' },
              ]}
              onChange={(v) => setPref('trendStyle', v)}
            />
            <Choice
              label="Grid lines"
              value={prefs.showGrid ? 'on' : 'off'}
              options={[
                { id: 'on', label: 'On' },
                { id: 'off', label: 'Off' },
              ]}
              onChange={(v) => setPref('showGrid', v === 'on')}
            />
            <Choice
              label="Height"
              value={prefs.density}
              options={[
                { id: 'comfortable', label: 'Comfortable' },
                { id: 'compact', label: 'Compact' },
              ]}
              onChange={(v) => setPref('density', v)}
            />
          </div>

          <div className="cset__foot">
            <span className="range-hint">
              Saved in this browser. Colour never carries meaning on its own here: every
              multi-series chart keeps its legend and its tooltips, and the table below carries
              the same numbers.
            </span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={reset} disabled={isDefault}>
              Reset to default
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
