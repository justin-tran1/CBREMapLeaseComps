/**
 * The 3D building layer, asserted rather than eyeballed.
 *
 * This suite exists because the screenshots that exposed the last two building bugs could not
 * be turned into a check against the DOM: which footprints the sweep decides to colour in
 * lives entirely inside the map, so the map itself has to be asked. In development the map is
 * published on `window.__cbreMap`, and these checks read the comps layer through it.
 *
 * The fixture is the shape that broke it in the field: vector tile generators union
 * neighbouring buildings into one multi-part feature, so a single feature can carry twenty
 * footprints spread across a neighbourhood. One comp inside one part used to paint the whole
 * union green.
 *
 *   npm run dev              # in one terminal, on port 5173
 *   node tests/buildings.mjs
 *
 * Playwright is not a project dependency: npm i -D playwright geojson-vt vt-pbf
 */
import { chromium } from 'playwright'
import geojsonvt from 'geojson-vt'
import vtpbf from 'vt-pbf'

const BASE = 'http://localhost:5173/'
// 500 Kendall St in the sample data. The other Cambridge comps sit a few hundred metres away.
const COMP = { lat: 42.3656, lng: -71.086 }

const failures = []
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(name + (detail ? `: ${detail}` : ''))
}

const mLat = 1 / 111_195
const mLng = mLat / Math.cos((COMP.lat * Math.PI) / 180)

/** A square of `size` metres centred on an offset from the comp, as a ring. */
function square(eastM, northM, size) {
  const lat = COMP.lat + northM * mLat
  const lng = COMP.lng + eastM * mLng
  const hLat = (size / 2) * mLat
  const hLng = (size / 2) * mLng
  return [[
    [lng - hLng, lat - hLat],
    [lng + hLng, lat - hLat],
    [lng + hLng, lat + hLat],
    [lng - hLng, lat + hLat],
    [lng - hLng, lat - hLat],
  ]]
}

/*
 * One feature, four separate buildings. The comp stands in the first. The other three are
 * 150 m, 260 m and 380 m away and have no comp anywhere near them. Their areas are small
 * individually, so an area cap applied to the union's total is no defence: this is exactly the
 * case where a whole block lights up for one deal.
 */
const UNION_PARTS = [square(0, 0, 34), square(150, 40, 30), square(260, -60, 30), square(380, 30, 30)]

const tileIndex = geojsonvt(
  {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { render_height: 38, render_min_height: 0 },
        geometry: { type: 'MultiPolygon', coordinates: UNION_PARTS },
      },
      // A plain neighbour that shares no feature with the comp's building.
      {
        type: 'Feature',
        properties: { render_height: 24, render_min_height: 0 },
        geometry: { type: 'Polygon', coordinates: square(-90, 20, 30) },
      },
    ],
  },
  { maxZoom: 20, indexMaxZoom: 20, extent: 4096, buffer: 64 },
)

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
)
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})

await page.route('**://*.{basemaps.cartocdn.com,tile.openstreetmap.org,server.arcgisonline.com}/**', (r) => r.abort())
await page.route('**://{geocoding.geo.census.gov,photon.komoot.io,nominatim.openstreetmap.org}/**', (r) => r.abort())
await page.route('**/fonts/**', (r) => r.abort())

