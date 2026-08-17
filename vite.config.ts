import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `standalone` mode emits one self-contained HTML file that runs by double-clicking it.
// The default build emits a normal static bundle for hosting on an intranet server.
export default defineConfig(({ mode }) => {
  const standalone = mode === 'standalone'

  return {
    base: './',
    plugins: [react(), ...(standalone ? [viteSingleFile()] : [])],
    // MapLibre's worker is inlined as a classic script rather than a module. Browsers
    // refuse to start a blob module worker from a file:// page, which is exactly how the
    // standalone build is opened. See src/lib/maplibreWorker.ts.
    worker: { format: 'iife' },
    build: {
      outDir: standalone ? 'standalone' : 'dist',
      emptyOutDir: true,
      // Inline Leaflet's sprite assets so the standalone file has zero external requests.
      assetsInlineLimit: standalone ? 100 * 1024 * 1024 : 4096,
      chunkSizeWarningLimit: 4000,
    },
    server: {
      port: 5173,
      open: true,
    },
  }
})
