import barlowRegularUrl from '../assets/fonts/BarlowCondensed-Regular.ttf?url'
import barlowSemiBoldUrl from '../assets/fonts/BarlowCondensed-SemiBold.ttf?url'
import wordmarkGreenUrl from '../assets/cbre-wordmark-green.png?url'
import wordmarkWhiteUrl from '../assets/cbre-wordmark-white.png?url'

/**
 * The files an export embeds: the brand's condensed figure face and the official wordmarks.
 *
 * They are fetched only when someone exports. In the single-file build every one of these URLs
 * is already a data URI inside the page, so an export works offline from a file on a desktop.
 */

/** The wordmark artwork's own proportions, 338 by 85. */
export const WORDMARK_RATIO = 338 / 85

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not load ${url.slice(0, 60)} (${response.status})`)
  return new Uint8Array(await response.arrayBuffer())
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(binary)
}

export interface ExportAssets {
  barlowRegular: string
  barlowSemiBold: string
  /** data:image/png;base64,... */
  wordmarkGreen: string
  wordmarkWhite: string
}

let cached: Promise<ExportAssets> | null = null

export function loadExportAssets(): Promise<ExportAssets> {
  cached ??= Promise.all([barlowRegularUrl, barlowSemiBoldUrl, wordmarkGreenUrl, wordmarkWhiteUrl].map(fetchBytes))
    .then(([regular, semiBold, green, white]) => ({
      barlowRegular: toBase64(regular),
      barlowSemiBold: toBase64(semiBold),
      wordmarkGreen: `data:image/png;base64,${toBase64(green)}`,
      wordmarkWhite: `data:image/png;base64,${toBase64(white)}`,
    }))
    .catch((err: unknown) => {
      // A failed load is not cached, so the next attempt tries again.
      cached = null
      throw err
    })
  return cached
}
