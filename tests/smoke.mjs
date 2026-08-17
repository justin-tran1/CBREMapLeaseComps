import { chromium } from 'playwright'

const BASE = 'http://localhost:4173/'

const errors = []
const failures = []

function check(name, ok, detail = '') {
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`
  console.log(line)
  if (!ok) failures.push(name + (detail ? `: ${detail}` : ''))
}

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
)
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } })

page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

// Block outbound tile/geocode requests fast so the sandbox does not stall on them.
await page.route('**://*.{basemaps.cartocdn.com,tile.openstreetmap.org,server.arcgisonline.com}/**', (r) => r.abort())
await page.route('**://{geocoding.geo.census.gov,photon.komoot.io,nominatim.openstreetmap.org}/**', (r) => r.abort())

await page.goto(BASE, { waitUntil: 'networkidle' })

// ---------------------------------------------------------------- 1. upload
check('upload screen renders', await page.getByRole('heading', { name: 'Map a lease comp set' }).isVisible())
await page.getByRole('button', { name: 'Load sample data' }).click()

await page.getByRole('heading', { name: 'Location' }).waitFor({ timeout: 8000 })
check('column mapper opens', await page.locator('.mapper__bar').isVisible())

const rowText = await page.locator('.mapper__bar .card__subtitle').innerText()
check('50 rows parsed', rowText.includes('50 rows'), rowText)

// Auto-detection of the tricky columns.
const mapped = async (id) => page.locator(`#map-${id}`).inputValue()
check('address auto-mapped', (await mapped('address')) === 'Property Address', await mapped('address'))
check('area auto-mapped', (await mapped('areaLeased')) === 'Area Leased (SF)', await mapped('areaLeased'))
check('base rent auto-mapped', (await mapped('baseRent')) === 'Base Rent ($/SF/Yr)', await mapped('baseRent'))
check('opex auto-mapped', (await mapped('opex')) === 'OpEx ($/SF/Yr)', await mapped('opex'))
check('lease date auto-mapped', (await mapped('leaseDate')) === 'Lease Date', await mapped('leaseDate'))
check('execution date auto-mapped', (await mapped('executionDate')) === 'Execution Date', await mapped('executionDate'))
check('term auto-mapped', (await mapped('termMonths')) === 'Term (Months)', await mapped('termMonths'))
check('escalation auto-mapped', (await mapped('escalation')) === 'Annual Escalation', await mapped('escalation'))
check('escalation type auto-mapped', (await mapped('escalationType')) === 'Escalation Type', await mapped('escalationType'))
check('escalation rate auto-mapped', (await mapped('escalationRate')) === 'Escalation Rate', await mapped('escalationRate'))
check('free rent auto-mapped', (await mapped('freeRent')) === 'Free Rent (Months)', await mapped('freeRent'))
check('TI auto-mapped', (await mapped('tiAllowance')) === 'TI Allowance ($/SF)', await mapped('tiAllowance'))
check('lessor auto-mapped', (await mapped('lessor')) === 'Lessor', await mapped('lessor'))
check('lessee auto-mapped', (await mapped('lessee')) === 'Lessee', await mapped('lessee'))
check('subtype auto-mapped', (await mapped('propertySubtype')) === 'Property Subtype', await mapped('propertySubtype'))
check('rate type auto-mapped', (await mapped('rateType')) === 'Rate Type', await mapped('rateType'))
check('lease type auto-mapped', (await mapped('leaseType')) === 'Lease Type', await mapped('leaseType'))
check('lat auto-mapped', (await mapped('latitude')) === 'Latitude', await mapped('latitude'))
check('lon auto-mapped', (await mapped('longitude')) === 'Longitude', await mapped('longitude'))
check('lessor broker auto-mapped', (await mapped('lessorBroker')) === 'Lessor Broker', await mapped('lessorBroker'))
check('notes auto-mapped', (await mapped('notes')) === 'Comments', await mapped('notes'))


// ------------------------------------------------------------------ 2. map
await page.getByRole('button', { name: 'Continue' }).click()
await page.locator('.mapcanvas').waitFor({ timeout: 8000 })
await page.waitForTimeout(1200)

const pins = page.locator('.leaflet-marker-pane .pin-wrap')
const pinCount = await pins.count()
check('markers rendered', pinCount === 30, `${pinCount} pins (expected 30 unique addresses)`)

check('all rows located', (await page.locator('.geobar').innerText()).includes('All 50 rows are on the map'))

// ------------------------------------------------------- 3. popup, one deal
// Find a single-deal pin (no count text) and a multi-deal pin.
const single = page.locator('.leaflet-marker-pane .pin-wrap').filter({ hasNot: page.locator('text=/^[0-9]+$/') })
let singleIdx = -1
let multiIdx = -1
for (let i = 0; i < pinCount; i++) {
  const html = await pins.nth(i).innerHTML()
  const hasCount = html.includes('pin__count')
  if (hasCount && multiIdx === -1) multiIdx = i
  if (!hasCount && singleIdx === -1) singleIdx = i
  if (multiIdx >= 0 && singleIdx >= 0) break
}
check('found a single-deal pin', singleIdx >= 0)
check('found a multi-deal pin', multiIdx >= 0)

await pins.nth(singleIdx).dispatchEvent('click')
await page.locator('.leaflet-popup .pop').waitFor({ timeout: 5000 })
const keys = await page.locator('.leaflet-popup .pop__key').allInnerTexts()
const expectedOrder = [
  'Lease date', 'Term length', 'Execution date', 'Lease type', 'Property subtype', 'Rate type',
  'Area leased', 'Floor', 'Suite', 'Base rent', 'OpEx', 'Escalation', 'Free rent', 'TI allowance',
  'Lessor', 'Lessee', 'Brokers',
]
check('popup field order exact', JSON.stringify(keys) === JSON.stringify(expectedOrder), keys.join(' | '))

const vals = await page.locator('.leaflet-popup .pop__val').allInnerTexts()
const asObj = Object.fromEntries(keys.map((k, i) => [k, vals[i]]))
check('base rent formatted', /^\$[\d,]+\.\d{2} \/SF\/(Yr|Mo)$/.test(asObj['Base rent']), asObj['Base rent'])
check('area formatted', /^[\d,]+ SF$/.test(asObj['Area leased']), asObj['Area leased'])
check('term formatted', /mos/.test(asObj['Term length']), asObj['Term length'])
check('lease date formatted', /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/.test(asObj['Lease date']), asObj['Lease date'])
check('escalation populated', asObj['Escalation'].length > 1 && asObj['Escalation'] !== '—', asObj['Escalation'])
check('lessor populated', asObj['Lessor'] !== '—', asObj['Lessor'])

// ---------------------------------------------------- 4. multi-deal picker
await page.keyboard.press('Escape')
await page.locator('.leaflet-popup-close-button').click().catch(() => {})
await page.waitForTimeout(300)
await pins.nth(multiIdx).dispatchEvent('click')
await page.locator('.leaflet-popup .pop').waitFor({ timeout: 5000 })
const pickItems = page.locator('.pop__pickitem')
const pickCount = await pickItems.count()
check('deal picker shown first for multi-deal address', pickCount > 1, `${pickCount} choices`)
check('no field rows until a deal is chosen', (await page.locator('.pop__key').count()) === 0)

await pickItems.first().click()
await page.locator('.pop__key').first().waitFor({ timeout: 4000 })
check('picking a deal shows its terms', (await page.locator('.pop__key').count()) === 17)
check('back link present', await page.locator('.pop__back').isVisible())
const footer = await page.locator('.pop__footer span').first().innerText()
check('deal counter shown', /Deal 1 of \d+/.test(footer), footer)

await page.locator('.pop__navbtn').nth(1).click()
await page.waitForTimeout(250)
check('next deal navigation works', /Deal 2 of \d+/.test(await page.locator('.pop__footer span').first().innerText()))
await page.locator('.pop__back').click()
await page.waitForTimeout(200)
check('back returns to picker', (await page.locator('.pop__pickitem').count()) === pickCount)

// -------------------------------------------------------------- 5. search
await page.locator('.leaflet-popup-close-button').click().catch(() => {})
await page.waitForTimeout(200)
await page.getByPlaceholder('Jump to a property, tenant or address').fill('willis')
await page.waitForTimeout(350)
const results = page.locator('.mapsearch__item')
check('map search finds a property', (await results.count()) >= 1, `${await results.count()} results`)
await results.first().click()
await page.waitForTimeout(1200)
check('search opens the property popup', await page.locator('.leaflet-popup .pop__title').isVisible())
check('search jumped to the right property', (await page.locator('.pop__title').innerText()).includes('Willis'))

// ------------------------------------------------------------- 6. basemaps
await page.locator('.leaflet-popup-close-button').click().catch(() => {})
await page.locator('.basemap .maptool').click()
await page.waitForTimeout(200)
const options = page.locator('.basemap__option')
check('basemap switcher lists 7 options', (await options.count()) === 7, `${await options.count()}`)
await page.locator('.basemap__option', { hasText: 'Topographic' }).click()
await page.waitForTimeout(400)
check('basemap label updated', (await page.locator('.basemap .maptool').innerText()).includes('Topographic'))

await page.locator('.basemap .maptool').click()
await page.locator('.basemap__option', { hasText: 'Satellite + labels' }).click()
await page.waitForTimeout(500)
const tileLayers = await page.locator('.leaflet-tile-pane .leaflet-layer').count()
check('hybrid adds a label overlay layer', tileLayers === 2, `${tileLayers} tile layers`)

// -------------------------------------------------------------- 7. filters
async function openSection(bodyId, name) {
  const btn = page.locator(`.fsection__btn[aria-controls="${bodyId}"]`)
  if ((await btn.getAttribute('aria-expanded')) !== 'true') {
    await btn.click()
    await page.waitForTimeout(150)
  }
  return name
}
await openSection('fsection-city')
const cityBox = page.locator('#fsection-city .optionlist__item', { hasText: 'Chicago' })
await cityBox.locator('input').check()
await page.waitForTimeout(500)
const matchLine = await page.locator('.rail__scroll .small.muted').first().innerText()
check('city filter narrows the set', /^\d+ of 50 deals match/.test(matchLine.replace(/\s+/g, ' ')), matchLine.replace(/\s+/g, ' '))
const pinsAfter = await page.locator('.leaflet-marker-pane .pin-wrap').count()
check('map reflects the city filter', pinsAfter === 3, `${pinsAfter} pins for Chicago (expected 3)`)
check('filter chip appears', await page.locator('.chip', { hasText: 'City: Chicago' }).isVisible())

// Numeric range
await openSection('fsection-area-leased-sf')
await page.locator('#fsection-area-leased-sf input[aria-label="Minimum"]').fill('20000')
await page.waitForTimeout(700)
check('area range chip appears', await page.locator('.chip', { hasText: 'Area:' }).isVisible())
const afterArea = (await page.locator('.rail__scroll .small.muted').first().innerText()).replace(/\s+/g, ' ')
// Chicago has 4 deals: 12,400 / 18,700 / 26,500 / 26,500 SF. A 20,000 floor must leave 2.
check('area range narrows further', afterArea.startsWith('2 of 50'), afterArea)

// Lease-type filter
await openSection('fsection-lease-type')
const leaseTypeOpts = await page.locator('#fsection-lease-type .optionlist__item').count()
check('lease type options listed', leaseTypeOpts > 0, `${leaseTypeOpts}`)

await page.getByRole('button', { name: 'Clear all filters' }).click()
await page.waitForTimeout(500)
check('clear all restores every row', (await page.locator('.rail__scroll .small.muted').first().innerText()).includes('50 of 50'))
check('all pins back', (await page.locator('.leaflet-marker-pane .pin-wrap').count()) === 30)

// --------------------------------------------------------------- 8. drawing
await page.getByRole('button', { name: 'Rectangle' }).click()
await page.waitForTimeout(250)
check('draw hint shown', await page.locator('.map-hint').isVisible())

const canvasBox = await page.locator('.mapcanvas').boundingBox()
await page.mouse.move(canvasBox.x + 500, canvasBox.y + 300)
await page.mouse.down()
await page.mouse.move(canvasBox.x + 900, canvasBox.y + 600, { steps: 12 })
await page.mouse.up()
await page.waitForTimeout(600)
check('rectangle committed as a filter', await page.locator('.chip', { hasText: 'Drawn area' }).isVisible())
const drawnPins = await page.locator('.leaflet-marker-pane .pin-wrap').count()
check('drawn area filters the pins', drawnPins > 0 && drawnPins < 30, `${drawnPins} pins inside`)
check('drawn shape rendered', (await page.locator('.leaflet-overlay-pane path').count()) >= 1)

await page.getByRole('button', { name: 'Clear drawn area' }).click()
await page.waitForTimeout(400)
check('clearing the drawn area restores pins', (await page.locator('.leaflet-marker-pane .pin-wrap').count()) === 30)

// Polygon
await page.getByRole('button', { name: 'Draw area' }).click()
await page.waitForTimeout(200)
await page.mouse.click(canvasBox.x + 400, canvasBox.y + 250)
await page.mouse.click(canvasBox.x + 900, canvasBox.y + 250)
await page.mouse.click(canvasBox.x + 900, canvasBox.y + 650)
await page.mouse.click(canvasBox.x + 400, canvasBox.y + 650)
await page.keyboard.press('Enter')
await page.waitForTimeout(600)
check('polygon committed', await page.locator('.chip', { hasText: 'Drawn area' }).isVisible())
const polyPins = await page.locator('.leaflet-marker-pane .pin-wrap').count()
check('polygon filters the pins', polyPins > 0 && polyPins < 30, `${polyPins} pins inside`)

// Escape cancels
await page.getByRole('button', { name: 'Radius' }).click()
await page.waitForTimeout(200)
await page.keyboard.press('Escape')
await page.waitForTimeout(250)
check('escape cancels drawing', !(await page.locator('.map-hint').isVisible()))

await page.getByRole('button', { name: 'Clear all filters' }).click()
await page.waitForTimeout(400)

// ------------------------------------------------------------ 9. dashboard
await page.getByRole('tab', { name: 'Dashboard' }).click()
await page.waitForTimeout(1400)
check('dashboard renders', await page.getByRole('heading', { name: 'Lease comp dashboard' }).isVisible())
const kpiCount = await page.locator('.kpi').count()
check('six KPI tiles', kpiCount === 6, `${kpiCount}`)
const kpiValues = await page.locator('.kpi__value').allInnerTexts()
check('KPI values populated', kpiValues.every((v) => v.trim() && v !== '—'), kpiValues.join(' | '))

const charts = await page.locator('.chart').count()
check('eight charts rendered', charts === 8, `${charts}`)
const emptyCharts = await page.locator('.chart__empty').count()
check('no chart is empty with sample data', emptyCharts === 0, `${emptyCharts} empty`)
const svgs = await page.locator('.chart .recharts-surface').count()
check('recharts surfaces present', svgs === 8, `${svgs}`)

// dashboard shares the same filter rail
await page.locator('#fsection-city .optionlist__item', { hasText: 'Dallas' }).locator('input').check()
await page.waitForTimeout(700)
check('dashboard responds to the shared filters', (await page.locator('.dash__sub').innerText()).match(/^(\d+) of 50 deals/)[1] !== '50')
check('dashboard shows the filter chip', await page.locator('.dash .chip', { hasText: 'City: Dallas' }).isVisible())
await page.getByRole('button', { name: 'Clear all filters' }).first().click()
await page.waitForTimeout(500)

// ---------------------------------------------------------------- 10. table
const tableRows = await page.locator('.dtable tbody tr').count()
check('data table paginates at 50', tableRows === 50, `${tableRows}`)
await page.locator('.dtable th', { hasText: 'Area leased' }).locator('button').click()
await page.waitForTimeout(400)
const areas = await page.locator('.dtable tbody tr td:nth-child(13)').allInnerTexts()
const nums = areas.map((a) => Number(a.replace(/[^\d]/g, ''))).filter((n) => n > 0)
check('table sorts descending by area', nums.every((n, i) => i === 0 || nums[i - 1] >= n), nums.slice(0, 5).join(','))

// map jump from the table
await page.locator('.dtable tbody tr').first().locator('.linkbtn').click()
await page.waitForTimeout(1500)
check('table jumps back to the map', await page.locator('.mapcanvas').isVisible())
check('jump opens the deal popup', await page.locator('.leaflet-popup .pop__key').first().isVisible())

// ----------------------------------------------------------- 11. dark theme
await page.getByRole('button', { name: 'Switch to dark theme' }).click()
await page.waitForTimeout(500)
check('dark theme applied', (await page.locator('html').getAttribute('data-theme')) === 'dark')
await page.getByRole('tab', { name: 'Dashboard' }).click()
await page.waitForTimeout(1200)

// map keeps its state across tab switches
await page.getByRole('tab', { name: 'Map' }).click()
await page.waitForTimeout(600)
check('map still mounted after tab round trip', (await page.locator('.leaflet-marker-pane .pin-wrap').count()) === 30)

// --------------------------------------------------------------- 12. errors
const realErrors = errors.filter(
  (e) => !/net::ERR|Failed to load resource|ERR_FAILED|ERR_BLOCKED/i.test(e),
)
check('no console errors', realErrors.length === 0, realErrors.slice(0, 5).join(' || '))

console.log(`\n${failures.length === 0 ? 'ALL CHECKS PASSED' : `${failures.length} FAILURES`}`)
if (failures.length) failures.forEach((f) => console.log('  - ' + f))

await browser.close()
process.exit(failures.length ? 1 : 0)
