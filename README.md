# CBRE Healthcare & Life Sciences: Market Data

Upload a spreadsheet of lease comparables. Every address lands on a 3D map you can click
through building by building, and the same rows drive a dashboard with the filters an
analysis needs. Medical office, lab, GMP manufacturing and outpatient deals all read the
same way. The tool runs entirely in the browser. No file, address, or deal term leaves the
machine it runs on.

## Running it

Node.js 20 or later:

```bash
npm install
npm run dev          # opens http://localhost:5173
```

**A single file you can email.** `npm run build:standalone` writes
`standalone/index.html`, one self-contained file carrying the whole application. Open it by
double-clicking. Copy it to a shared drive, attach it to an email, or keep it on a desktop.
It needs no install and no server. The only thing it fetches from the internet is map
imagery, plus geocoding lookups when a sheet has no coordinates.

**Hosting it on an intranet.** `npm run build` writes a normal static bundle to `dist`.
Serve that folder from any web server.

## Using it

### 1. Upload

Drop in a `.xlsx`, `.xlsm`, `.xlsb`, `.xls`, `.csv`, or `.tsv` file. The tool finds the
header row on its own, so an export with a title block or a blank spacer above the headers
still reads correctly. Workbooks with several sheets get a sheet picker.

The **Load sample data** button opens a 74-row demo set across the major healthcare and
life sciences markets: Cambridge, South San Francisco, San Diego, the Texas Medical Center,
Research Triangle Park, University City and others. Real buildings, invented deal terms. Its
header row is the practice's own export schema, verbatim, so the demo exercises the same
column names a real book uses.

### 2. Check the column mapping

Headers are matched to the fields the tool understands. The matcher handles the usual
dialects: `Rentable SF`, `Size (SF)`, and `Area Leased` all resolve to area leased, while
`Total Building SF` correctly does not. `Starting Base Rent` claims base rent and leaves
`Net Effective Rent` in its own field.

Every match is a dropdown, so anything the matcher gets wrong takes one click to correct.
Each field shows sample values from the column feeding it. Street address, area leased, and
base rent are required. Everything else is optional and shows as blank when absent.

Comp exports split escalation across several columns, usually with a zero standing in for
"not this one". All five are mapped separately and composed into the single popup row:

| Field | Typical column | How it is used |
| --- | --- | --- |
| Escalation | `Annual Escalation`, `Rent Escalation` | A descriptive column wins outright |
| Escalation percent | `Escalation Percent`, `Escalation Rate` | First fallback. A zero reads as absent |
| Escalation value | `Escalation Value`, `Escalation Amount` | Second fallback, formatted as dollars per SF |
| Escalation type | `Escalation Type` | Appended when it adds something |
| Escalation comments | `Escalation Comments` | Appended, because a stepped escalation only reads in full |

Columns the tool does not recognize stay attached to their row and travel with the CSV
export.

### The export schema it is tuned for

All 45 columns of the practice's own comp export auto-map with no dropdown touched, and a
test asserts every one of them:

`Confidentiality`, `Signed Date`, `Start Date`, `Lease Term`, `End Date`,
`Lease Transaction Type`, `Lease Type`, `Tenant`, `Property Subtype`, `Property Class`,
`Submarket`, `District`, `Property Name`, `Address`, `Floor`, `Suite`, `City`,
`Area Leased`, `Office Area (DEPRECATED)`, `Base Rent Yearly`, `Rate Type`,
`OPEX (Yearly)`, `Escalation Value`, `Escalation Percent`, `Escalation Comments`,
`Free Rent Months`, `TI Allowance`, `TIs as-is`, `TI Notes`, `Other Concessions`,
`Notes`, `Tenant Agent(s)`, `Tenant Representative`, `Listing Agent(s)`,
`Listing Representative`, `Sublessor`, `Lessor`, `Tenant NAICS Code`, `Year Built`,
`Property Type`, `Market`, `State`, `Latitude`, `Longitude`, `Comp ID`.

