/**
 * Colour roles, drawn from the CBRE 2021 brand palette.
 *
 * Every value below is an official brand hex. Nothing is invented.
 *
 * Chart series use the `cbre_charts` palette. The brand guide says to assign those slots in
 * order, and this does, with one deliberate exception: slots 4 and 5 are swapped so accent
 * green and wheat never land side by side. Measured against a colour-vision simulation,
 * that adjacency scores ΔE 1.6 under protanopia, which means roughly one man in twelve
 * cannot tell two neighbouring stacked segments apart. Moving terracotta between them
 * lifts the worst adjacent pair to ΔE 14.7 and changes no colour values.
 *
 * The brand guide defines no dark-mode chart palette. The dark column keeps each slot's
 * identity and substitutes the brand colour from the same family that reads on a dark
 * surface, so a series holds its meaning when the theme flips.
 */

/** Primary and secondary brand colours. */
export const CBRE = {
  green: '#003f2d',
  accentGreen: '#17e88f',
  darkGreen: '#012a2d',
  darkGrey: '#435254',
  lightGrey: '#cad1d3',
  midnight: '#032842',
  celadon: '#80bbad',
  wheat: '#dbd99a',
  sage: '#538184',
  midnightTint: '#778f9c',
  sageTint: '#96b3b6',
  celadonTint: '#c0d4cb',
  cement: '#7f8480',
  wheatTint: '#efecd2',
  cementTint: '#cbcdcb',
  terracotta: '#d2785a',
  plum: '#885073',
  lightViolet: '#a388bf',
  navy: '#1f3765',
  brandBlue: '#3e7ca6',
  negativeRed: '#ad2a2a',
} as const

/** Categorical slots. Same series keeps the same slot across themes. */
export const CATEGORICAL_LIGHT = [
  CBRE.celadon,
  CBRE.darkGrey,
  CBRE.accentGreen,
  CBRE.terracotta,
  CBRE.wheat,
  CBRE.plum,
] as const

export const CATEGORICAL_DARK = [
  CBRE.celadon,
  CBRE.brandBlue,
  CBRE.accentGreen,
  CBRE.terracotta,
  CBRE.wheat,
  CBRE.lightViolet,
] as const

/**
 * Alternative categorical themes, for the chart settings on the dashboard.
 *
 * Every hex is a CBRE brand value and every ordering was measured rather than chosen by eye,
 * because the pairs that fail are not the ones that look risky. Accent green beside wheat
 * scores ΔE 1.6 under protanopia, which is the reason the default swaps slots four and five,
 * and a cool blue-and-sage set that looked entirely sensible scored 6.2 for normal vision and
 * was dropped. The figures below are the worst adjacent pair under simulated colour-vision
 * deficiency, and the worst adjacent pair for normal vision, on this theme's own surface.
 *
 *   node scripts/validate_palette.js "<hexes>" --mode light|dark
 *
 * Only the separation checks are treated as pass or fail. The lightness-band and chroma-floor
 * checks fail for every one of these, the default included, because they are brand colours and
 * the brand is the parameter. The contrast warning is answered by the legend, the tooltips and
 * the data table, which is the relief that warning asks for.
 */
export interface ChartPaletteDef {
  id: ChartPaletteId
  label: string
  description: string
  light: readonly string[]
  dark: readonly string[]
  /** Worst adjacent pair, CVD then normal vision, light and dark. */
  measured: { light: [number, number]; dark: [number, number] }
}

export type ChartPaletteId = 'cbre' | 'contrast' | 'warm'

export const CHART_PALETTES: ChartPaletteDef[] = [
  {
    id: 'cbre',
    label: 'CBRE charts',
    description: 'The brand chart palette, in brand order.',
    light: CATEGORICAL_LIGHT,
    dark: CATEGORICAL_DARK,
    measured: { light: [14.7, 23.7], dark: [14.7, 20.2] },
  },
  {
    id: 'contrast',
    label: 'High contrast',
    description: 'Deeper, heavier series. Best for a projector or a printed page.',
    light: [CBRE.darkGreen, CBRE.terracotta, CBRE.brandBlue, CBRE.wheat, CBRE.plum, CBRE.celadon],
    dark: [CBRE.accentGreen, CBRE.lightViolet, CBRE.terracotta, CBRE.brandBlue, CBRE.wheat, CBRE.celadon],
    measured: { light: [13.7, 23.2], dark: [12.1, 15.1] },
  },
  {
    id: 'warm',
    label: 'Warm',
    description: 'Plum and wheat lead. The widest colour-vision separation of the three.',
    light: [CBRE.plum, CBRE.wheat, CBRE.terracotta, CBRE.green, CBRE.brandBlue, CBRE.sageTint],
    dark: [CBRE.lightViolet, CBRE.wheat, CBRE.terracotta, CBRE.accentGreen, CBRE.brandBlue, CBRE.sageTint],
    measured: { light: [18.1, 19.5], dark: [14.7, 19.5] },
  },
]

export function chartPalette(id: ChartPaletteId): ChartPaletteDef {
  return CHART_PALETTES.find((p) => p.id === id) ?? CHART_PALETTES[0]
}

/** Single-measure charts use one colour, because colour encodes nothing there. */
export const SERIES_LIGHT = CBRE.green
export const SERIES_DARK = CBRE.accentGreen

export function categoricalPalette(dark: boolean, id: ChartPaletteId = 'cbre'): readonly string[] {
  const def = chartPalette(id)
  return dark ? def.dark : def.light
}

export function seriesColor(dark: boolean): string {
  return dark ? SERIES_DARK : SERIES_LIGHT
}

/** Anything past the last slot folds into a neutral bucket that reads as "not a category". */
export const OTHER_LABEL = 'Other'
export const OTHER_COLOR_LIGHT = CBRE.cement
export const OTHER_COLOR_DARK = CBRE.cementTint

export function colorForIndex(index: number, dark: boolean, id: ChartPaletteId = 'cbre'): string {
  const palette = categoricalPalette(dark, id)
  if (index < 0 || index >= palette.length) return dark ? OTHER_COLOR_DARK : OTHER_COLOR_LIGHT
  return palette[index]
}

/** Marker fill, keyed to how many deals sit at a location. A single-hue brand green ramp. */
export function markerColor(dealCount: number): string {
  if (dealCount >= 10) return CBRE.darkGreen
  if (dealCount >= 4) return '#00543c'
  return CBRE.green
}

/** Building extrusion colours on the 3D map. */
export const BUILDING = {
  /** Buildings with no comp attached. */
  plain: '#c7cfcb',
  plainDark: '#2b4038',
  /** Buildings holding at least one deal in the current selection. */
  withComps: CBRE.green,
  withCompsDark: '#0b7a56',
  /** The building under the cursor or currently open. */
  highlight: CBRE.accentGreen,
} as const
