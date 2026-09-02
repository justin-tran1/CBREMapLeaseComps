/**
 * Unit tests for the pure logic in src/lib.
 *
 * They run inside a real browser against the modules the Vite dev server serves, so the
 * code under test is exactly the code that ships. Network calls are stubbed, so no
 * geocoding service is contacted.
 *
 *   npm run dev            # in one terminal, on port 5173
 *   npm run test:units     # in another
 *
 * Playwright is not a project dependency. Install it first: npm i -D playwright
 */
import { chromium } from 'playwright'

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
)
const page = await browser.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' })

const results = await page.evaluate(async () => {
  const out = []
  const eq = (name, actual, expected) => {
    const a = JSON.stringify(actual)
    const b = JSON.stringify(expected)
    out.push({ ok: a === b, name, detail: a === b ? '' : `got ${a}, want ${b}` })
  }
  const truthy = (name, v, detail = '') => out.push({ ok: !!v, name, detail: v ? '' : detail })

  const coerce = await import('/src/lib/coerce.ts')
  const fields = await import('/src/lib/fields.ts')
  const geometry = await import('/src/lib/geometry.ts')
  const format = await import('/src/lib/format.ts')
  const normalize = await import('/src/lib/normalize.ts')
  const filters = await import('/src/lib/filters.ts')
  const stats = await import('/src/lib/stats.ts')
  const geocode = await import('/src/lib/geocode.ts')
  const draw = await import('/src/components/mapDraw.ts')
  const palette = await import('/src/lib/palette.ts')
  const googleMaps = await import('/src/lib/googleMaps.ts')
  const chartPrefs = await import('/src/lib/chartPrefs.ts')
  const basemaps = await import('/src/lib/basemaps.ts')
  const google3d = await import('/src/components/GoogleMap3D.tsx')
  const mapTab = await import('/src/components/MapTab.tsx')

  // ------------------------------------------------------------ toNumber
  eq('toNumber $1,234.56', coerce.toNumber('$1,234.56'), 1234.56)
  eq('toNumber (1,234) negative', coerce.toNumber('(1,234)'), -1234)
  eq('toNumber 12,450 SF', coerce.toNumber('12,450 SF'), 12450)
  eq('toNumber $28.50 /SF/YR', coerce.toNumber('$28.50 /SF/YR'), 28.5)
  eq('toNumber euro 1.234,56', coerce.toNumber('1.234,56'), 1234.56)
  eq('toNumber decimal comma 1,5', coerce.toNumber('1,5'), 1.5)
  eq('toNumber 1,234,567', coerce.toNumber('1,234,567'), 1234567)
  eq('toNumber 3.5%', coerce.toNumber('3.5%'), 3.5)
  eq('toNumber N/A', coerce.toNumber('N/A'), null)
  eq('toNumber dash', coerce.toNumber('-'), null)
  eq('toNumber empty', coerce.toNumber(''), null)
  eq('toNumber plain number', coerce.toNumber(42), 42)
  eq('toNumber text only', coerce.toNumber('Confidential'), null)

  // -------------------------------------------------------------- toDate
  const iso = (d) => (d ? coerce.formatDateISO(d) : null)
  eq('toDate ISO', iso(coerce.toDate('2024-03-15')), '2024-03-15')
  eq('toDate US slash', iso(coerce.toDate('3/15/2024')), '2024-03-15')
  eq('toDate 2-digit year', iso(coerce.toDate('3/15/24')), '2024-03-15')
  eq('toDate day-first fallback', iso(coerce.toDate('15/03/2024')), '2024-03-15')
  eq('toDate 15 Mar 2024', iso(coerce.toDate('15 Mar 2024')), '2024-03-15')
  eq('toDate Mar 15 2024', iso(coerce.toDate('Mar 15 2024')), '2024-03-15')
  eq('toDate March 2024', iso(coerce.toDate('March 2024')), '2024-03-01')
  eq('toDate excel serial 45366', iso(coerce.toDate(45366)), '2024-03-15')
  eq('toDate UTC-midnight Date keeps day', iso(coerce.toDate(new Date(Date.UTC(2024, 2, 15)))), '2024-03-15')
  eq('toDate garbage', coerce.toDate('not a date'), null)
  eq('toDate blank', coerce.toDate(''), null)

  // ------------------------------------------------------------- toMonths
  eq('toMonths 60', coerce.toMonths(60, 'months'), 60)
  eq('toMonths 5 with years hint', coerce.toMonths(5, 'years'), 60)
  eq('toMonths "5 years"', coerce.toMonths('5 years'), 60)
  eq('toMonths "66 months"', coerce.toMonths('66 months'), 66)
  eq('toMonths "5 yr 6 mo"', coerce.toMonths('5 yr 6 mo'), 66)
  eq('detect unit from header (Years)', coerce.detectDurationUnit('Term (Years)', [5, 10]), 'years')
  eq('detect unit from header (Months)', coerce.detectDurationUnit('Term (Months)', [60, 120]), 'months')
  eq('detect unit from small values', coerce.detectDurationUnit('Term', [3, 5, 10, 7]), 'years')
  eq('detect unit from large values', coerce.detectDurationUnit('Term', [36, 60, 120]), 'months')

  // ------------------------------------------------------- state and zip
  eq('normalizeState full name', coerce.normalizeState('California'), 'CA')
  eq('normalizeState code', coerce.normalizeState('ca'), 'CA')
  eq('normalizeZip leading zero', coerce.normalizeZip(2110), '02110')
  eq('normalizeZip plus four', coerce.normalizeZip('02110-1234'), '02110-1234')
  eq('titleCaseCity shouty', coerce.titleCaseCity('LOS ANGELES'), 'Los Angeles')
  eq('titleCaseCity mixed left alone', coerce.titleCaseCity('McLean'), 'McLean')

  // ------------------------------------------------------ column matching
  const headers = [
    'Property Name', 'Property Address', 'City', 'State', 'Zip Code',
    'Lease Commencement Date', 'Lease Expiration', 'Date Executed', 'Lease Term (Months)',
    'Type of Lease', 'Rent Basis', 'Suite Number', 'Floor', 'Rentable SF',
    'Starting Base Rent', 'Net Effective Rent', 'Operating Expenses', 'Rent Escalation',
    'Escalation Type', 'Months Free Rent', 'Tenant Improvement Allowance',
    'Landlord', 'Tenant Name', 'Tenant Rep', 'Remarks', 'Total Building SF',
  ]
  const map = fields.autoMapColumns(headers)
  eq('match address', map.address, 'Property Address')
  eq('match lease date', map.leaseDate, 'Lease Commencement Date')
  eq('match expiration', map.expirationDate, 'Lease Expiration')
  eq('match execution', map.executionDate, 'Date Executed')
  eq('match term', map.termMonths, 'Lease Term (Months)')
  eq('match lease type', map.leaseType, 'Type of Lease')
  eq('match rate type', map.rateType, 'Rent Basis')
  eq('match suite', map.suite, 'Suite Number')
  eq('match area (not building SF)', map.areaLeased, 'Rentable SF')
  eq('match base rent (not effective)', map.baseRent, 'Starting Base Rent')
  eq('match effective rent separately', map.effectiveRent, 'Net Effective Rent')
  eq('match opex', map.opex, 'Operating Expenses')
  eq('match escalation', map.escalation, 'Rent Escalation')
  eq('match escalation type', map.escalationType, 'Escalation Type')
  eq('escalation percent is its own field', fields.autoMapColumns(['Escalation Percent']).escalationPercent, 'Escalation Percent')
  eq('escalation value is its own field', fields.autoMapColumns(['Escalation Value']).escalationValue, 'Escalation Value')
  eq('match free rent', map.freeRent, 'Months Free Rent')
  eq('match TI', map.tiAllowance, 'Tenant Improvement Allowance')
  eq('match lessor', map.lessor, 'Landlord')
  eq('match lessee (not tenant rep)', map.lessee, 'Tenant Name')
  eq('match lessee broker', map.lesseeBroker, 'Tenant Rep')
  eq('match notes', map.notes, 'Remarks')
  truthy('no header claimed twice', new Set(Object.values(map)).size === Object.values(map).length)

  // A second dialect of headers.
  const alt = fields.autoMapColumns([
    'BUILDING', 'ADDRESS', 'CITY', 'ST', 'ZIP', 'SIZE (SF)', 'RATE', 'TYPE',
    'COMMENCEMENT', 'TERM', 'FREE RENT', 'TI', 'ESCALATIONS', 'LL', 'TENANT',
  ])
  eq('alt: address', alt.address, 'ADDRESS')
  eq('alt: state', alt.state, 'ST')
  eq('alt: size', alt.areaLeased, 'SIZE (SF)')
  eq('alt: rate to base rent', alt.baseRent, 'RATE')
  eq('alt: commencement', alt.leaseDate, 'COMMENCEMENT')
  eq('alt: term', alt.termMonths, 'TERM')
  eq('alt: escalations', alt.escalation, 'ESCALATIONS')
  eq('alt: tenant', alt.lessee, 'TENANT')

  // --------------------------------- the practice's own comp export schema
  // Verbatim header row from a CBRE Healthcare & Life Sciences export. Every column has
  // to land on the right field, and the ones that look alike are the point of the test.
  const cbre = fields.autoMapColumns([
    'Confidentiality', 'Signed Date', 'Start Date', 'Lease Term', 'End Date',
    'Lease Transaction Type', 'Lease Type', 'Tenant', 'Property Subtype', 'Property Class',
    'Submarket', 'District', 'Property Name', 'Address', 'Floor', 'Suite', 'City',
    'Area Leased', 'Office Area (DEPRECATED)', 'Base Rent Yearly', 'Rate Type',
    'OPEX (Yearly)', 'Escalation Value', 'Escalation Percent', 'Escalation Comments',
    'Free Rent Months', 'TI Allowance', 'TIs as-is', 'TI Notes', 'Other Concessions',
    'Notes', 'Tenant Agent(s)', 'Tenant Representative', 'Listing Agent(s)',
    'Listing Representative', 'Sublessor', 'Lessor', 'Tenant NAICS Code', 'Year Built',
    'Property Type', 'Market', 'State', 'Latitude', 'Longitude', 'Comp ID',
  ])
  const expectCbre = {
    confidentiality: 'Confidentiality',
    executionDate: 'Signed Date',
    leaseDate: 'Start Date',
    termMonths: 'Lease Term',
    expirationDate: 'End Date',
    transactionType: 'Lease Transaction Type',
    leaseType: 'Lease Type',
    lessee: 'Tenant',
    propertySubtype: 'Property Subtype',
    buildingClass: 'Property Class',
    submarket: 'Submarket',
    district: 'District',
    propertyName: 'Property Name',
    address: 'Address',
    floor: 'Floor',
    suite: 'Suite',
    city: 'City',
    areaLeased: 'Area Leased',
    officeArea: 'Office Area (DEPRECATED)',
    baseRent: 'Base Rent Yearly',
    rateType: 'Rate Type',
    opex: 'OPEX (Yearly)',
    escalationValue: 'Escalation Value',
    escalationPercent: 'Escalation Percent',
    escalationComments: 'Escalation Comments',
    freeRent: 'Free Rent Months',
    tiAllowance: 'TI Allowance',
    tiAsIs: 'TIs as-is',
    tiNotes: 'TI Notes',
    otherConcessions: 'Other Concessions',
    notes: 'Notes',
    lesseeBroker: 'Tenant Agent(s)',
    lesseeBrokerFirm: 'Tenant Representative',
    lessorBroker: 'Listing Agent(s)',
    lessorBrokerFirm: 'Listing Representative',
    sublessor: 'Sublessor',
    lessor: 'Lessor',
    naicsCode: 'Tenant NAICS Code',
    yearBuilt: 'Year Built',
    propertyType: 'Property Type',
    market: 'Market',
    state: 'State',
    latitude: 'Latitude',
    longitude: 'Longitude',
    compId: 'Comp ID',
  }
  for (const [field, header] of Object.entries(expectCbre)) {
    eq(`CBRE schema: ${header} -> ${field}`, cbre[field], header)
  }
  truthy('CBRE schema: no header claimed twice',
    new Set(Object.values(cbre)).size === Object.values(cbre).length)
  eq('CBRE schema: every column is mapped', Object.keys(expectCbre).length, 45)

  // ------------------------------------------------------------ geometry
  const box = [[0, 0], [0, 10], [10, 10], [10, 0]]
  truthy('point inside polygon', geometry.pointInPolygon(5, 5, box))
  truthy('point outside polygon', !geometry.pointInPolygon(15, 5, box))
  truthy('point outside polygon (negative)', !geometry.pointInPolygon(-1, 5, box))
  const concave = [[0, 0], [0, 10], [10, 10], [10, 0], [6, 0], [6, 8], [4, 8], [4, 0]]
  truthy('concave: inside the top arm', geometry.pointInPolygon(9, 5, concave))
  truthy('concave: inside the bottom arm', geometry.pointInPolygon(1, 5, concave))
  truthy('concave: inside the right spine', geometry.pointInPolygon(5, 9, concave))
  truthy('concave: the notch reads as outside', !geometry.pointInPolygon(5, 5, concave))
  truthy('rectangle contains', geometry.shapeContains({ kind: 'rectangle', bounds: [[0, 0], [10, 10]] }, 5, 5))
  truthy('rectangle excludes', !geometry.shapeContains({ kind: 'rectangle', bounds: [[0, 0], [10, 10]] }, 11, 5))
  const circle = { kind: 'circle', center: [34.05, -118.25], radiusMeters: 1000 }
  truthy('circle contains near point', geometry.shapeContains(circle, 34.052, -118.25))
  truthy('circle excludes far point', !geometry.shapeContains(circle, 34.2, -118.25))
  const dist = geometry.haversineMeters(34.05, -118.25, 34.06, -118.25)
  truthy('haversine ~1.11km per 0.01 deg lat', Math.abs(dist - 1112) < 15, `${dist}`)

  // ------------------------------------------- building footprints (3D map)
  const square = (lng, lat, d) => ({
    type: 'Polygon',
    coordinates: [[[lng - d, lat - d], [lng + d, lat - d], [lng + d, lat + d], [lng - d, lat + d], [lng - d, lat - d]]],
  })
  const footprint = square(-71.086, 42.3656, 0.0005)
  truthy('comp inside a footprint', geometry.pointInGeometry(-71.086, 42.3656, footprint))
  truthy('comp just outside a footprint', !geometry.pointInGeometry(-71.0875, 42.3656, footprint))
  truthy('a multipolygon is searched in full', geometry.pointInGeometry(-71.05, 42.3, {
    type: 'MultiPolygon',
    coordinates: [square(-71.086, 42.3656, 0.0005).coordinates, square(-71.05, 42.3, 0.001).coordinates],
  }))
  const donut = {
    type: 'Polygon',
    coordinates: [
      [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]],
      [[-0.4, -0.4], [0.4, -0.4], [0.4, 0.4], [-0.4, 0.4], [-0.4, -0.4]],
    ],
  }
  truthy('a courtyard hole reads as outside', !geometry.pointInGeometry(0, 0, donut))
  truthy('the ring around a hole reads as inside', geometry.pointInGeometry(0.7, 0.7, donut))
  eq('footprintKey is stable', geometry.footprintKey(footprint), geometry.footprintKey(square(-71.086, 42.3656, 0.0005)))
  truthy('footprintKey separates buildings', geometry.footprintKey(footprint) !== geometry.footprintKey(square(-71.05, 42.3, 0.0005)))
  eq('footprintKey ignores non-polygons', geometry.footprintKey({ type: 'Point', coordinates: [0, 0] }), '')

  // ------------------------------- choosing the right footprint for a comp
  const areaOf = geometry.geometryAreaSqMeters
  const smallFootprint = square(-71.086, 42.3656, 0.0005)  // one building, ~9,100 m2
  const blockFootprint = square(-71.086, 42.3656, 0.001)   // still under the cap, ~36,500 m2
  const campusFootprint = square(-71.086, 42.3656, 0.004)  // a campus, way over the cap
  const neighbourFootprint = square(-71.0845, 42.3656, 0.0005)

  const sidesArea =
    geometry.haversineMeters(42.3656, -71.0865, 42.3656, -71.0855) *
    geometry.haversineMeters(42.3651, -71.086, 42.3661, -71.086)
  truthy('footprint area agrees with its own side lengths',
    Math.abs(areaOf(smallFootprint) - sidesArea) / sidesArea < 0.01,
    `${areaOf(smallFootprint)} vs ${sidesArea}`)
  truthy('a courtyard is subtracted from the footprint area',
    areaOf(donut) < areaOf({ type: 'Polygon', coordinates: [donut.coordinates[0]] }))
  truthy('a multipolygon adds its parts', Math.abs(areaOf({
    type: 'MultiPolygon',
    coordinates: [smallFootprint.coordinates, neighbourFootprint.coordinates],
  }) - 2 * areaOf(smallFootprint)) / areaOf(smallFootprint) < 0.01)
  eq('a non-polygon has no area', areaOf({ type: 'Point', coordinates: [0, 0] }), 0)

  const pick = (candidates) => geometry.pickFootprintForPoint(candidates, -71.086, 42.3656, 40_000)
  eq('the nested building beats the campus polygon around it',
    pick([{ id: 'campus', geometry: campusFootprint }, { id: 'building', geometry: smallFootprint }])?.candidate.id,
    'building')
  eq('the smallest containing footprint wins whatever the order',
    pick([{ id: 'small', geometry: smallFootprint }, { id: 'block', geometry: blockFootprint }])?.candidate.id, 'small')
  eq('a footprint that does not contain the comp is refused',
    pick([{ id: 'neighbour', geometry: neighbourFootprint }]), null)
  eq('a campus-sized polygon is refused rather than highlighted',
    pick([{ id: 'campus', geometry: campusFootprint }]), null)
  eq('the chosen candidate comes back intact',
    pick([{ id: 'building', geometry: smallFootprint, properties: { render_height: 40 } }])?.candidate.properties.render_height,
    40)
  eq('nothing to choose from yields nothing', pick([]), null)

  // A tile generator unions neighbouring buildings into one feature. Only the part the comp
  // stands in may be highlighted; the rest of the union is other people's buildings.
  eq('a polygon is one part', geometry.polygonPartsOf(smallFootprint).length, 1)
  eq('a union splits into its buildings', geometry.polygonPartsOf({
    type: 'MultiPolygon',
    coordinates: [smallFootprint.coordinates, neighbourFootprint.coordinates],
  }).length, 2)
  eq('a non-polygon has no parts', geometry.polygonPartsOf({ type: 'LineString', coordinates: [[0, 0], [1, 1]] }).length, 0)

  const blockUnion = {
    type: 'MultiPolygon',
    coordinates: [
      smallFootprint.coordinates,                       // the comp stands here
      square(-71.0845, 42.3656, 0.0005).coordinates,    // 120 m east
      square(-71.0875, 42.3668, 0.0005).coordinates,    // north west
      square(-71.083, 42.364, 0.0005).coordinates,      // south east
    ],
  }
  const unionPick = pick([{ id: 'union', geometry: blockUnion }])
  eq('a union is matched by the part the comp is in', unionPick?.candidate.id, 'union')
  eq('and only that one part is returned', unionPick?.geometry.type, 'Polygon')
  truthy('the returned part is the one holding the comp',
    geometry.pointInGeometry(-71.086, 42.3656, unionPick.geometry))
  truthy('the returned part is not the whole union',
    Math.abs(unionPick.areaSqMeters - areaOf(smallFootprint)) < 1,
    `${unionPick.areaSqMeters} vs ${areaOf(smallFootprint)}`)
  truthy('the union as a whole is four times the area',
    areaOf(blockUnion) > 3.5 * areaOf(smallFootprint), `${areaOf(blockUnion)}`)
  // The cap has to bite on the part, not the sum, or a union of small buildings slips through
  // by being individually small while covering a neighbourhood.
  // The part is about 9,100 m2 and the union about 36,500. A 20,000 cap therefore accepts the
  // part and would reject the union, which is what proves the cap bites on the part.
  truthy('the union total would fail a cap the part passes',
    areaOf(blockUnion) > 20_000 && areaOf(smallFootprint) < 20_000,
    `part ${Math.round(areaOf(smallFootprint))}, union ${Math.round(areaOf(blockUnion))}`)
  eq('the area cap applies to the part, not the union total',
    geometry.pickFootprintForPoint([{ id: 'union', geometry: blockUnion }], -71.086, 42.3656, 20_000)?.candidate.id,
    'union')
  eq('a part above the cap is still refused',
    geometry.pickFootprintForPoint([{ id: 'union', geometry: blockUnion }], -71.086, 42.3656, 5_000), null)

  // The highlight is drawn over the building it highlights, so it is grown a little to keep
  // the two solids off each other's surfaces.
  const grown = geometry.inflatePolygon(smallFootprint, 0.35)
  truthy('inflating grows the footprint', areaOf(grown) > areaOf(smallFootprint))
  truthy('but only by a fraction of a metre',
    Math.sqrt(areaOf(grown)) - Math.sqrt(areaOf(smallFootprint)) < 1.2,
    `${Math.sqrt(areaOf(grown)) - Math.sqrt(areaOf(smallFootprint))} m`)
  truthy('the comp stays inside the inflated footprint',
    geometry.pointInGeometry(-71.086, 42.3656, grown))
  eq('inflating keeps the ring closed',
    [grown.coordinates[0][0], grown.coordinates[0][grown.coordinates[0].length - 1]].map((p) => p.join(',')).join(' == ').split(' == ').length,
    2)
  eq('a zero inflation is a no-op', geometry.inflatePolygon(smallFootprint, 0), smallFootprint)
  truthy('a courtyard is not swallowed by the inflation', (() => {
    const withHole = geometry.inflatePolygon(donut, 0.35)
    // The hole shrinks while the outline grows, so the ring between them can only widen.
    return areaOf(withHole) > areaOf(donut)
  })())

  // ------------------------------------------------- boundary outline layers
  const style = basemaps.buildStyle(basemaps.getBasemap('cbre-light'), false)
  const layerById = Object.fromEntries(style.layers.map((l) => [l.id, l]))
  const cityLayer = layerById[basemaps.LAYER.cityLines]
  const countyLayer = layerById[basemaps.LAYER.countyLines]

  truthy('the style carries a city outline layer', !!cityLayer)
  truthy('the style carries a county outline layer', !!countyLayer)
  eq('both outlines read the building tiles', [cityLayer.source, countyLayer.source],
    [basemaps.BUILDING_SOURCE_ID, basemaps.BUILDING_SOURCE_ID])
  eq('both outlines read the boundary source layer',
    [cityLayer['source-layer'], countyLayer['source-layer']], ['boundary', 'boundary'])
  eq('both outlines start hidden',
    [cityLayer.layout.visibility, countyLayer.layout.visibility], ['none', 'none'])
  // The tiles publish 5-6 from zoom 8 and 8 upwards from zoom 12, so asking earlier is wasted.
  eq('each outline waits for the zoom its data arrives at',
    [countyLayer.minzoom, cityLayer.minzoom],
    [basemaps.BOUNDARY_MIN_ZOOM.county, basemaps.BOUNDARY_MIN_ZOOM.city])
  eq('the county line is the heavier of the two',
    countyLayer.paint['line-width'][4] > cityLayer.paint['line-width'][4], true)
  truthy('the city limit is dashed so the two can be told apart',
    Array.isArray(cityLayer.paint['line-dasharray']))
  truthy('an outline is never the green a comp building wears',
    ![countyLayer.paint['line-color'], cityLayer.paint['line-color']]
      .some((c) => [palette.CBRE.green, palette.CBRE.accentGreen].includes(c)),
    `${countyLayer.paint['line-color']} / ${cityLayer.paint['line-color']}`)
  truthy('outlines sit below the buildings, not over the roofs',
    style.layers.findIndex((l) => l.id === basemaps.LAYER.countyLines) <
      style.layers.findIndex((l) => l.id === basemaps.LAYER.buildings))
  truthy('outlines sit above the imagery',
    style.layers.findIndex((l) => l.id === basemaps.LAYER.base) <
      style.layers.findIndex((l) => l.id === basemaps.LAYER.cityLines))

  /*
   * The filter has to be "at or below", not "equal to". A boundary shared by several levels is
   * published at the lowest one participating, so a county following a state line carries 4 and
   * a city following the county line carries 6. Equality would leave both outlines full of gaps.
   */
  const countyFilter = basemaps.boundaryFilter('county')
  const cityFilter = basemaps.boundaryFilter('city')
  eq('county segments are taken at or below level 6', countyFilter[1][0], '<=')
  eq('county outlines stop at level 6', countyFilter[1][2], 6)
  eq('city outlines stop at level 8', cityFilter[1][2], 8)
  eq('maritime segments are excluded', countyFilter[2][0], '!=')
  truthy('the maritime test reads the maritime flag',
    JSON.stringify(countyFilter[2]).includes('maritime'), JSON.stringify(countyFilter[2]))
  eq('the two filters differ only in the level they stop at',
    JSON.stringify(countyFilter).replace('6', 'L'), JSON.stringify(cityFilter).replace('8', 'L'))
  eq('a layer id is published for each kind',
    [basemaps.BOUNDARY_LAYER_ID.city, basemaps.BOUNDARY_LAYER_ID.county],
    [basemaps.LAYER.cityLines, basemaps.LAYER.countyLines])

  // Aerial imagery is dark, so the outline has to step to its light value on every dark base.
  const aerial = basemaps.buildStyle(basemaps.getBasemap('aerial'), false)
  const aerialCounty = aerial.layers.find((l) => l.id === basemaps.LAYER.countyLines)
  truthy('the outline changes value over dark imagery',
    aerialCounty.paint['line-color'] !== countyLayer.paint['line-color'],
    `${aerialCounty.paint['line-color']} vs ${countyLayer.paint['line-color']}`)

  // ------------------------------------------------------- draw geometry
  const ring = draw.circleRing(42.3656, -71.086, 500)
  truthy('circle ring closes on itself', ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1])
  truthy('circle ring is roughly 500 m across', (() => {
    const far = Math.max(...ring.map(([lng, lat]) => geometry.haversineMeters(42.3656, -71.086, lat, lng)))
    return Math.abs(far - 500) < 20
  })(), 'radius drift')
  const rectFeature = draw.shapeToFeature({ kind: 'rectangle', bounds: [[42.0, -71.2], [42.4, -70.9]] })
  eq('rectangle becomes a closed ring', rectFeature.geometry.coordinates[0].length, 5)
  truthy('rectangle ring is in lng/lat order', rectFeature.geometry.coordinates[0][0][0] === -71.2)
  const polyFeature = draw.shapeToFeature({ kind: 'polygon', points: [[1, 2], [3, 4], [5, 6]] })
  eq('polygon flips to lng/lat and closes', polyFeature.geometry.coordinates[0], [[2, 1], [4, 3], [6, 5], [2, 1]])
  truthy('drawn shape round-trips through the containment test',
    geometry.shapeContains({ kind: 'rectangle', bounds: [[42.0, -71.2], [42.4, -70.9]] }, 42.2, -71.0))

  // -------------------------------------------------------- brand palette
  const brandHexes = new Set(Object.values(palette.CBRE))
  truthy('every light categorical slot is a brand colour',
    palette.CATEGORICAL_LIGHT.every((c) => brandHexes.has(c)), palette.CATEGORICAL_LIGHT.join(','))
  truthy('every dark categorical slot is a brand colour',
    palette.CATEGORICAL_DARK.every((c) => brandHexes.has(c)), palette.CATEGORICAL_DARK.join(','))
  eq('slot count matches across themes', palette.CATEGORICAL_LIGHT.length, palette.CATEGORICAL_DARK.length)
  eq('single-series light is CBRE green', palette.SERIES_LIGHT, '#003f2d')
  eq('single-series dark is accent green', palette.SERIES_DARK, '#17e88f')
  eq('slot 0 resolves', palette.colorForIndex(0, false), palette.CATEGORICAL_LIGHT[0])
  eq('past the last slot falls back to the neutral', palette.colorForIndex(99, false), palette.OTHER_COLOR_LIGHT)
  truthy('marker ramp darkens with deal count',
    palette.markerColor(1) !== palette.markerColor(4) && palette.markerColor(4) !== palette.markerColor(10))

  // ------------------------------------------------------------- formats
  eq('fmtRent annual', format.fmtRent(28.5, 'Annual $/SF'), '$28.50 /SF/Yr')
  eq('fmtRent monthly', format.fmtRent(0.95, 'Monthly $/SF'), '$0.95 /SF/Mo')
  eq('fmtRent inferred psf', format.fmtRent(28.5, ''), '$28.50 /SF/Yr')
  eq('fmtRent large total', format.fmtRent(45000, ''), '$45,000')
  eq('fmtCompact zero', format.fmtCompact(0), '0')
  eq('fmtCompact 1.2M', format.fmtCompact(1234567), '1.2M')
  eq('fmtCompact 12K', format.fmtCompact(12400), '12K')
  eq('fmtMonths 60', format.fmtMonths(60), '60 mos (5 yrs)')
  eq('fmtMonths 6', format.fmtMonths(6), '6 mos')
  eq('fmtYears 72.7', format.fmtYears(72.7), '6.1 yrs')
  eq('escalation 0.03', format.fmtEscalationRate('0.03'), '3%')
  eq('escalation 3', format.fmtEscalationRate('3'), '3%')
  eq('escalation 3.5%', format.fmtEscalationRate('3.5%'), '3.5%')
  eq('escalation $0.75', format.fmtEscalationRate('$0.75'), '$0.75')
  eq('escalation CPI text', format.fmtEscalationRate('CPI, 2% floor'), 'CPI, 2% floor')
  eq('escalation percent 3', format.fmtEscalationPercent('3'), '3%')
  eq('escalation percent 0.03', format.fmtEscalationPercent('0.03'), '3%')
  eq('escalation percent 3.5%', format.fmtEscalationPercent('3.5%'), '3.5%')
  eq('escalation percent zero reads as absent', format.fmtEscalationPercent('0.00%'), '')
  eq('escalation value dollars', format.fmtEscalationValue('$0.75'), '$0.75')
  eq('escalation value bare number stays money', format.fmtEscalationValue('0.75'), '$0.75')
  eq('escalation value zero reads as absent', format.fmtEscalationValue('0.00'), '')
  eq('isMonthlyQuote yes', format.isMonthlyQuote('Monthly $/SF'), true)
  eq('isMonthlyQuote no', format.isMonthlyQuote('Annual $/SF'), false)
  eq('isMonthlyQuote blank', format.isMonthlyQuote(''), false)

  // ------------------------------------------------------------ normalize
  eq('cleanStreet strips suite', normalize.cleanStreet('515 S Flower St, Suite 2200'), '515 S Flower St')
  eq('cleanStreet strips #', normalize.cleanStreet('100 Main St #400'), '100 Main St')
  eq('cleanStreet strips Ste', normalize.cleanStreet('100 Main St Ste 12B'), '100 Main St')
  eq('cleanStreet keeps plain', normalize.cleanStreet('100 Main St'), '100 Main St')
  eq('cleanStreet keeps Flower', normalize.cleanStreet('515 S Flower St'), '515 S Flower St')
  eq('cleanStreet keeps Florida Ave', normalize.cleanStreet('900 Florida Ave NW'), '900 Florida Ave NW')
  eq('cleanStreet keeps North', normalize.cleanStreet('300 North LaSalle Dr'), '300 North LaSalle Dr')
  eq('cleanStreet keeps Union', normalize.cleanStreet('401 Union St'), '401 Union St')
  eq('cleanStreet keeps Building name street', normalize.cleanStreet('1 Rockefeller Plaza'), '1 Rockefeller Plaza')
  eq('cleanStreet strips Floor 12', normalize.cleanStreet('100 Main St, Floor 12'), '100 Main St')
  eq('cleanStreet strips Suite2200', normalize.cleanStreet('100 Main St Suite2200'), '100 Main St')
  eq('cleanStreet strips Bldg A', normalize.cleanStreet('100 Main St Bldg A'), '100 Main St')
  const base = { address: '515 S Flower St', city: 'Los Angeles', state: 'CA', zip: '90071', propertyName: 'CNP' }
  eq('geocodeQuery', normalize.geocodeQuery(base), '515 S Flower St, Los Angeles, CA, 90071')
  eq(
    'addressKey ignores suite',
    normalize.addressKey({ ...base, address: '515 S Flower St Suite 900' }),
    normalize.addressKey(base),
  )
  eq('annualizeRate monthly', normalize.annualizeRate(1, 'Monthly $/SF'), 12)
  eq('annualizeRate annual', normalize.annualizeRate(12, 'Annual $/SF'), 12)
  eq('annualizeRate unknown left alone', normalize.annualizeRate(12, ''), 12)

  // Full pipeline over a messy sheet.
  const sheet = {
    fileName: 't.csv', sheetName: 'S', sheetNames: ['S'],
    headers: ['Address', 'City', 'State', 'Zip', 'Commencement', 'Term (Yrs)', 'Size', 'Rate', 'Rate Type', 'Escalations', 'Free Rent', 'TI'],
    rows: [
      { Address: '1 A St', City: 'AUSTIN', State: 'Texas', Zip: 78701, Commencement: '1/5/2024', 'Term (Yrs)': 5, Size: '12,400', Rate: '$46.80', 'Rate Type': 'Annual $/SF', Escalations: '3%', 'Free Rent': '4', TI: '$75.00' },
      { Address: '2 B St', City: 'austin', State: 'TX', Zip: '78702', Commencement: 45566, 'Term (Yrs)': 10, Size: '250,000', Rate: '$0.85', 'Rate Type': 'Monthly $/SF', Escalations: '0.03', 'Free Rent': '', TI: '' },
    ],
  }
  const m2 = fields.autoMapColumns(sheet.headers)
  const deals = normalize.normalizeDeals(sheet, m2)
  eq('pipeline: 2 deals', deals.length, 2)
  eq('pipeline: term years to months', deals[0].termMonths, 60)
  eq('pipeline: term 10y', deals[1].termMonths, 120)
  eq('pipeline: area parsed', deals[0].areaLeased, 12400)
  eq('pipeline: rent parsed', deals[0].baseRent, 46.8)
  eq('pipeline: monthly rent annualised', deals[1].baseRentAnnual, 10.2)
  eq('pipeline: annual rent unchanged', deals[0].baseRentAnnual, 46.8)
  eq('pipeline: state normalised', deals[0].state, 'TX')
  eq('pipeline: city title cased', deals[0].city, 'Austin')
  eq('pipeline: lease date', iso(deals[0].leaseDate), '2024-01-05')
  eq('pipeline: free rent', deals[0].freeRent, 4)
  eq('pipeline: free rent blank', deals[1].freeRent, null)
  eq('pipeline: TI', deals[0].tiAllowance, 75)
  eq('pipeline: escalation resolved', normalize.resolveEscalation(deals[1]), '3%')

  // Split escalation columns, with a zero standing in for "not this one".
  const escDeal = (over) => ({
    escalation: '', escalationType: '', escalationPercent: '', escalationValue: '',
    escalationComments: '', ...over,
  })
  eq('escalation: percent wins over a zero value',
    normalize.resolveEscalation(escDeal({ escalationPercent: '3.5%', escalationValue: '0.00' })), '3.5%')
  eq('escalation: falls back to the dollar value',
    normalize.resolveEscalation(escDeal({ escalationPercent: '0.00%', escalationValue: '$1.50' })), '$1.50')
  eq('escalation: type is appended',
    normalize.resolveEscalation(escDeal({ escalationPercent: '3%', escalationType: 'Fixed %' })), '3% · Fixed %')
  eq('escalation: comments carry the stepped detail',
    normalize.resolveEscalation(escDeal({ escalationPercent: '3%', escalationComments: 'then CPI' })), '3% · then CPI')
  eq('escalation: comments alone still show',
    normalize.resolveEscalation(escDeal({ escalationComments: 'Flat through year 3' })), 'Flat through year 3')
  eq('escalation: all zeros read as empty',
    normalize.resolveEscalation(escDeal({ escalationPercent: '0.00%', escalationValue: '0.00' })), '')
  eq('pipeline: raw row kept', deals[0].raw.Address, '1 A St')

  // --------------------------------------------------------------- filters
  const withCoords = deals.map((d, i) => ({ ...d, lat: 30.26 + i * 0.01, lon: -97.74 }))
  const f = filters.emptyFilters()
  eq('no filters keeps all', filters.applyFilters(withCoords, f).length, 2)
  eq('city filter', filters.applyFilters(withCoords, { ...f, cities: ['Austin'] }).length, 2)
  eq('city filter miss', filters.applyFilters(withCoords, { ...f, cities: ['Dallas'] }).length, 0)
  eq('area range', filters.applyFilters(withCoords, { ...f, areaLeased: { min: 100000, max: null } }).length, 1)
  eq('term range', filters.applyFilters(withCoords, { ...f, termMonths: { min: null, max: 60 } }).length, 1)
  eq('base rent range uses annualised', filters.applyFilters(withCoords, { ...f, baseRent: { min: 20, max: null } }).length, 1)
  eq('date range', filters.applyFilters(withCoords, { ...f, leaseDate: { start: '2024-01-01', end: '2024-06-30' } }).length, 1)

  // Signed date is its own filter: a deal signed in one quarter often commences in another.
  const signed = [
    { ...withCoords[0], executionDate: new Date(2023, 10, 27) },  // 2023-11-27, commences 2024-01-05
    { ...withCoords[1], executionDate: new Date(2024, 8, 3) },    // 2024-09-03
  ]
  eq('signed date range: from', filters.applyFilters(signed, { ...f, executionDate: { start: '2024-01-01', end: null } }).length, 1)
  eq('signed date range: through', filters.applyFilters(signed, { ...f, executionDate: { start: null, end: '2023-12-31' } }).length, 1)
  eq('signed date range: both ends', filters.applyFilters(signed, { ...f, executionDate: { start: '2023-01-01', end: '2024-12-31' } }).length, 2)
  eq('signed date range: no overlap', filters.applyFilters(signed, { ...f, executionDate: { start: '2025-01-01', end: null } }).length, 0)
  eq('signed date is independent of lease date',
    filters.applyFilters(signed, {
      ...f,
      leaseDate: { start: '2024-01-01', end: '2024-06-30' },
      executionDate: { start: null, end: '2023-12-31' },
    }).length, 1)
  eq('lease date and signed date can exclude each other',
    filters.applyFilters(signed, {
      ...f,
      leaseDate: { start: '2024-01-01', end: '2024-06-30' },
      executionDate: { start: '2024-01-01', end: null },
    }).length, 0)
  eq('signed date filter drops rows with no signed date',
    filters.applyFilters(withCoords, { ...f, executionDate: { start: '2000-01-01', end: null } }).length, 0)
  eq('signed date bounds span the data',
    [filters.computeBounds(signed).executionDate.start, filters.computeBounds(signed).executionDate.end],
    ['2023-11-27', '2024-09-03'])
  eq('signed date bounds are blank without the column',
    filters.computeBounds(withCoords).executionDate, { start: null, end: null })
  eq('signed date raises a chip',
    filters.describeActiveFilters({ ...f, executionDate: { start: '2024-01-01', end: null } })[0].label,
    'Signed date: from 2024-01-01')
  eq('clearing the signed date chip leaves lease date alone', (() => {
    const active = { ...f, leaseDate: { start: '2024-01-01', end: null }, executionDate: { start: '2024-02-01', end: null } }
    const chip = filters.describeActiveFilters(active).find((c) => c.id === 'executionDate')
    const cleared = chip.clear(active)
    return [cleared.executionDate, cleared.leaseDate]
  })(), [{ start: null, end: null }, { start: '2024-01-01', end: null }])
  eq('free rent range drops blanks', filters.applyFilters(withCoords, { ...f, freeRent: { min: 1, max: null } }).length, 1)
  eq('keyword search', filters.applyFilters(withCoords, { ...f, search: 'austin' }).length, 2)
  eq('keyword search multi-term', filters.applyFilters(withCoords, { ...f, search: '1 A St' }).length, 1)
  eq('keyword no match', filters.applyFilters(withCoords, { ...f, search: 'zzz' }).length, 0)
  eq(
    'shape filter',
    filters.applyFilters(withCoords, {
      ...f,
      shape: { kind: 'circle', center: [30.26, -97.74], radiusMeters: 500 },
    }).length,
    1,
  )
  const b = filters.computeBounds(withCoords)
  eq('bounds area', [b.areaLeased.min, b.areaLeased.max], [12400, 250000])
  eq('bounds rent annualised', [b.baseRent.min, b.baseRent.max], [10.2, 46.8])
  eq('active chips count', filters.describeActiveFilters({ ...f, cities: ['Austin'], search: 'x' }).length, 2)

  // ----------------------------------------------------------------- sites
  const sites = normalize.buildSites(withCoords)
  eq('two coords make two sites', sites.length, 2)
  const stacked = withCoords.map((d) => ({ ...d, lat: 30.26, lon: -97.74 }))
  eq('same coords collapse to one site', normalize.buildSites(stacked).length, 1)
  eq('collapsed site holds both deals', normalize.buildSites(stacked)[0].deals.length, 2)

  // ----------------------------------------------------------------- stats
  const k = stats.computeKpis(withCoords)
  eq('kpi deal count', k.dealCount, 2)
  eq('kpi total area', k.totalArea, 262400)
  // (46.8*12400 + 10.2*250000) / 262400
  eq('kpi weighted rent', Math.round(k.weightedBaseRent * 100) / 100, 11.93)
  eq('kpi average term', k.averageTerm, 90)
  eq('grain for a wide span', stats.chooseGrain(withCoords), 'month')
  const hist = stats.histogram([1, 2, 3, 10, 11, 12], 3, (n) => String(n))
  truthy('histogram bins produced', hist.length >= 2 && hist.reduce((n, x) => n + x.count, 0) === 6)
  eq('weightedMean falls back without weights', stats.weightedMean([{ value: 10, weight: null }, { value: 20, weight: null }]), 15)
  eq('mean ignores nulls', stats.mean([10, null, 20]), 15)
  eq('median odd', stats.median([5, 1, 3]), 3)

  // ------------------------------------------------------- signed date
  const dated = (signed, commenced, type = 'NNN', area = 1000) => ({
    ...withCoords[0],
    executionDate: signed === null ? null : new Date(signed[0], signed[1], signed[2]),
    leaseDate: commenced === null ? null : new Date(commenced[0], commenced[1], commenced[2]),
    leaseType: type,
    areaLeased: area,
  })
  const signedSet = [
    dated([2024, 0, 10], [2024, 3, 1]),            // 82 days
    dated([2024, 1, 5], [2024, 7, 1], 'FSG'),      // 178 days
    dated([2024, 5, 1], [2024, 4, 1]),             // signed a month late
    dated(null, [2024, 6, 1]),                     // no signed date at all
    dated([2024, 2, 2], null),                     // signed, never commences
  ]
  const sg = stats.signingStats(signedSet)
  eq('signed count ignores rows with no signed date', sg.signedCount, 4)
  eq('a lead time needs both dates', sg.pairedCount, 3)
  eq('median lead time', sg.medianLagDays, 82)
  eq('a lease signed after commencement is counted', sg.signedLateCount, 1)
  truthy('a late signing is a negative lead time', Math.min(...sg.lagDays) < 0, sg.lagDays.join(','))
  eq('signed span starts at the earliest signing', coerce.formatDateISO(sg.signedFrom), '2024-01-10')
  eq('signed span ends at the latest signing', coerce.formatDateISO(sg.signedTo), '2024-06-01')
  eq('no signed dates means no span', stats.signingStats([dated(null, [2024, 1, 1])]).signedFrom, null)

  // The timeline buckets on whichever date it is asked for, and the two differ.
  const byCommencement = stats.timeSeries(signedSet, 'month', null, 5)
  const bySigned = stats.timeSeries(signedSet, 'month', null, 5, { dateOf: stats.SIGNED })
  eq('commencement timeline skips rows with no lease date', byCommencement.buckets.length, 4)
  eq('signed timeline skips rows with no signed date', bySigned.buckets.length, 4)
  truthy('the two timelines are not the same buckets',
    byCommencement.buckets.map((b) => b.key).join() !== bySigned.buckets.map((b) => b.key).join(),
    `${byCommencement.buckets.map((b) => b.key)} vs ${bySigned.buckets.map((b) => b.key)}`)
  eq('a signed bucket sits in the signing month',
    stats.timeSeries([dated([2024, 0, 10], [2024, 6, 1])], 'month', null, 5, { dateOf: stats.SIGNED }).buckets[0].key,
    '2024-01')
  // A stacked segment can measure space or deals.
  const asArea = stats.timeSeries([dated([2024, 0, 10], [2024, 0, 20], 'NNN', 5000)], 'month', (d) => d.leaseType, 5)
  const asDeals = stats.timeSeries([dated([2024, 0, 10], [2024, 0, 20], 'NNN', 5000)], 'month', (d) => d.leaseType, 5, { measure: 'deals' })
  eq('area is the default measure', asArea.buckets[0].byType.NNN, 5000)
  eq('deals can be measured instead', asDeals.buckets[0].byType.NNN, 1)
  eq('the grain can be chosen on the signed date',
    stats.chooseGrain([dated([2020, 0, 1], [2024, 0, 1]), dated([2024, 0, 1], [2024, 0, 2])], stats.SIGNED),
    'quarter')

  // ------------------------------------------------- chart palettes and style
  eq('three chart palettes are offered', palette.CHART_PALETTES.length, 3)
  truthy('every palette hex is a brand colour',
    palette.CHART_PALETTES.every((p) => [...p.light, ...p.dark].every((hex) => brandHexes.has(hex))),
    palette.CHART_PALETTES.map((p) => p.id).join())
  truthy('every palette fills all six slots',
    palette.CHART_PALETTES.every((p) => p.light.length === 6 && p.dark.length === 6))
  truthy('no palette repeats a colour',
    palette.CHART_PALETTES.every((p) => new Set(p.light).size === 6 && new Set(p.dark).size === 6))
  /*
   * The separation figures recorded beside each palette are what the validator measured, and
   * they are the reason a cool blue-and-sage set was dropped. A palette below the floor must
   * never reach the picker, so the claim is asserted rather than trusted.
   */
  truthy('every palette clears the colour-vision floor',
    palette.CHART_PALETTES.every((p) => p.measured.light[0] >= 8 && p.measured.dark[0] >= 8),
    palette.CHART_PALETTES.map((p) => `${p.id}:${p.measured.light[0]}/${p.measured.dark[0]}`).join(' '))
  truthy('every palette clears the normal-vision floor',
    palette.CHART_PALETTES.every((p) => p.measured.light[1] >= 15 && p.measured.dark[1] >= 15),
    palette.CHART_PALETTES.map((p) => `${p.id}:${p.measured.light[1]}/${p.measured.dark[1]}`).join(' '))

  eq('a palette is looked up by id', palette.chartPalette('warm').id, 'warm')
  eq('an unknown palette falls back to the brand one', palette.chartPalette('nope').id, 'cbre')
  eq('colours come from the chosen palette', palette.colorForIndex(0, false, 'warm'), palette.CBRE.plum)
  eq('the default palette is unchanged', palette.colorForIndex(0, false), palette.CATEGORICAL_LIGHT[0])
  eq('past the last slot is the neutral bucket',
    palette.colorForIndex(9, false, 'warm'), palette.OTHER_COLOR_LIGHT)

  eq('chart prefs default to the brand palette', chartPrefs.DEFAULT_CHART_PREFS.palette, 'cbre')
  eq('a stored pref is honoured', chartPrefs.parseChartPrefs({ palette: 'warm', density: 'compact' }).palette, 'warm')
  eq('an unknown palette in storage is ignored', chartPrefs.parseChartPrefs({ palette: 'rainbow' }).palette, 'cbre')
  eq('a non-boolean grid setting is ignored', chartPrefs.parseChartPrefs({ showGrid: 'yes' }).showGrid, true)
  eq('nothing stored yields the defaults', chartPrefs.parseChartPrefs(null), chartPrefs.DEFAULT_CHART_PREFS)
  truthy('compact charts are shorter', chartPrefs.densityScale('compact') < chartPrefs.densityScale('comfortable'))

  // ---- popup cards stay on the map
  const rect = (left, top, right, bottom) => ({ left, top, right, bottom })
  const mapBox = rect(0, 100, 1600, 1000)
  eq('a card inside the map needs no pan', mapTab.popupOverrun(rect(600, 300, 960, 860), mapBox), null)
  eq('a card past the bottom pans the map down by the overrun plus the margin', mapTab.popupOverrun(rect(600, 500, 960, 1100), mapBox), [0, 108])
  eq('a card past the top pans the map up', mapTab.popupOverrun(rect(600, 40, 960, 600), mapBox), [0, -68])
  eq('a card past the right edge pans sideways', mapTab.popupOverrun(rect(1400, 300, 1700, 860), mapBox), [108, 0])
  eq('a card taller than the map is brought to the bottom edge first', mapTab.popupOverrun(rect(600, 50, 960, 1300), mapBox), [0, 308])
  const toolbar = rect(1200, 112, 1590, 156)
  const status = rect(10, 930, 420, 990)
  const edges = (box) => [box.top, box.bottom, box.left, box.right]
  eq('with no overlays the whole map is room', edges(mapTab.popupRoom(mapBox, [], rect(600, 300, 960, 860))), edges(mapBox))
  eq('a toolbar over the card takes its band off the top', mapTab.popupRoom(mapBox, [toolbar, status], rect(1300, 120, 1560, 600)).top, 156)
  eq('a status card under the card takes its band off the bottom', mapTab.popupRoom(mapBox, [toolbar, status], rect(100, 300, 400, 990)).bottom, 930)
  eq('overlays in other columns cost nothing', edges(mapTab.popupRoom(mapBox, [toolbar, status], rect(600, 300, 960, 860))), edges(mapBox))
  eq('a card beneath the toolbar pans down past it', mapTab.popupOverrun(rect(1300, 120, 1560, 600), mapTab.popupRoom(mapBox, [toolbar], rect(1300, 120, 1560, 600))), [0, -44])

  // ------------------------------------------------- geocode provider parsing
  const realFetch = window.fetch
  const calls = []
  const stub = (handler) => {
    window.fetch = async (url) => {
      calls.push(String(url))
      return handler(String(url))
    }
  }
  const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

  geocode.clearGeocodeCache()
  stub(() => json({ result: { addressMatches: [{ coordinates: { x: -118.25, y: 34.05 }, matchedAddress: 'X' } ] } }))
  let got = []
  await geocode.geocodeBatch([{ key: 'k1', query: '515 S Flower St' }], {
    provider: 'census',
    signal: new AbortController().signal,
    onProgress: () => {},
    onResult: (o) => got.push(o),
  })
  eq('census parsed', [got[0].hit.lat, got[0].hit.lon], [34.05, -118.25])
  eq('census cached', geocode.getCached('k1').lat, 34.05)

  geocode.clearGeocodeCache()
  stub(() => json({ features: [{ geometry: { coordinates: [-97.74, 30.26] }, properties: { type: 'house' } }] }))
  got = []
  await geocode.geocodeBatch([{ key: 'k2', query: '1 A St' }], {
    provider: 'photon', signal: new AbortController().signal, onProgress: () => {}, onResult: (o) => got.push(o),
  })
  eq('photon parsed', [got[0].hit.lat, got[0].hit.lon], [30.26, -97.74])

  geocode.clearGeocodeCache()
  stub(() => json([{ lat: '41.88', lon: '-87.63', type: 'building' }]))
  got = []
  await geocode.geocodeBatch([{ key: 'k3', query: '233 S Wacker' }], {
    provider: 'osm', signal: new AbortController().signal, onProgress: () => {}, onResult: (o) => got.push(o),
  })
  eq('nominatim parsed', [got[0].hit.lat, got[0].hit.lon], [41.88, -87.63])

  // Auto chain: photon leads because it is the only key-less provider that can name a building.
  geocode.clearGeocodeCache()
  calls.length = 0
  stub((url) => {
    if (url.includes('census')) return json({ result: { addressMatches: [] } })
    if (url.includes('photon')) return json({ features: [{ geometry: { coordinates: [-80.8, 35.2] }, properties: {} }] })
    return json([])
  })
  got = []
  await geocode.geocodeBatch([{ key: 'k4', query: '4400 Sharon Rd' }], {
    provider: 'auto', signal: new AbortController().signal, onProgress: () => {}, onResult: (o) => got.push(o),
  })
  eq('auto falls through to photon', [got[0].hit.lat, got[0].hit.lon], [35.2, -80.8])
  truthy('auto tries photon first', calls[0].includes('photon'), calls.join(' | '))

  // Every provider fails.
  geocode.clearGeocodeCache()
  stub(() => json({ result: { addressMatches: [] } }))
  got = []
  await geocode.geocodeBatch([{ key: 'k5', query: 'nowhere' }], {
    provider: 'census', signal: new AbortController().signal, onProgress: () => {}, onResult: (o) => got.push(o),
  })
  eq('miss reports no hit', got[0].hit, null)
  truthy('miss carries a reason', got[0].error.length > 0, got[0].error)

  // Network error surfaces a readable message.
  geocode.clearGeocodeCache()
  window.fetch = async () => { throw new TypeError('Failed to fetch') }
  got = []
  await geocode.geocodeBatch([{ key: 'k6', query: 'blocked' }], {
    provider: 'census', signal: new AbortController().signal, onProgress: () => {}, onResult: (o) => got.push(o),
  })
  eq('blocked network message', got[0].error, 'Network blocked or offline')

  // ------------------------------------------- precision, and who may claim a building
  eq('osm building way is rooftop', geocode.osmPrecision('building', 'yes'), 'rooftop')
  eq('osm place=house is rooftop', geocode.osmPrecision('place', 'house'), 'rooftop')
  eq('photon house is rooftop', geocode.osmPrecision('', '', 'house'), 'rooftop')
  eq('osm housenumber is a parcel point', geocode.osmPrecision('addr', 'housenumber'), 'parcel')
  eq('osm street is approximate', geocode.osmPrecision('highway', 'residential'), 'approximate')
  eq('osm clinic is a parcel point', geocode.osmPrecision('healthcare', 'clinic'), 'parcel')
  eq('unknown osm tags are approximate', geocode.osmPrecision('boundary', 'administrative'), 'approximate')

  eq('google ROOFTOP', geocode.googlePrecision('ROOFTOP'), 'rooftop')
  eq('google RANGE_INTERPOLATED', geocode.googlePrecision('RANGE_INTERPOLATED'), 'interpolated')
  eq('google GEOMETRIC_CENTER', geocode.googlePrecision('GEOMETRIC_CENTER'), 'parcel')
  eq('google APPROXIMATE', geocode.googlePrecision('APPROXIMATE'), 'approximate')
  eq('google blank precision', geocode.googlePrecision(''), 'approximate')

  truthy('rooftop may claim a building', geocode.isBuildingGrade('rooftop'))
  truthy('a parcel point may not claim a building', !geocode.isBuildingGrade('parcel'))
  truthy('an interpolation may not claim a building', !geocode.isBuildingGrade('interpolated'))
  truthy('an approximation may not claim a building', !geocode.isBuildingGrade('approximate'))

  // The Census is always an interpolation. Labelling it rooftop is what named wrong buildings.
  geocode.clearGeocodeCache()
  stub(() => json({ result: { addressMatches: [{ coordinates: { x: -118.25, y: 34.05 } }] } }))
  got = []
  await geocode.geocodeBatch([{ key: 'p1', query: '515 S Flower St' }], {
    provider: 'census', signal: new AbortController().signal, onProgress: () => {}, onResult: (o) => got.push(o),
  })
  eq('census reports an interpolation', got[0].hit.precision, 'interpolated')
  truthy('census may not claim a building', !geocode.isBuildingGrade(got[0].hit.precision))

  geocode.clearGeocodeCache()
  stub(() => json({ features: [{ geometry: { coordinates: [-97.74, 30.26] }, properties: { type: 'house', osm_key: 'building', osm_value: 'yes' } }] }))
  got = []
  await geocode.geocodeBatch([{ key: 'p2', query: '1 A St' }], {
    provider: 'photon', signal: new AbortController().signal, onProgress: () => {}, onResult: (o) => got.push(o),
  })
  eq('photon building match is rooftop', got[0].hit.precision, 'rooftop')

  // Best precision wins, not first answer. Photon has the building, so the Census is never asked.
  geocode.clearGeocodeCache()
  calls.length = 0
  stub((url) => {
    if (url.includes('photon')) return json({ features: [{ geometry: { coordinates: [-71.086, 42.3656] }, properties: { type: 'house' } }] })
    if (url.includes('census')) return json({ result: { addressMatches: [{ coordinates: { x: -71.09, y: 42.37 } }] } })
    return json([])
  })
  got = []
  await geocode.geocodeBatch([{ key: 'p3', query: '500 Kendall St' }], {
    provider: 'auto', signal: new AbortController().signal, onProgress: () => {}, onResult: (o) => got.push(o),
  })
  eq('the rooftop answer is kept', [got[0].hit.lat, got[0].hit.precision], [42.3656, 'rooftop'])
  truthy('a rooftop hit stops the chain', calls.every((u) => !u.includes('census')), calls.join(' | '))

  // Photon only has the street, so the Census interpolation is the better of the two.
  geocode.clearGeocodeCache()
  calls.length = 0
  stub((url) => {
    if (url.includes('photon')) return json({ features: [{ geometry: { coordinates: [-71.1, 42.4] }, properties: { type: 'street', osm_key: 'highway' } }] })
    if (url.includes('census')) return json({ result: { addressMatches: [{ coordinates: { x: -71.09, y: 42.37 } }] } })
    return json([])
  })
  got = []
  await geocode.geocodeBatch([{ key: 'p4', query: '500 Kendall St' }], {
    provider: 'auto', signal: new AbortController().signal, onProgress: () => {}, onResult: (o) => got.push(o),
  })
  eq('a street match loses to an interpolation', [got[0].hit.lat, got[0].hit.precision], [42.37, 'interpolated'])
  truthy('a weak first answer does not stop the chain', calls.some((u) => u.includes('census')), calls.join(' | '))

  // A v2 cache entry predates precision, so it must not be trusted with a building.
  geocode.clearGeocodeCache()
  geocode.putCached('legacy', { lat: 34.05, lon: -118.25, accuracy: 'Rooftop / street match', provider: 'US Census' })
  eq('a precision-less cache entry reads as approximate', geocode.getCached('legacy').precision, 'approximate')
  truthy('a legacy cache entry may not claim a building',
    !geocode.isBuildingGrade(geocode.getCached('legacy').precision))

  // ------------------------------------------------------- Google, behind a key
  eq('the chain skips google with no key', geocode.chainFor('auto', false), ['photon', 'census', 'osm'])
  eq('the chain leads with google when keyed', geocode.chainFor('auto', true), ['google', 'photon', 'census', 'osm'])
  eq('a named provider is used alone', geocode.chainFor('photon', true), ['photon'])
  eq('the picker hides google with no key',
    geocode.availableProviders(false).some((p) => p.id === 'google'), false)
  eq('the picker offers google when keyed',
    geocode.availableProviders(true).some((p) => p.id === 'google'), true)

  const gRooftop = geocode.parseGoogleResponse({
    status: 'OK',
    results: [{ geometry: { location: { lat: 42.3656, lng: -71.086 }, location_type: 'ROOFTOP' }, place_id: 'PLACE_A' }],
  })
  eq('google rooftop parsed', [gRooftop.lat, gRooftop.lon, gRooftop.precision, gRooftop.placeId],
    [42.3656, -71.086, 'rooftop', 'PLACE_A'])
  eq('google interpolation parsed', geocode.parseGoogleResponse({
    status: 'OK',
    results: [{ geometry: { location: { lat: 1, lng: 2 }, location_type: 'RANGE_INTERPOLATED' }, place_id: 'P' }],
  }).precision, 'interpolated')
  // A partial match resolved something other than the address asked for.
  eq('a google partial match is downgraded', geocode.parseGoogleResponse({
    status: 'OK',
    results: [{ geometry: { location: { lat: 1, lng: 2 }, location_type: 'ROOFTOP' }, place_id: 'P', partial_match: true }],
  }).precision, 'approximate')
  eq('google zero results is not an error', geocode.parseGoogleResponse({ status: 'ZERO_RESULTS', results: [] }), null)
  truthy('a denied google key raises', (() => {
    try {
      geocode.parseGoogleResponse({ status: 'REQUEST_DENIED', error_message: 'API keys with referer restrictions' })
      return false
    } catch (err) {
      return /referer/.test(err.message)
    }
  })())

  googleMaps.setGoogleKey('AIzaTESTKEYTESTKEYTESTKEY0123')
  truthy('a saved key is reported present', googleMaps.hasGoogleKey())
  geocode.clearGeocodeCache()
  calls.length = 0
  stub((url) => {
    if (url.includes('googleapis')) return json({
      status: 'OK',
      results: [{ geometry: { location: { lat: 32.88, lng: -117.23 }, location_type: 'ROOFTOP' }, place_id: 'PLACE_B' }],
    })
    return json({})
  })
  got = []
  await geocode.geocodeBatch([{ key: 'g1', query: '10996 Torreyana Rd' }], {
    provider: 'auto', signal: new AbortController().signal, onProgress: () => {}, onResult: (o) => got.push(o),
  })
  eq('google leads and answers', [got[0].hit.provider, got[0].hit.precision, got[0].hit.placeId],
    ['Google', 'rooftop', 'PLACE_B'])
  truthy('the key is sent to google', calls[0].includes('key=AIzaTESTKEYTESTKEYTESTKEY0123'), calls[0])
  eq('the place id survives the cache', geocode.getCached('g1').placeId, 'PLACE_B')

  truthy('a key is recognised', googleMaps.looksLikeGoogleKey('AIzaSyB-1234567890abcdefghijklmno'))
  truthy('a URL is not a key', !googleMaps.looksLikeGoogleKey('https://maps.googleapis.com/?key=abc'))
  truthy('a quoted paste is not a key', !googleMaps.looksLikeGoogleKey('"AIzaSyB-1234567890abcdefghij"'))
  truthy('something short is not a key', !googleMaps.looksLikeGoogleKey('AIza'))
  const jsUrl = googleMaps.mapsJsUrl('KEY123')
  truthy('the maps js url carries the key, channel and libraries',
    jsUrl.includes('key=KEY123') && jsUrl.includes('v=beta') && jsUrl.includes('maps3d') && jsUrl.includes('loading=async'),
    jsUrl)

  googleMaps.setGoogleKey('')
  truthy('removing the key clears it', !googleMaps.hasGoogleKey())
  eq('and the chain drops google again', geocode.chainFor('auto'), ['photon', 'census', 'osm'])

  // ------------------------------------------- precision on deals and sites
  const precDeals = [
    { ...withCoords[0], lat: 42.3656, lon: -71.086, geoPrecision: 'interpolated', placeId: '' },
    { ...withCoords[1], lat: 42.3656, lon: -71.086, geoPrecision: 'rooftop', placeId: 'PLACE_C' },
  ]
  const precSite = normalize.buildSites(precDeals)[0]
  eq('a site takes the best precision of its deals', precSite.precision, 'rooftop')
  eq('a site carries the place id', precSite.placeId, 'PLACE_C')
  eq('a site of interpolations stays interpolated',
    normalize.buildSites([precDeals[0]])[0].precision, 'interpolated')
  eq('coordinates typed into the sheet count as rooftop',
    normalize.normalizeDeals(
      { fileName: 'c.csv', sheetName: 'S', sheetNames: ['S'], headers: ['Address', 'Size', 'Rate', 'Latitude', 'Longitude'],
        rows: [{ Address: '1 A St', Size: '1000', Rate: '$10', Latitude: '42.3656', Longitude: '-71.086' }] },
      fields.autoMapColumns(['Address', 'Size', 'Rate', 'Latitude', 'Longitude']),
    )[0].geoPrecision,
    'rooftop')

  // ------------------------------- resolving a click on the Google 3D engine
  const clickSites = [
    { ...precSite, id: 'a', lat: 42.3656, lon: -71.086, placeId: 'PLACE_A' },
    { ...precSite, id: 'b', lat: 42.3700, lon: -71.0800, placeId: 'PLACE_B' },
  ]
  eq('a place id resolves the comp exactly',
    google3d.siteForClick(clickSites, 'PLACE_B', { lat: 42.3656, lng: -71.086 })?.id, 'b')
  eq('with no place id the nearest comp answers',
    google3d.siteForClick(clickSites, '', { lat: 42.36565, lng: -71.0861 })?.id, 'a')
  eq('an unknown place id falls back to proximity',
    google3d.siteForClick(clickSites, 'PLACE_UNKNOWN', { lat: 42.36565, lng: -71.0861 })?.id, 'a')
  eq('a click far from every comp opens nothing',
    google3d.siteForClick(clickSites, '', { lat: 42.5, lng: -71.5 }), null)
  eq('a click with no position and no place id opens nothing',
    google3d.siteForClick(clickSites, '', null), null)
  eq('the tolerance is respected',
    google3d.siteForClick(clickSites, '', { lat: 42.3656, lng: -71.086 }, 0.5)?.id, 'a')

  window.fetch = realFetch
  geocode.clearGeocodeCache()

  return out
})

let failed = 0
for (const r of results) {
  if (!r.ok) {
    failed++
    console.log(`FAIL  ${r.name} — ${r.detail}`)
  }
}
console.log(`\n${results.length} assertions, ${failed} failed`)
await browser.close()
process.exit(failed ? 1 : 0)