The near-collisions are the point. `Area Leased` and `Office Area (DEPRECATED)` stay
separate and the deprecated column is never read as the leased area. `Tenant Agent(s)`
holds the named agents while `Tenant Representative` holds their firm, and the same for the
listing side. `Sublessor` does not disturb `Lessor`. `Tenant`, `Tenant NAICS Code`,
`Tenant Agent(s)` and `Tenant Representative` all land on different fields.

### 3. Locate the addresses

Rows that already carry latitude and longitude plot immediately. Everything else is
geocoded from street address, city, state, and ZIP:

- **US Census Bureau** for United States addresses. Free, no key, no rate limit.
- **Photon** and **Nominatim**, both OpenStreetMap services, for anything the Census
  geocoder cannot match and for addresses outside the US.

The default setting tries all three in that order. Results are cached in the browser, so
re-uploading the same book costs no lookups, and deals sharing an address are looked up
once rather than once per row.

If a corporate network blocks these services, the progress bar reports it. Add `Latitude`
and `Longitude` columns to the sheet and the tool skips geocoding entirely.

## The map

The map opens tilted over aerial imagery with buildings extruded in 3D. **Buildings that
hold a deal are picked out in CBRE green; click one and its deals open.** Everything else
stays neutral grey. Buildings appear once you pass street level, which is where the
footprints exist in the underlying data.

Pins work the same way and stay visible at every zoom. Both carry a count when an address
holds several deals, and opening one of those shows a picker first. Choose a deal to see
its terms, then step between deals with the arrows in the footer or return to the list.

Drag with the right mouse button to rotate and tilt, or use the compass control. The **3D
buildings** button drops the map flat and back again.

Each deal shows, in this order:

Lease date, term length, execution date, lease type, property subtype, rate type, area
leased, floor, suite, base rent, OpEx, escalation, free rent, TI allowance. Those 14 are
fixed and in that order. TIs as-is follows the allowance it qualifies when the column is
present, then lessor, sublessor on a sublease, lessee, and the brokers. Notes, TI notes and
other concessions sit at the foot of the card, and the Comp ID is in the footer.

A deal the export marks confidential carries a red flag in the popup header and a column in
the table.

**Basemaps.** Seven options in the layer switcher: aerial (the default), aerial with
labels, light, streets, light gray canvas, topographic, and dark. Buildings extrude over
all of them.

**Search.** The box at the top left jumps to a property by name, address, tenant, lessor,
suite, or submarket. Arrow keys move through the results; Enter opens the deal. Search
moves the map, it does not filter the data.

**Draw a geography.** Three tools filter to an area traced with the cursor:

| Tool | How | Finish |
| --- | --- | --- |
| Draw area | Click each corner | Click the first point, double-click, or press Enter |
| Rectangle | Drag a box | Release the mouse |
| Radius | Drag out from the center | Release the mouse |

Backspace removes the last polygon point. Escape cancels. The shape becomes a filter chip
that applies to both tabs and clears like any other filter.

## The dashboard

The second tab reads the same filtered rows as the map.

Six measures head the page: deal count, total area leased, weighted base rent, average
term, average free rent, and average TI allowance with OpEx underneath. Eight charts
follow: leasing activity over time stacked by lease type, the base rent trend, deals by
lease type, top cities by area leased, base rent by property subtype, top lessors, and
distributions for area leased and term length. Time buckets switch between monthly,
quarterly, and yearly to suit the span in the data.

A field coverage panel shows how many rows carry a value for each field, which is usually
the answer when a chart looks thinner than expected. The table beneath lists every matching
row, sorts on any column, pages at 50 to 1,000 rows, and exports to CSV. The pin button on
a row jumps to that deal on the map.

Rent averages weight by area leased, so a 200,000 sq. ft. deal moves the average more than
a 1,200 sq. ft. suite.

## Filters

Both tabs share one filter rail:

- Keyword across every field
- City and state
- Lease date, with presets for the last 12 months, 24 months, three years, and year to date
- Area leased range
- Term length range
- Base rent range
- Free rent range
- Lease type
- Property subtype
- The drawn geography
- Mapped rows only

Option counts next to each city and lease type ignore that filter's own selection, so
ticking one city does not zero out the rest. Active filters appear as chips that clear
individually.

