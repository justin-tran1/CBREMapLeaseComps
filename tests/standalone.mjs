/**
 * Checks the standalone single-file build the way a user opens it: straight off disk,
 * with no server. This is the build most likely to break, because a `file://` page has an
 * opaque origin and browsers refuse to start a module worker there.
 *
 *   npm run build:standalone
 *   npm run test:standalone
 *
 * Playwright is not a project dependency. Install it first: npm i -D playwright
 * Tile hosts are blocked during the run, so no external service is contacted.
 */
import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const FILE = resolve('standalone/index.html')
const failures = []

function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(name)
}

if (!existsSync(FILE)) {
  console.error(`standalone/index.html is missing. Run: npm run build:standalone`)
  process.exit(1)
}

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
)
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } })

const errors = []
const external = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
// Map imagery and geocoding are expected to go out; nothing else should. A request for a
// bundled asset would mean the single file is not actually self-contained.
const EXPECTED_HOSTS = /carto|openstreetmap|arcgisonline|openfreemap|census\.gov|photon\.komoot/
page.on('request', (r) => {
  const url = r.url()
  const local = url.startsWith('file://') || url.startsWith('data:') || url.startsWith('blob:')
  if (!local && !EXPECTED_HOSTS.test(url)) external.push(url)
})

await page.route('**://*.{basemaps.cartocdn.com,tile.openstreetmap.org,server.arcgisonline.com,tiles.openfreemap.org}/**', (r) => r.abort())
await page.route('**://{geocoding.geo.census.gov,photon.komoot.io,nominatim.openstreetmap.org}/**', (r) => r.abort())

await page.goto(`file://${FILE}`, { waitUntil: 'load' })
check('the single file opens from disk', await page.getByRole('heading', { name: /healthcare and life sciences/i }).isVisible())

await page.getByRole('button', { name: 'Load sample data' }).click()
await page.locator('.mapper__bar').waitFor({ timeout: 15000 })
check('spreadsheet parsing works on a file:// page', (await page.locator('.mapper__bar .card__subtitle').innerText()).includes('74 rows'))

await page.getByRole('button', { name: 'Continue' }).click()
await page.locator('.maplibregl-canvas').waitFor({ timeout: 15000 })
await page.waitForTimeout(3000)

check('pins render', (await page.locator('.pin-wrap').count()) === 32, `${await page.locator('.pin-wrap').count()}`)
// A blob module worker is rejected on file://, which would take the 3D buildings and the
// drawn shape with it while leaving the rest of the map looking healthy.
check('maplibre worker started from file://', page.workers().length >= 1, `${page.workers().length} workers`)

const cleanCanvas = await page.locator('.mapcanvas').screenshot()
await page.getByRole('button', { name: 'Rectangle' }).click()
await page.waitForTimeout(250)
const box = await page.locator('.mapcanvas').boundingBox()
await page.mouse.move(box.x + 320, box.y + 220)
await page.mouse.down()
await page.mouse.move(box.x + 760, box.y + 560, { steps: 12 })
await page.mouse.up()
await page.waitForTimeout(1200)
check('drawn shape filter applies', await page.locator('.chip', { hasText: 'Drawn area' }).isVisible())
const withShape = await page.locator('.mapcanvas').screenshot()
check('drawn shape paints on the canvas', !withShape.equals(cleanCanvas))

await page.getByRole('button', { name: 'Clear all filters' }).click()
await page.waitForTimeout(400)
await page.getByRole('tab', { name: 'Dashboard' }).click()
await page.waitForTimeout(1500)
check('dashboard charts render', (await page.locator('.chart .recharts-surface').count()) === 10)

check('the file is self-contained, no asset requests', external.length === 0, external.slice(0, 3).join(' '))
const realErrors = errors.filter(
  (e) => !/net::ERR|Failed to load resource|ERR_FAILED|ERR_BLOCKED|ERR_NAME|AJAXError|Failed to fetch/i.test(e),
)
check('no console errors', realErrors.length === 0, realErrors.slice(0, 3).join(' | '))

console.log(`\n${failures.length === 0 ? 'ALL CHECKS PASSED' : `${failures.length} FAILURES`}`)
failures.forEach((f) => console.log('  - ' + f))

await browser.close()
process.exit(failures.length ? 1 : 0)
