import { useState } from 'react'
import { AppProvider, useApp } from './state/AppContext'
import { ColumnMapper } from './components/ColumnMapper'
import { DashboardTab } from './components/DashboardTab'
import { ErrorBoundary } from './components/ErrorBoundary'
import { FilterRail } from './components/FilterRail'
import { GeocodeBar } from './components/GeocodeBar'
import { GoogleMap3D } from './components/GoogleMap3D'
import { MapTab } from './components/MapTab'
import { TopBar } from './components/TopBar'
import { UploadScreen } from './components/UploadScreen'

function Shell() {
  const { phase, tab, mapEngine } = useApp()
  const [railOpen, setRailOpen] = useState(true)
  const google3d = mapEngine === 'google3d'

  return (
    <div className="app">
      <TopBar />
      {phase === 'ready' && <GeocodeBar />}

      <div className="main">
        {phase === 'upload' && <UploadScreen />}
        {phase === 'mapping' && <ColumnMapper />}

        {phase === 'ready' && (
          <>
            <FilterRail open={railOpen} onToggle={() => setRailOpen((v) => !v)} />

            {/*
              The map stays mounted while the dashboard is showing so switching tabs keeps
              the pan, zoom and open popup exactly where the user left them. Only one engine
              is ever mounted: two live WebGL maps for one view would be wasteful, and the
              Google one bills per load.
            */}
            <ErrorBoundary>
              {google3d ? (
                <GoogleMap3D
                  hidden={tab !== 'map'}
                  railOpen={railOpen}
                  onOpenRail={() => setRailOpen(true)}
                />
              ) : (
                <MapTab
                  hidden={tab !== 'map'}
                  railOpen={railOpen}
                  onOpenRail={() => setRailOpen(true)}
                />
              )}
            </ErrorBoundary>

            {tab === 'dashboard' && (
              <ErrorBoundary>
                <DashboardTab railOpen={railOpen} onOpenRail={() => setRailOpen(true)} />
              </ErrorBoundary>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <Shell />
      </AppProvider>
    </ErrorBoundary>
  )
}
