import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useApp } from '../state/AppContext'
import { dealsToCsv, downloadCsv, timestampedName } from '../lib/exportCsv'
import { IconChart, IconDownload, IconMap, IconMoon, IconSettings, IconSun, IconTable, IconUpload } from './Icons'
import wordmark from '../assets/cbre-wordmark-white.png'

/**
 * The top bar's download button: the filtered rows as CSV, as before, or the dashboard as a
 * PDF report or PowerPoint deck through the export dialog.
 */
function DownloadMenu() {
  const { filtered, setExportOpen } = useApp()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const rows = filtered.length

  useEffect(() => {
    if (!open) return
    wrapRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus()
    const onPointerDown = (event: globalThis.MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // Arrow keys move between the items, as in any menu.
  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Tab'].includes(event.key)) return
    if (event.key === 'Tab') {
      setOpen(false)
      return
    }
    event.preventDefault()
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'))
    if (items.length === 0) return
    const index = items.indexOf(document.activeElement as HTMLElement)
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : event.key === 'ArrowDown'
            ? (index + 1) % items.length
            : (index - 1 + items.length) % items.length
    items[next].focus()
  }

  const downloadRows = () => {
    setOpen(false)
    if (rows === 0) return
    downloadCsv(timestampedName('cbre-hcls-lease-comps'), dealsToCsv(filtered))
  }

  const openExport = () => {
    // The item is about to unmount with the menu, so the dialog would have nowhere to hand
    // focus back to. The menu button takes it first and gets it back when the dialog closes.
    buttonRef.current?.focus()
    setOpen(false)
    setExportOpen(true)
  }

  return (
    <div className="dlmenu" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="icon-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        title="Download the filtered rows or the dashboard"
        aria-label="Download"
      >
        <IconDownload size={15} />
      </button>

      {open && (
        <div className="dlmenu__panel" role="menu" id={menuId} aria-label="Download" onKeyDown={onMenuKeyDown}>
          <button type="button" role="menuitem" className="dlmenu__item" onClick={downloadRows} disabled={rows === 0}>
            <IconTable size={16} />
            <span className="grow">
              Deal rows (CSV)
              <span className="dlmenu__sub">
                {rows === 0 ? 'No rows pass the filters' : `The ${rows.toLocaleString('en-US')} ${rows === 1 ? 'row' : 'rows'} passing the filters`}
              </span>
            </span>
          </button>
          <button type="button" role="menuitem" className="dlmenu__item" onClick={openExport}>
            <IconChart size={16} />
            <span className="grow">
              Dashboard report…
              <span className="dlmenu__sub">PDF or PowerPoint, with the parts you choose</span>
            </span>
          </button>
        </div>
      )}
    </div>
  )
}

export function TopBar() {
  const { phase, tab, setTab, theme, setTheme, fileName, deals, reset, reopenMapping } = useApp()

  return (
    <header className="topbar">
      {/*
        The official wordmark carries the brand, so the practice name no longer repeats
        "CBRE". White artwork on the green header, as the brand guide requires, with clear
        space of the wordmark's own height on every side.
      */}
      <div className="topbar__brand">
        <img className="topbar__wordmark" src={wordmark} alt="CBRE" width={80} height={20} />
        <span className="topbar__rule" aria-hidden="true" />
        <span className="topbar__title">
          Healthcare &amp; Life Sciences
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
            <DownloadMenu />
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
