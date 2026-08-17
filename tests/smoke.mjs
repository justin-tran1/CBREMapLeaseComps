/**
 * End-to-end smoke test: upload, column mapping, the 3D map, building clicks, popups,
 * search, basemaps, filters, drawing, dashboard, table, and theme.
 *
 *   npm run build && npm run preview   # in one terminal, on port 4173
 *   npm run test:e2e                   # in another
 *
 * Playwright is not a project dependency. Install it first:
 *   npm i -D playwright geojson-vt vt-pbf
 *
 * Tile and geocoding hosts are blocked during the run, so no external service is
 * contacted. Building footprints are served from a synthetic vector tile generated here,
 * which lets the click-a-building path be exercised without the real tile server.
 */
import { chromium } from 'playwright'
import geojsonvt from 'geojson-vt'
import vtpbf from 'vt-pbf'

const BASE = 'http://localhost:4173/'

// Alexandria Center at Kendall in the sample data, and a footprint drawn around it.
const FIXTURE = { name: 'Alexandria Center at Kendall', lat: 42.3656, lng: -71.086, deals: 4 }
const FOOTPRINT_DEG = 0.0005
/**
 * A second polygon, 1.3 km across, enclosing the building and two more sample addresses.
 * OpenStreetMap draws medical campuses, city blocks and land parcels exactly like this, and
 * taking one for a building is what made clicking cover far more ground than the subject
 * property. Nothing this size may become a target.
 */
const CAMPUS_DEG = 0.006

const errors = []
const failures = []

function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(name + (detail ? `: ${detail}` : ''))
}

/** Close the popup if one is open. Clicking a button that is not there just waits out a timeout. */
async function closePopup(page) {
  const close = page.locator('.maplibregl-popup-close-button')
  if (await close.count()) await close.first().click()
  await page.waitForTimeout(250)
}

// ------------------------------------------------------- synthetic building tiles

const squareRing = (deg) => [
  [
    [FIXTURE.lng - deg, FIXTURE.lat - deg],
    [FIXTURE.lng + deg, FIXTURE.lat - deg],
    [FIXTURE.lng + deg, FIXTURE.lat + deg],
    [FIXTURE.lng - deg, FIXTURE.lat + deg],
    [FIXTURE.lng - deg, FIXTURE.lat - deg],
  ],
]

const tileIndex = geojsonvt(
  {
    type: 'FeatureCollection',
    features: [
      // The campus first, so the subject building is not simply whatever answers a query first.
      {
        type: 'Feature',
        properties: { render_height: 8, render_min_height: 0 },
        geometry: { type: 'Polygon', coordinates: squareRing(CAMPUS_DEG) },
      },
      {
        type: 'Feature',
        properties: { render_height: 46, render_min_height: 0 },
        geometry: { type: 'Polygon', coordinates: squareRing(FOOTPRINT_DEG) },
      },
    ],
  },
  { maxZoom: 20, indexMaxZoom: 20, extent: 4096, buffer: 64 },
)

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
)
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } })

page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

// Raster imagery and geocoding are blocked; the map still renders its own layers.
await page.route('**://*.{basemaps.cartocdn.com,tile.openstreetmap.org,server.arcgisonline.com}/**', (r) => r.abort())
await page.route('**://{geocoding.geo.census.gov,photon.komoot.io,nominatim.openstreetmap.org}/**', (r) => r.abort())
await page.route('**/fonts/**', (r) => r.abort())

await page.route('**/tiles.openfreemap.org/planet*', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    // A fulfilled cross-origin response still needs CORS, or the browser drops it.
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({
      tilejson: '2.2.0',
      tiles: ['https://buildings.test/{z}/{x}/{y}.pbf'],
      minzoom: 0,
      maxzoom: 16,
      vector_layers: [{ id: 'building', fields: {} }],
    }),
  }),
)

await page.route('**://buildings.test/**', (route) => {
  const m = /\/(\d+)\/(\d+)\/(\d+)\.pbf/.exec(new URL(route.request().url()).pathname)
  if (!m) return route.abort()
  const tile = tileIndex.getTile(Number(m[1]), Number(m[2]), Number(m[3]))
  if (!tile) return route.fulfill({ status: 204, body: '' })
  return route.fulfill({
    status: 200,
    contentType: 'application/x-protobuf',
    headers: { 'access-control-allow-origin': '*' },
    body: Buffer.from(vtpbf.fromGeojsonVt({ building: tile }, { version: 2 })),
  })
})

