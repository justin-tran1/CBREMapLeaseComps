import { setWorkerUrl } from 'maplibre-gl'
import InlineMapLibreWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&inline'

/**
 * Give MapLibre a worker it can actually start.
 *
 * MapLibre resolves its own worker with `new URL('./maplibre-gl-worker.mjs', import.meta.url)`.
 * No bundler emits a file at that path, so the worker never starts, and because every
 * vector and GeoJSON layer is parsed in that worker, the 3D buildings and the drawn filter
 * shape render as nothing at all. The map looks alive because raster imagery and DOM
 * markers do not need the worker, which makes the failure easy to miss.
 *
 * Vite will bundle the worker for us, but it hands back a constructor while MapLibre wants
 * a URL. The worker is inlined rather than emitted as a sibling file because the standalone
 * build runs from `file://`, where browsers refuse to start a worker from a separate script.
 *
 * To read the URL out of Vite's wrapper, `Worker` is swapped for a stub for exactly one
 * construction. The stub records the URL and starts nothing, which also keeps Vite's
 * wrapper from revoking the blob the way it does once a real worker is running.
 *
 * The `#.cjs` suffix is not cosmetic. MapLibre decides between a module worker and a
 * classic one by testing whether the worker URL ends in `.cjs`, and a blob module worker
 * is rejected outright on a file:// page while a blob classic worker runs fine. The
 * fragment is stripped before the blob is looked up, so it changes nothing but that
 * decision. Vite is configured to emit the worker as a classic script to match.
 */
export function installMapLibreWorker(): boolean {
  if (typeof window === 'undefined' || typeof window.Worker !== 'function') return false

  const NativeWorker = window.Worker
  let capturedUrl = ''

  class CapturingWorker {
    constructor(url: string | URL) {
      if (!capturedUrl) capturedUrl = String(url)
    }
    addEventListener(): void {}
    removeEventListener(): void {}
    postMessage(): void {}
    terminate(): void {}
  }

  try {
    window.Worker = CapturingWorker as unknown as typeof Worker
    new InlineMapLibreWorker()
  } catch {
    // Fall through: an empty capturedUrl leaves MapLibre on its own resolution.
  } finally {
    window.Worker = NativeWorker
  }

  if (!capturedUrl) return false
  setWorkerUrl(`${capturedUrl}#.cjs`)
  return true
}
