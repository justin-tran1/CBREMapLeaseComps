import { useEffect, useRef, useState } from 'react'
import { useApp } from '../state/AppContext'
import { looksLikeGoogleKey } from '../lib/googleMaps'
import { IconAlert, IconCheck, IconGlobe, IconX } from './Icons'

/**
 * Google Maps Platform key entry and the map engine choice.
 *
 * Everything Google needs a key and this tool has no server to keep one in, so the key is
 * pasted here and held in this browser only. Two things switch on with it: rooftop-accurate
 * geocoding, which is what lets a comp name its building at all, and the photorealistic 3D
 * engine. Without a key the application is complete and unchanged.
 */
export function GoogleSettings() {
  const { googleKey, setGoogleKey, mapEngine, setMapEngine, buildingGradeCount, sites } = useApp()

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [reveal, setReveal] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setDraft(googleKey)
    setReveal(false)

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
  }, [open, googleKey])

  const connected = googleKey !== ''
  const draftValid = looksLikeGoogleKey(draft)
  const unmatched = sites.length - buildingGradeCount

  return (
    <div className="gpanel floatcard" ref={wrapRef}>
      <button
        type="button"
        className="maptool"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="Connect a Google Maps Platform key for rooftop geocoding and the photorealistic 3D engine"
        style={{ padding: '8px 11px' }}
      >
        <IconGlobe size={15} />
        {connected ? 'Google connected' : 'Google'}
      </button>

      {open && (
        <div className="basemap__panel gsettings" role="group" aria-label="Google Maps Platform">
          <div className="gsettings__title">Google Maps Platform</div>

          <label className="gsettings__label" htmlFor="google-api-key">
            API key
          </label>
          <div className="range-row">
            <input
              id="google-api-key"
              className="input grow"
              type={reveal ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              placeholder="Paste a key to enable Google"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setReveal((v) => !v)}
              aria-label={reveal ? 'Hide the key' : 'Show the key'}
            >
              {reveal ? 'Hide' : 'Show'}
            </button>
          </div>

          {draft.trim() !== '' && !draftValid && (
            <span className="range-hint" style={{ color: 'var(--warn-ink)' }}>
              That does not look like a key. Paste the key itself, not a URL or a quoted value.
            </span>
          )}

          <div className="chiprow">
            <button
              type="button"
              className="btn btn--sm btn--primary"
              disabled={!draftValid || draft.trim() === googleKey}
              onClick={() => setGoogleKey(draft)}
            >
              <IconCheck size={12} />
              Save key
            </button>
            {connected && (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  setGoogleKey('')
                  setDraft('')
                }}
              >
                <IconX size={12} />
                Remove
              </button>
            )}
          </div>

          <span className="range-hint">
            Held in this browser's local storage. It is never written into the file, the build, or
            the repository, and it goes nowhere except Google.
          </span>

          <div className="gsettings__sep" />

          <div className="gsettings__title">Map engine</div>
          <div role="radiogroup" aria-label="Map engine">
            <button
              type="button"
              role="radio"
              aria-checked={mapEngine === 'maplibre'}
              className="basemap__option"
              onClick={() => setMapEngine('maplibre')}
            >
              <span className="grow">
                MapLibre with OpenStreetMap
                <span className="basemap__sub">
                  Key-less and free. Seven basemaps, the draw tools, extruded footprints.
                </span>
              </span>
              {mapEngine === 'maplibre' && <IconCheck size={14} />}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={mapEngine === 'google3d'}
              className="basemap__option"
              disabled={!connected}
              onClick={() => setMapEngine('google3d')}
              title={connected ? undefined : 'Needs a Google Maps Platform key'}
            >
              <span className="grow">
                Photorealistic 3D (Google)
                <span className="basemap__sub">
                  {connected
                    ? 'Google 3D tiles. Clicking a place matches its place id exactly. No draw tools.'
                    : 'Needs a key. Enterprise SKU: 1,000 free map loads a month, then billed.'}
                </span>
              </span>
              {mapEngine === 'google3d' && <IconCheck size={14} />}
            </button>
          </div>

          <div className="gsettings__sep" />

          <div className="gsettings__title">Why this matters</div>
          {sites.length === 0 ? (
            <span className="range-hint">Upload a comp set to see how precisely it is located.</span>
          ) : unmatched === 0 ? (
            <span className="range-hint" style={{ color: 'var(--good)' }}>
              <IconCheck size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
              All {sites.length.toLocaleString('en-US')} locations are precise enough to name their
              building.
            </span>
          ) : (
            <span className="range-hint">
              <IconAlert size={11} style={{ verticalAlign: -1, marginRight: 4, color: 'var(--warn)' }} />
              {buildingGradeCount.toLocaleString('en-US')} of {sites.length.toLocaleString('en-US')}{' '}
              locations are precise enough to name a building. The other{' '}
              {unmatched.toLocaleString('en-US')} came back as a street interpolation, which lands in
              the roadway, so they stay on their pins rather than risk coloring in a neighbor.
              Google geocoding returns rooftop coordinates and would resolve most of them.
            </span>
          )}
        </div>
      )}
    </div>
  )
}