await page.goto(BASE, { waitUntil: 'networkidle' })

// ---------------------------------------------------------------- 1. upload
check(
  'upload screen renders',
  await page.getByRole('heading', { name: 'Map a healthcare and life sciences comp set' }).isVisible(),
)
check('app is branded for the practice', (await page.locator('.topbar__title').innerText()).includes('Healthcare'))

await page.getByRole('button', { name: 'Load sample data' }).click()
await page.getByRole('heading', { name: 'Location' }).waitFor({ timeout: 8000 })
check('column mapper opens', await page.locator('.mapper__bar').isVisible())

const rowText = await page.locator('.mapper__bar .card__subtitle').innerText()
check('74 rows and 45 columns parsed', rowText.includes('74 rows') && rowText.includes('45 columns'), rowText)

const mapped = async (id) => page.locator(`#map-${id}`).inputValue()

// The sample's header row is the practice's own export schema, verbatim, so this doubles
// as a check that a real book auto-maps without anyone touching a dropdown.
const EXPECTED_MAPPING = {
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

let mismatched = []
for (const [field, header] of Object.entries(EXPECTED_MAPPING)) {
  const actual = await mapped(field)
  if (actual !== header) mismatched.push(`${field}: got "${actual}", want "${header}"`)
}
check(
  `all ${Object.keys(EXPECTED_MAPPING).length} export columns auto-map`,
  mismatched.length === 0,
  mismatched.slice(0, 4).join(' | '),
)

// ------------------------------------------------------------------ 2. map
await page.getByRole('button', { name: 'Continue' }).click()
await page.locator('.maplibregl-canvas').waitFor({ timeout: 12000 })
await page.waitForTimeout(2000)

const pins = page.locator('.pin-wrap')
const pinCount = await pins.count()
check('markers rendered', pinCount === 32, `${pinCount} pins (expected 32 unique addresses)`)
check('all rows located', (await page.locator('.geobar').innerText()).includes('All 74 rows are on the map'))
check('3D is on by default', (await page.locator('.maptool[aria-pressed="true"]').first().innerText()).includes('3D'))
// Without its worker MapLibre renders no vector or GeoJSON layer, so the 3D buildings and
// the drawn shape silently disappear while the raster map still looks fine.
check('maplibre worker started', page.workers().length >= 1, `${page.workers().length} workers`)

// ------------------------------------------------------- 3. popup, one deal
let singleIdx = -1
let multiIdx = -1
for (let i = 0; i < pinCount; i++) {
  const hasCount = (await pins.nth(i).innerHTML()).includes('pin__count')
  if (hasCount && multiIdx === -1) multiIdx = i
  if (!hasCount && singleIdx === -1) singleIdx = i
  if (multiIdx >= 0 && singleIdx >= 0) break
}
check('found a single-deal pin', singleIdx >= 0)
check('found a multi-deal pin', multiIdx >= 0)

await pins.nth(singleIdx).dispatchEvent('click')
await page.locator('.maplibregl-popup .pop').waitFor({ timeout: 5000 })
const keys = await page.locator('.maplibregl-popup .pop__key').allInnerTexts()
const REQUESTED_ORDER = [
  'Lease date', 'Term length', 'Execution date', 'Lease type', 'Property subtype', 'Rate type',
  'Area leased', 'Floor', 'Suite', 'Base rent', 'OpEx', 'Escalation', 'Free rent', 'TI allowance',
]
check(
  'popup opens with the requested 14 fields in order',
  JSON.stringify(keys.slice(0, REQUESTED_ORDER.length)) === JSON.stringify(REQUESTED_ORDER),
  keys.join(' | '),
)
check('parties follow the requested fields', keys.includes('Lessor') && keys.includes('Lessee') && keys.includes('Brokers'), keys.join(' | '))

const vals = await page.locator('.maplibregl-popup .pop__val').allInnerTexts()
const asObj = Object.fromEntries(keys.map((k, i) => [k, vals[i]]))
check('base rent formatted', /^\$[\d,]+\.\d{2} \/SF\/(Yr|Mo)$/.test(asObj['Base rent']), asObj['Base rent'])
check('area formatted', /^[\d,]+ SF$/.test(asObj['Area leased']), asObj['Area leased'])
check('term formatted', /mos/.test(asObj['Term length']), asObj['Term length'])
check('lease date formatted', /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/.test(asObj['Lease date']), asObj['Lease date'])
check('escalation populated', asObj['Escalation'] !== '—', asObj['Escalation'])
check('lessor populated', asObj['Lessor'] !== '—', asObj['Lessor'])

// ---------------------------------------------------- 4. multi-deal picker
await page.locator('.maplibregl-popup-close-button').click()
await page.waitForTimeout(300)
await pins.nth(multiIdx).dispatchEvent('click')
await page.locator('.maplibregl-popup .pop').waitFor({ timeout: 5000 })
const pickItems = page.locator('.pop__pickitem')
const pickCount = await pickItems.count()
check('deal picker shown first for multi-deal address', pickCount > 1, `${pickCount} choices`)
check('no field rows until a deal is chosen', (await page.locator('.pop__key').count()) === 0)

await pickItems.first().click()
await page.locator('.pop__key').first().waitFor({ timeout: 4000 })
check('picking a deal shows its terms', (await page.locator('.pop__key').count()) >= 17, `${await page.locator('.pop__key').count()} rows`)
check('back link present', await page.locator('.pop__back').isVisible())
check('deal counter shown', /Deal 1 of \d+/.test(await page.locator('.pop__footer span').first().innerText()))

await page.locator('.pop__navbtn').nth(1).click()
await page.waitForTimeout(250)
check('next deal navigation works', /Deal 2 of \d+/.test(await page.locator('.pop__footer span').first().innerText()))
await page.locator('.pop__back').click()
await page.waitForTimeout(200)
check('back returns to picker', (await page.locator('.pop__pickitem').count()) === pickCount)

// -------------------------------------------------------------- 5. search
await page.locator('.maplibregl-popup-close-button').click()
await page.waitForTimeout(200)
await page.getByPlaceholder('Jump to a property, tenant or address').fill('Alexandria')
await page.waitForTimeout(350)
const results = page.locator('.mapsearch__item')
check('map search finds a property', (await results.count()) >= 1, `${await results.count()} results`)
await results.first().click()
await page.waitForTimeout(1800)
check('search opens the property popup', await page.locator('.maplibregl-popup .pop__title').isVisible())
check(
  'search jumped to the right property',
  (await page.locator('.pop__title').innerText()).includes('Alexandria'),
)

// -------------------------------------------- 6. clicking a 3D building
// The map is now sitting over the fixture building. Make the pin click-through so the
// next click can only land on the building extrusion itself.
await page.locator('.maplibregl-popup-close-button').click()
await page.waitForTimeout(400)
check('popup closed before the building test', (await page.locator('.maplibregl-popup').count()) === 0)

// The map has flown to the fixture, so take the pin nearest the middle of the canvas.
const canvasArea = await page.locator('.mapcanvas').boundingBox()
const centreX = canvasArea.x + canvasArea.width / 2
const centreY = canvasArea.y + canvasArea.height / 2
const onScreen = []
for (let i = 0; i < (await page.locator('.pin-wrap').count()); i++) {
  const bb = await page.locator('.pin-wrap').nth(i).boundingBox()
  if (bb) onScreen.push({ bb, dist: Math.hypot(bb.x - centreX, bb.y - centreY) })
}
onScreen.sort((a, b) => a.dist - b.dist)
const markerBox = onScreen[0]?.bb
await page.addStyleTag({ content: '.maplibregl-marker{pointer-events:none !important}' })
await page.waitForTimeout(1200)

if (markerBox) {
  const pinX = markerBox.x + markerBox.width / 2
  // A pitched view draws the extrusion upward from its footprint, so aim above the pin base.
  const pinY = markerBox.y + markerBox.height - 8

  await page.mouse.click(pinX, pinY)
  await page.waitForTimeout(900)
  const opened = await page.locator('.maplibregl-popup .pop').count()
  check('clicking the building opens its deals', opened === 1, `${opened} popups`)
  if (opened) {
    check(
      'building click resolves the right property',
      (await page.locator('.pop__title').innerText()).includes(FIXTURE.name),
      await page.locator('.pop__title').innerText(),
    )
    check(
      'building click offers every deal at that address',
      (await page.locator('.pop__pickitem').count()) === FIXTURE.deals,
      `${await page.locator('.pop__pickitem').count()} of ${FIXTURE.deals}`,
    )
  }

  /*
   * The building is roughly 80 m wide, the campus polygon around it 1.3 km. This click is
   * about 190 m east of the pin: outside the building, well inside the campus, and on ground
   * the tiles say holds no building at all. Nothing may open. Two more sample addresses sit
   * inside that campus polygon and they must not turn it into a target either.
   */
  await closePopup(page)
  await page.mouse.click(pinX + 150, pinY)
  await page.waitForTimeout(800)
  const campusPopups = await page.locator('.maplibregl-popup .pop').count()
  check(
    'the campus polygon around the building is not clickable',
    campusPopups === 0,
    campusPopups ? `opened ${await page.locator('.pop__title').first().innerText()}` : '',
  )

  // And the cursor only offers a target over a building, so the campus reads as inert too.
  await page.mouse.move(pinX + 150, pinY)
  await page.waitForTimeout(300)
  const overCampus = await page.locator('.mapcanvas canvas').evaluate((c) => getComputedStyle(c).cursor)
  await page.mouse.move(pinX, pinY)
  await page.waitForTimeout(300)
  const overBuilding = await page.locator('.mapcanvas canvas').evaluate((c) => getComputedStyle(c).cursor)
  check('cursor offers a target over the building', overBuilding === 'pointer', overBuilding)
  check('cursor offers nothing over the campus polygon', overCampus !== 'pointer', overCampus)
} else {
  check('found the fixture marker', false, 'no bounding box')
}
await page.addStyleTag({ content: '.maplibregl-marker{pointer-events:auto !important}' })
await closePopup(page)

// ------------------------------------------------------------- 7. basemaps
await page.locator('.basemap .maptool').click()
await page.waitForTimeout(200)
check('basemap switcher lists 7 options', (await page.locator('.basemap__option').count()) === 7)
await page.locator('.basemap__option', { hasText: 'Topographic' }).click()
await page.waitForTimeout(900)
check('basemap label updated', (await page.locator('.basemap .maptool').innerText()).includes('Topographic'))
check('map survives a style swap', (await page.locator('.pin-wrap').count()) === 32)

// ------------------------------------------------------------ 8. 3D toggle
await page.getByRole('button', { name: /3D buildings/ }).click()
await page.waitForTimeout(900)
check('3D can be switched off', (await page.getByRole('button', { name: /3D buildings/ }).innerText()).includes('off'))
await page.getByRole('button', { name: /3D buildings/ }).click()
await page.waitForTimeout(900)
check('3D can be switched back on', (await page.getByRole('button', { name: /3D buildings/ }).innerText()).includes('on'))

// -------------------------------------------------------------- 9. filters
async function openSection(bodyId) {
  const btn = page.locator(`.fsection__btn[aria-controls="${bodyId}"]`)
  if ((await btn.getAttribute('aria-expanded')) !== 'true') {
    await btn.click()
    await page.waitForTimeout(150)
  }
}
await openSection('fsection-city')
await page.locator('#fsection-city .optionlist__item', { hasText: 'Cambridge' }).locator('input').check()
await page.waitForTimeout(600)
const matchLine = (await page.locator('.rail__scroll .small.muted').first().innerText()).replace(/\s+/g, ' ')
check('city filter narrows the set', matchLine.startsWith('9 of 74'), matchLine)
check('map reflects the city filter', (await page.locator('.pin-wrap').count()) === 3, `${await page.locator('.pin-wrap').count()} pins`)
check('filter chip appears', await page.locator('.chip', { hasText: 'City: Cambridge' }).isVisible())

await openSection('fsection-area-leased-sf')
await page.locator('#fsection-area-leased-sf input[aria-label="Minimum"]').fill('40000')
await page.waitForTimeout(700)
check('area range chip appears', await page.locator('.chip', { hasText: 'Area:' }).isVisible())
// Cambridge areas: 8.5k x2, 14.2k, 17.6k, 61k x4, 105k. A 40,000 SF floor leaves 5.
const afterArea = (await page.locator('.rail__scroll .small.muted').first().innerText()).replace(/\s+/g, ' ')
check('area range narrows further', afterArea.startsWith('5 of 74'), afterArea)

await openSection('fsection-lease-type')
check('lease type options listed', (await page.locator('#fsection-lease-type .optionlist__item').count()) > 0)

await page.getByRole('button', { name: 'Clear all filters' }).click()
await page.waitForTimeout(600)
check('clear all restores every row', (await page.locator('.rail__scroll .small.muted').first().innerText()).includes('74 of 74'))
check('all pins back', (await page.locator('.pin-wrap').count()) === 32)

/*
 * Signed Date filters on its own column. In the sample, 10 deals were signed on or after
 * 2025-01-01 while 15 commenced on or after that date, so a count of 10 is what proves the
 * filter reads Signed Date rather than the commencement date sitting next to it.
 */
await openSection('fsection-signed-date')
await page.locator('#fsection-signed-date input[aria-label="Signed date from"]').fill('2025-01-01')
await page.waitForTimeout(700)
check('signed date chip appears', await page.locator('.chip', { hasText: 'Signed date: from 2025-01-01' }).isVisible())
const afterSigned = (await page.locator('.rail__scroll .small.muted').first().innerText()).replace(/\s+/g, ' ')
check('signed date filter narrows the set', afterSigned.startsWith('10 of 74'), afterSigned)
const signedPins = await page.locator('.pin-wrap').count()
check('map reflects the signed date filter', signedPins > 0 && signedPins < 32, `${signedPins} pins`)

await page.getByRole('tab', { name: 'Dashboard' }).click()
await page.waitForTimeout(800)
check(
  'dashboard reflects the signed date filter',
  (await page.locator('.kpi__value').first().innerText()).trim() === '10',
  await page.locator('.kpi__value').first().innerText(),
)
await page.getByRole('tab', { name: 'Map' }).click()
await page.waitForTimeout(700)

/*
 * The two date filters combine rather than overwrite. Signed from 2025-01-01 keeps 10 and
 * commencing from 2025-04-01 keeps 11, but together they keep 9 — a count that matches
 * neither filter alone, so both are demonstrably applied.
 */
await openSection('fsection-lease-date')
await page.locator('#fsection-lease-date input[aria-label="Lease date from"]').fill('2025-04-01')
await page.waitForTimeout(700)
const bothDates = (await page.locator('.rail__scroll .small.muted').first().innerText()).replace(/\s+/g, ' ')
check('lease date and signed date filter together', bothDates.startsWith('9 of 74'), bothDates)
check('both date chips shown', (await page.locator('.chip', { hasText: 'date: from' }).count()) === 2)

await page.locator('.chip', { hasText: 'Lease date: from 2025-04-01' }).locator('.chip__x').click()
await page.waitForTimeout(600)
const signedOnly = (await page.locator('.rail__scroll .small.muted').first().innerText()).replace(/\s+/g, ' ')
check('clearing one date chip leaves the other', signedOnly.startsWith('10 of 74'), signedOnly)

await page.getByRole('button', { name: 'Clear all filters' }).click()
await page.waitForTimeout(600)
check('clearing all restores every row after the date filters', (await page.locator('.pin-wrap').count()) === 32)

// -------------------------------------------------------------- 10. drawing
await page.getByRole('button', { name: 'Zoom to results' }).click()
await page.waitForTimeout(1400)

const cleanCanvas = await page.locator('.mapcanvas').screenshot()
await page.getByRole('button', { name: 'Rectangle' }).click()
await page.waitForTimeout(250)
check('draw hint shown', await page.locator('.map-hint').isVisible())

const canvasBox = await page.locator('.mapcanvas').boundingBox()
await page.mouse.move(canvasBox.x + 480, canvasBox.y + 260)
await page.mouse.down()
await page.mouse.move(canvasBox.x + 980, canvasBox.y + 640, { steps: 14 })
await page.mouse.up()
await page.waitForTimeout(700)
check('rectangle committed as a filter', await page.locator('.chip', { hasText: 'Drawn area' }).isVisible())
const withShape = await page.locator('.mapcanvas').screenshot()
check('the drawn shape actually paints on the map', !withShape.equals(cleanCanvas), `${withShape.length} vs ${cleanCanvas.length} bytes`)
const drawnPins = await page.locator('.pin-wrap').count()
check('drawn area filters the pins', drawnPins > 0 && drawnPins < 32, `${drawnPins} pins inside`)
check('drawn area is measured', /sq mi|acres/.test(await page.locator('.map-status').first().innerText()))

await page.getByRole('button', { name: 'Clear drawn area' }).click()
await page.waitForTimeout(500)
check('clearing the drawn area restores pins', (await page.locator('.pin-wrap').count()) === 32)

await page.getByRole('button', { name: 'Draw area' }).click()
await page.waitForTimeout(250)
await page.mouse.click(canvasBox.x + 380, canvasBox.y + 220)
await page.mouse.click(canvasBox.x + 980, canvasBox.y + 220)
await page.mouse.click(canvasBox.x + 980, canvasBox.y + 680)
await page.mouse.click(canvasBox.x + 380, canvasBox.y + 680)
await page.keyboard.press('Enter')
await page.waitForTimeout(700)
check('polygon committed', await page.locator('.chip', { hasText: 'Drawn area' }).isVisible())
const polyPins = await page.locator('.pin-wrap').count()
check('polygon filters the pins', polyPins > 0 && polyPins < 32, `${polyPins} pins inside`)

await page.getByRole('button', { name: 'Radius' }).click()
await page.waitForTimeout(250)
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
check('escape cancels drawing', !(await page.locator('.map-hint').isVisible()))

await page.getByRole('button', { name: 'Clear all filters' }).click()
await page.waitForTimeout(500)

// ------------------------------------------------------------ 11. dashboard
await page.getByRole('tab', { name: 'Dashboard' }).click()
await page.waitForTimeout(1600)
check('dashboard renders', await page.getByRole('heading', { name: /lease comps/i }).isVisible())
check('six KPI tiles', (await page.locator('.kpi').count()) === 6)
const kpiValues = await page.locator('.kpi__value').allInnerTexts()
check('KPI values populated', kpiValues.every((v) => v.trim() && v !== '—'), kpiValues.join(' | '))
check('eight charts rendered', (await page.locator('.chart').count()) === 8)
check('no chart is empty with sample data', (await page.locator('.chart__empty').count()) === 0)
check('recharts surfaces present', (await page.locator('.chart .recharts-surface').count()) === 8)

await page.locator('#fsection-city .optionlist__item', { hasText: 'Houston' }).locator('input').check()
await page.waitForTimeout(800)
check('dashboard responds to the shared filters', (await page.locator('.dash__sub').innerText()).includes('7 of 74'))
check('dashboard shows the filter chip', await page.locator('.dash .chip', { hasText: 'City: Houston' }).isVisible())
await page.getByRole('button', { name: 'Clear all filters' }).first().click()
await page.waitForTimeout(600)

// ---------------------------------------------------------------- 12. table
check('data table paginates at 50', (await page.locator('.dtable tbody tr').count()) === 50)
await page.locator('.dtable th', { hasText: 'Area leased' }).locator('button').click()
await page.waitForTimeout(500)
const areaColumn = (await page.locator('.dtable thead th').allInnerTexts()).findIndex((t) => t.includes('Area leased')) + 1
const areas = await page.locator(`.dtable tbody tr td:nth-child(${areaColumn + 1})`).allInnerTexts()
const nums = areas.map((a) => Number(a.replace(/[^\d]/g, ''))).filter((n) => n > 0)
check('table sorts descending by area', nums.every((n, i) => i === 0 || nums[i - 1] >= n), nums.slice(0, 5).join(','))

await page.locator('.dtable tbody tr').first().locator('.linkbtn').click()
await page.waitForTimeout(2000)
check('table jumps back to the map', await page.locator('.mapcanvas').isVisible())
check('jump opens the deal popup', await page.locator('.maplibregl-popup .pop__key').first().isVisible())

// ----------------------------------------------------------- 13. dark theme
await page.getByRole('button', { name: 'Switch to dark theme' }).click()
await page.waitForTimeout(1000)
check('dark theme applied', (await page.locator('html').getAttribute('data-theme')) === 'dark')
await page.getByRole('tab', { name: 'Dashboard' }).click()
await page.waitForTimeout(1400)
check('dashboard survives the theme swap', (await page.locator('.chart .recharts-surface').count()) === 8)
await page.getByRole('tab', { name: 'Map' }).click()
await page.waitForTimeout(1200)
check('map still mounted after a tab round trip', (await page.locator('.pin-wrap').count()) === 32)

// --------------------------------------------------------------- 14. errors
const realErrors = errors.filter(
  (e) => !/net::ERR|Failed to load resource|ERR_FAILED|ERR_BLOCKED|ERR_NAME|AJAXError|Failed to fetch/i.test(e),
)
check('no console errors', realErrors.length === 0, realErrors.slice(0, 5).join(' || '))

console.log(`\n${failures.length === 0 ? 'ALL CHECKS PASSED' : `${failures.length} FAILURES`}`)
failures.forEach((f) => console.log('  - ' + f))

await browser.close()
process.exit(failures.length ? 1 : 0)
