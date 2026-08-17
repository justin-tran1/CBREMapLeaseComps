import { useApp } from '../state/AppContext'
import { availableProviders } from '../lib/geocode'
import { IconAlert, IconCheck, IconTrash, IconX } from './Icons'

export function GeocodeBar() {
  const {
    deals,
    geocode,
    geocodeProvider,
    setGeocodeProvider,
    startGeocoding,
    cancelGeocoding,
    unlocatedCount,
    geocodeCacheSize,
    purgeGeocodeCache,
    googleKey,
  } = useApp()

  if (deals.length === 0) return null

  const located = deals.length - unlocatedCount
  const pct = geocode.total === 0 ? 0 : Math.round((geocode.done / geocode.total) * 100)

  if (geocode.running) {
    return (
      <div className="geobar" role="status" aria-live="polite">
        <span className="spinner" />
        <span className="geobar__text">
          Locating addresses · {geocode.done.toLocaleString('en-US')} of{' '}
          {geocode.total.toLocaleString('en-US')}
          {geocode.failed > 0 && ` · ${geocode.failed.toLocaleString('en-US')} not matched`}
        </span>
        <span className="geobar__track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <span className="geobar__fill" style={{ width: `${pct}%` }} />
        </span>
        <span className="geobar__addr" title={geocode.currentAddress}>
          {geocode.currentAddress}
        </span>
        <button type="button" className="btn btn--sm" onClick={cancelGeocoding}>
          <IconX size={12} />
          Stop
        </button>
      </div>
    )
  }

  if (unlocatedCount === 0) {
    return (
      <div className="geobar">
        <IconCheck size={14} style={{ color: 'var(--good)' }} />
        <span className="geobar__text">
          All {deals.length.toLocaleString('en-US')} rows are on the map.
        </span>
        <span className="grow" />
        {geocodeCacheSize > 0 && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={purgeGeocodeCache}
            title="Forget the saved coordinates in this browser and look addresses up again next time"
          >
            <IconTrash size={12} />
            Clear {geocodeCacheSize.toLocaleString('en-US')} cached
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="geobar">
      <IconAlert size={14} style={{ color: 'var(--warn)' }} />
      <span className="geobar__text">
        {located.toLocaleString('en-US')} of {deals.length.toLocaleString('en-US')} rows are on the
        map. {unlocatedCount.toLocaleString('en-US')} still {unlocatedCount === 1 ? 'needs' : 'need'} a
        location.
      </span>

      <label className="row small muted" style={{ gap: 6 }}>
        Geocoder
        <select
          className="select"
          style={{ width: 'auto' }}
          value={geocodeProvider}
          onChange={(e) => setGeocodeProvider(e.target.value as typeof geocodeProvider)}
          aria-label="Geocoding service"
        >
          {availableProviders(googleKey !== '').map((provider) => (
            <option key={provider.id} value={provider.id} title={provider.description}>
              {provider.label}
            </option>
          ))}
        </select>
      </label>

      <button type="button" className="btn btn--sm btn--primary" onClick={() => startGeocoding(true)}>
        Locate addresses
      </button>

      <span className="grow" />

      {geocode.failed > 0 && (
        <span className="geobar__text" style={{ color: 'var(--warn-ink)' }}>
          {geocode.failed.toLocaleString('en-US')} address
          {geocode.failed === 1 ? '' : 'es'} could not be matched. Add a Latitude and Longitude
          column for those rows, or correct the address and re-upload.
        </span>
      )}
    </div>
  )
}
