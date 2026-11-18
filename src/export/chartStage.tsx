import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { ChartFromSpec, type ChartTheme } from '../components/charts/ChartKit'
import type { ChartId, ChartSpec } from '../lib/dashboardModel'

/**
 * Draw charts off screen at exact sizes and hand back their SVG.
 *
 * The PDF report takes the very charts the dashboard draws, through the same components, and
 * converts their SVG to vector PDF. Drawing them again here, rather than copying the ones on
 * screen, is what lets the report be drawn light on a dark-themed screen, at the size a printed
 * page wants, and from the map tab when the dashboard is not mounted at all.
 */

export interface StageRequest {
  spec: ChartSpec
  /** Size in pixels. */
  width: number
  height: number
}

export interface Stage {
  svgOf: (id: ChartId) => SVGSVGElement
  dispose: () => void
}

const READY_TIMEOUT_MS = 5000
const POLL_MS = 40

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

export async function stageCharts(requests: StageRequest[], theme: ChartTheme): Promise<Stage> {
  // Tick spacing is decided from measured label widths, so measure with the face that prints.
  try {
    await Promise.all([document.fonts.load("11px 'Barlow Condensed'"), document.fonts.load("12px 'Barlow Condensed'")])
  } catch {
    // Font loading is a refinement here; the fallback face still produces a correct chart.
  }

  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none;background:#ffffff'
  document.body.appendChild(host)
  const root = createRoot(host)

  const dispose = () => {
    root.unmount()
    host.remove()
  }

  try {
    flushSync(() => {
      root.render(
        <div>
          {requests.map(({ spec, width, height }) => (
            <div key={spec.id} data-export-chart={spec.id} style={{ width, height }}>
              <ChartFromSpec spec={spec} theme={theme} size={{ width, height }} />
            </div>
          ))}
        </div>,
      )
    })

    // Recharts lays a chart out over a few renders. Wait until every chart has drawn its axis
    // ticks, which come last, then one more beat for anything queued behind them. Timers rather
    // than animation frames, because a hidden browser tab stops animation frames entirely.
    const ready = () =>
      requests.every(({ spec }) =>
        host.querySelector(`[data-export-chart="${spec.id}"] svg.recharts-surface .recharts-cartesian-axis-tick`),
      )
    const started = Date.now()
    while (!ready() && Date.now() - started < READY_TIMEOUT_MS) await wait(POLL_MS)
    await wait(POLL_MS)

    const svgs = new Map<ChartId, SVGSVGElement>()
    for (const { spec } of requests) {
      const svg = host.querySelector<SVGSVGElement>(`[data-export-chart="${spec.id}"] svg.recharts-surface`)
      if (!svg) throw new Error(`The "${spec.title}" chart did not draw, so the export stopped.`)
      svgs.set(spec.id, svg)
    }

    return {
      svgOf: (id) => {
        const svg = svgs.get(id)
        if (!svg) throw new Error(`No chart was staged for ${id}.`)
        return svg
      },
      dispose,
    }
  } catch (err) {
    dispose()
    throw err
  }
}
