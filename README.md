# Lease Comp Mapper

Upload a spreadsheet of lease comparables. Every address lands on a map you can click
through deal by deal, and the same rows drive a dashboard with the filters an analysis
needs. The tool runs entirely in the browser. No file, address, or deal term leaves the
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

The **Load sample data** button opens a 50-row demo set across nine markets, useful for a
first look before pointing the tool at a real book.

### 2. Check the column mapping

Headers are matched to the fields the tool understands. The matcher handles the usual
dialects: `Rentable SF`, `Size (SF)`, and `Area Leased` all resolve to area leased, while
`Total Building SF` correctly does not. `Starting Base Rent` claims base rent and leaves
`Net Effective Rent` in its own field.

Every match is a dropdown, so anything the matcher gets wrong takes one click to correct.
Each field shows sample values from the column feeding it. Street address, area leased, and
base rent are required. Everything else is optional and shows as blank when absent.

Comp exports often carry several escalation columns. The tool maps three separately:

| Field | Typical column | Used for |
| --- | --- | --- |
| Escalation | `Annual Escalation`, `Rent Escalation` | The value shown in the popup |
| Escalation type | `Escalation Type` | Appended when the main column omits it |
| Escalation rate | `Escalation Rate`, `Escalation %` | Falls back here when the main column is blank |

Pick whichever column reads best for a deal summary. Columns the tool does not recognize
stay attached to their row and travel with the CSV export.

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

Click a pin to open the deal. Pins carry a count when an address holds several deals, and
clicking one of those opens a picker first. Choose a deal to see its terms, then step
between deals with the arrows in the footer or return to the list.

Each deal shows, in this order:

Lease date, term length, execution date, lease type, property subtype, rate type, area
leased, floor, suite, base rent, OpEx, escalation, free rent, TI allowance. Lessor, lessee,
associated brokers, and any notes follow underneath.

**Basemaps.** Seven options in the layer switcher: light, streets, light gray canvas,
satellite, satellite with labels, topographic, and dark.

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
gets one pin.

## Verifying a change

```bash
npm run typecheck

npm i -D playwright              # once; not a project dependency

npm run dev                      # terminal 1
npm run test:units               # terminal 2, 166 assertions

npm run build && npm run preview # terminal 1
npm run test:e2e                 # terminal 2, 79 end-to-end checks
```

`tests/units.mjs` covers value coercion, header matching, geometry, formatting, filtering,
aggregation, and the geocoding response parsers with stubbed network calls.
`tests/smoke.mjs` drives the real interface from upload through the dashboard. Neither test
contacts an external service.

## How it is built

React 19, TypeScript, and Vite. Leaflet draws the map, with the drawing tools written
against Leaflet directly rather than pulled in as a plugin, so Escape always cancels and
the map's own gestures suspend only while a shape is in flight. Recharts draws the
dashboard. SheetJS reads the workbooks.

```
src/
  lib/          parsing, coercion, header matching, geocoding, filtering, statistics
  components/   upload, column mapper, filter rail, map, popup, dashboard, table
  state/        one context holding the deals, filters, and geocoding progress
tests/          unit and end-to-end suites
```

Chart colors clear the contrast and color-vision separation gates in both light and dark
themes. Single-measure charts use one color, because color encodes nothing when every bar
measures the same thing.

## Privacy

Files are read in the browser. Nothing uploads to a server. The only outbound requests are
map tiles from CARTO, OpenStreetMap, and Esri, and geocoding lookups that send the address
text only when a sheet lacks coordinates. Geocoding results cache in browser local storage
and clear from the header bar.