await page.route('**/tiles.openfreemap.org/planet*', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
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

await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.getByRole('button', { name: 'Load sample data' }).click()
await page.getByRole('heading', { name: 'Location' }).waitFor({ timeout: 15000 })
await page.getByRole('button', { name: 'Continue' }).click()
await page.locator('.mapcanvas').waitFor({ timeout: 15000 })
await page.waitForTimeout(2000)

check('the map is reachable for inspection', await page.evaluate(() => !!window.__cbreMap))

// The tilted street-level view a user actually looks at.
await page.evaluate(([lat, lng]) => {
  window.__cbreMap.jumpTo({ center: [lng, lat], zoom: 16.6, pitch: 55, bearing: 0 })
}, [COMP.lat, COMP.lng])
await page.waitForTimeout(3000)

const report = await page.evaluate(() => {
  const map = window.__cbreMap
  const canvas = map.getCanvas()
  const whole = [[0, 0], [canvas.clientWidth, canvas.clientHeight]]

  const ringArea = (ring) => {
    const R = 6371008.8
    const rad = Math.PI / 180
    let total = 0
    for (let i = 0; i < ring.length; i++) {
      const [lng1, lat1] = ring[i]
      const [lng2, lat2] = ring[(i + 1) % ring.length]
      total += (lng2 - lng1) * rad * (2 + Math.sin(lat1 * rad) + Math.sin(lat2 * rad))
    }
    return Math.abs((total * R * R) / 2)
  }

  const green = map.queryRenderedFeatures(whole, { layers: ['buildings-with-comps'] })
  const seen = new Map()
  for (const f of green) {
    const rings = f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates[0]
    const first = rings[0][0]
    seen.set(`${first[0].toFixed(5)},${first[1].toFixed(5)}`, {
      area: Math.round(ringArea(rings[0])),
      siteId: f.properties.siteId,
      height: f.properties.height,
    })
  }

  // A multi-part feature comes back once per tile, so count the polygons inside the geometry
  // rather than the results: that is what proves the union reached the client intact.
  const picked = map.queryRenderedFeatures(whole, { layers: ['buildings-pick'] })
  const widest = picked.reduce(
    (most, f) => Math.max(most, f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.length : 1),
    0,
  )

  return {
    greenParts: [...seen.values()],
    vectorResults: picked.length,
    partsInWidestFeature: widest,
  }
})

check(
  'the tiles really do deliver one feature carrying several buildings',
  report.partsInWidestFeature >= 2,
  `widest feature has ${report.partsInWidestFeature} parts across ${report.vectorResults} results`,
)
check(
  'only the comp\'s own part of the union is coloured in',
  report.greenParts.length === 1,
  `${report.greenParts.length} green: ${JSON.stringify(report.greenParts)}`,
)
if (report.greenParts.length === 1) {
  const part = report.greenParts[0]
  check('the green part is the 34 m building, not the union', part.area > 900 && part.area < 1600, `${part.area} m2`)
  check('the green part is attributed to a comp', typeof part.siteId === 'string' && part.siteId.length > 0, String(part.siteId))
  check('the highlight is lifted clear of the building it covers', part.height > 38, `${part.height} m`)
}

/*
 * The behaviour a user sees. A click on a distant part of the same union must not open the
 * comp that stands 380 m away in a different building.
 */
const clickAt = await page.evaluate(([lat, lng, mLat, mLng]) => {
  const map = window.__cbreMap
  const own = map.project([lng, lat])
  // The 150 m part: comfortably on screen, and a different building from the comp's.
  const far = map.project([lng + 150 * mLng, lat + 40 * mLat])
  // Confirm the far point is over a real building, or the click proves nothing.
  const farHasBuilding = map.queryRenderedFeatures(
    [[far.x - 3, far.y - 3], [far.x + 3, far.y + 3]],
    { layers: ['buildings-pick'] },
  ).length > 0
  return {
    own: [Math.round(own.x), Math.round(own.y)],
    far: [Math.round(far.x), Math.round(far.y)],
    farHasBuilding,
    canvas: [map.getCanvas().clientWidth, map.getCanvas().clientHeight],
  }
}, [COMP.lat, COMP.lng, mLat, mLng])

check(
  'the other building in the union is on screen and rendered',
  clickAt.farHasBuilding,
  `at ${JSON.stringify(clickAt.far)} of ${JSON.stringify(clickAt.canvas)}`,
)

const canvasBox = await page.locator('.mapcanvas').boundingBox()
await page.addStyleTag({ content: '.maplibregl-marker{pointer-events:none !important}' })
await page.waitForTimeout(400)

await page.mouse.click(canvasBox.x + clickAt.own[0], canvasBox.y + clickAt.own[1])
await page.waitForTimeout(800)
check('clicking the comp\'s building opens its deals', (await page.locator('.maplibregl-popup .pop').count()) === 1)

const closeBtn = page.locator('.maplibregl-popup-close-button')
if (await closeBtn.count()) await closeBtn.first().click()
await page.waitForTimeout(400)

await page.mouse.click(canvasBox.x + clickAt.far[0], canvasBox.y + clickAt.far[1])
await page.waitForTimeout(800)
const farPopups = await page.locator('.maplibregl-popup .pop').count()
check(
  'clicking another building in the same union opens nothing',
  farPopups === 0,
  farPopups ? await page.locator('.pop__title').first().innerText() : '',
)

// Network noise from the sandbox proxy is not the application's doing; the smoke suite
// asserts a clean console against the built app with every host routed.
const appErrors = errors.filter((e) => !/Failed to load resource|ERR_TUNNEL|ERR_/.test(e))
check('no application errors', appErrors.length === 0, appErrors.slice(0, 3).join(' | '))

await browser.close()
console.log(failures.length === 0 ? '\nALL CHECKS PASSED' : `\n${failures.length} CHECKS FAILED`)
for (const f of failures) console.log('  -', f)
process.exit(failures.length === 0 ? 0 : 1)
