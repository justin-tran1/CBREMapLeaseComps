/**
 * Colour roles for charts and map marks.
 *
 * Chrome uses the CBRE brand palette. Data marks use a categorical set that has been run
 * through the accessibility gates (lightness band, chroma floor, colour-vision separation,
 * contrast) against this app's own light `#ffffff` and dark `#132420` chart surfaces, in
 * fixed slot order. Both modes are separately stepped rather than flipped.
 *
 * Most charts here are single-series and use the brand green, because colour carries no
 * information when every bar is the same measure. The categorical slots are only for the
 * stacked chart, where colour genuinely encodes identity.
 */

export const CBRE = {
  green: '#003f2d',
  accentGreen: '#17e88f',
  darkGreen: '#012a2d',
  darkGrey: '#435254',
  lightGrey: '#cad1d3',
  midnight: '#032842',
  celadon: '#80bbad',
  sage: '#538184',
  wheat: '#dbd99a',
  cement: '#7f8480',
} as const

/** Validated categorical slots, assigned in this order and never cycled. */
export const CATEGORICAL_LIGHT = [
  '#2a78d6', // blue
  '#eb6834', // orange
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#e87ba4', // magenta
  '#4a3aa7', // violet
] as const

export const CATEGORICAL_DARK = [
  '#3987e5',
  '#d95926',
  '#199e70',
  '#c98500',
  '#d55181',
  '#9085e9',
] as const

/** Single-series mark colour, one per theme. */
export const SERIES_LIGHT = '#0d6b4f'
export const SERIES_DARK = '#2fbc8d'

export function categoricalPalette(dark: boolean): readonly string[] {
  return dark ? CATEGORICAL_DARK : CATEGORICAL_LIGHT
}

export function seriesColor(dark: boolean): string {
  return dark ? SERIES_DARK : SERIES_LIGHT
}

/** Fold anything past the last slot into a neutral "Other". */
export const OTHER_LABEL = 'Other'
export const OTHER_COLOR_LIGHT = '#8a8f8c'
export const OTHER_COLOR_DARK = '#6f7a76'

export function colorForIndex(index: number, dark: boolean): string {
  const palette = categoricalPalette(dark)
  if (index < 0 || index >= palette.length) return dark ? OTHER_COLOR_DARK : OTHER_COLOR_LIGHT
  return palette[index]
}

/** Marker fill for the map, keyed to how many deals sit at a location. */
export function markerColor(dealCount: number): string {
  if (dealCount >= 10) return '#012a2d'
  if (dealCount >= 4) return '#00543c'
  return '#00704f'
}