A range filter keeps only rows that carry a value for that measure. Blanks drop out while
the filter is on, which the field coverage panel accounts for.

## Notes on the numbers

**Mixed rate quoting.** Sheets that quote some rows monthly and others annually would
produce a meaningless average. Rows the sheet marks as monthly are multiplied by 12 before
any aggregation, and the base rent filter works on that annual figure. The popup and the
table still show each deal exactly as the sheet quotes it, alongside its rate type. The CSV
export carries both. Magnitude alone never triggers this: only an explicit monthly rate
type does.

**Term length units.** A `Term (Years)` column converts to months. A plain `Term` column is
read from the column's own distribution, since a column of 3s, 5s, and 10s means years
while a column of 36s, 60s, and 120s means months. When term is blank but commencement and
expiration are present, the term is derived from the two dates.

**Deals at one address.** Rows are grouped by street address with the suite, floor, and
unit stripped, then any groups that resolve to the same coordinates merge. One building
gets one pin, and clicking either the pin or the building reaches the same deals.

## Verifying a change

```bash
npm run typecheck

npm i -D playwright geojson-vt vt-pbf   # once; not project dependencies

npm run dev                      # terminal 1
npm run test:units               # terminal 2, 250 assertions

npm run build && npm run preview # terminal 1
npm run test:e2e                 # terminal 2, 71 end-to-end checks

npm run build:standalone
npm run test:standalone          # 9 checks against the single file, opened from disk
```

`tests/units.mjs` covers value coercion, header matching, geometry, building-footprint
containment, draw geometry, the brand palette, formatting, filtering, aggregation, and the
geocoding response parsers with stubbed network calls, and it asserts all 45 columns of the
practice's export schema land on the right field. `tests/smoke.mjs` drives the real
interface from upload through the dashboard, including a click on a 3D building, using a
synthetic vector tile generated in the test. `tests/standalone.mjs` opens the single-file
build straight off disk, which is where the browser rules on workers and origins bite
hardest. No test contacts an external service.

## How it is built

React 19, TypeScript, and Vite. MapLibre GL draws the map, with the drawing tools written
against MapLibre directly rather than pulled in as a plugin, so Escape always cancels and
the map's own gestures suspend only while a shape is in flight. Recharts draws the
dashboard. SheetJS reads the workbooks.

Building footprints and heights come from OpenStreetMap through OpenFreeMap, and aerial
imagery from Esri. Both are free and need no key. If a network blocks the building tiles
the map says so and carries on with pins, filters and the dashboard intact.

Matching a comp to its building runs per comp rather than per building: each visible deal
is projected to the screen and the footprint under that one point is queried, so the work
scales with the deals on screen instead of the buildings in view.

```
src/
  lib/          parsing, coercion, header matching, geocoding, filtering, statistics
  components/   upload, column mapper, filter rail, map, popup, dashboard, table
  state/        one context holding the deals, filters, and geocoding progress
tests/          unit and end-to-end suites
```

## Color

Every color is a CBRE 2021 brand value. Chrome uses CBRE Green, Accent Green and Dark
Green; ink, borders and surfaces come from Dark Grey, Cement and Light Grey.

Chart series use the `cbre_charts` palette. The brand guide says to assign those slots in
order, and this does, with one deliberate exception: slots 4 and 5 are swapped so accent
green and wheat never sit side by side. Measured against a color-vision simulation that
adjacency scores a separation of 1.6, meaning roughly one man in twelve cannot tell two
neighbouring stacked segments apart. Moving terracotta between them lifts the worst
adjacent pair to 14.7 and changes no color values.

The brand guide defines no dark-mode chart palette. The dark theme keeps each slot's
identity and substitutes the brand color from the same family that reads on a dark surface,
so a series holds its meaning when the theme flips. Single-measure charts use one color,
because color encodes nothing when every bar measures the same thing.

## Privacy

Files are read in the browser. Nothing uploads to a server. The only outbound requests are
map tiles from CARTO, OpenStreetMap, and Esri, and geocoding lookups that send the address
text only when a sheet lacks coordinates. Geocoding results cache in browser local storage
and clear from the header bar.
