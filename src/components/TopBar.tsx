import { useApp } from '../state/AppContext'
import { dealsToCsv, downloadCsv, timestampedName } from '../lib/exportCsv'
import { CbreLogo, IconChart, IconDownload, IconMap, IconMoon, IconSettings, IconSun, IconUpload } from './Icons'

export function TopBar() {
  const { phase, tab, setTab, theme, setTheme, fileName, deals, filtered, reset, reopenMapping } = useApp()

  const exportVisible = () => {
    if (filtered.length === 0) return
    downloadCsv(timestampedName('cbre-hcls-lease-comps'), dealsToCsv(filtered))
  }

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <CbreLogo />
        <span className="topbar__title">
          CBRE Healthcare &amp; Life Sciences
          <span className="topbar__subtitle">Market Data</span>
        </span>
      </div>

      {phase === 'ready' && (
        <div className="tabs" role="tablist" aria-label="Views">
          <button
            type="button"
            role="tab"
            className="tabs__btn"
            aria-selected={tab === 'map'}
            onClick={() => setTab('map')}
          >
            <IconMap size={15} />
            Map
          </button>
          <button
            type="button"
            role="tab"
            className="tabs__btn"
            aria-selected={tab === 'dashboard'}
            onClick={() => setTab('dashboard')}
          >
            <IconChart size={15} />
            Dashboard
          </button>
        </div>
      )}

      <div className="topbar__spacer" />

      {fileName && (
        <span className="topbar__file" title={fileName}>
          {fileName}
          {deals.length > 0 && ` · ${deals.length.toLocaleString('en-US')} rows`}
        </span>
      )}

      <div className="topbar__actions">
        {phase === 'ready' && (
          <>
            <button
              type="button"
              className="icon-btn"
              onClick={exportVisible}
              title="Download the rows currently passing the filters as CSV"
              aria-label="Download filtered rows as CSV"
            >
              <IconDownload size={15} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={reopenMapping}
              title="Change which spreadsheet column feeds each field"
              aria-label="Edit column mapping"
            >
              <IconSettings size={15} />
            </button>
          </>
        )}

        {phase !== 'upload' && (
          <button
            type="button"
            className="icon-btn"
            onClick={reset}
            title="Upload a different spreadsheet"
            aria-label="Upload a different spreadsheet"
          >
            <IconUpload size={15} />
          </button>
        )}

        <button
          type="button"
          className="icon-btn"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {theme === 'dark' ? <IconSun size={15} /> : <IconMoon size={15} />}
        </button>
      </div>
    </header>
  )
}
