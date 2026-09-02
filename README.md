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
geocoded from street address, city, state, and ZIP.

**Precision is recorded, not assumed**, because how precisely a row is located decides what
the map is allowed to say about it:

| Grade | What it means | May name a building |
| --- | --- | --- |
| Rooftop | The building itself | Yes |
| Address point | A point for the property | No |
| Street interpolation | Guessed from the house-number range along the street centerline | No |
| Approximate | A street, locality or postcode center | No |

The providers, in the order the automatic setting tries them:

- **Photon** (OpenStreetMap, free, no key) leads, because it names the OSM object it matched,
  so a `building` or a `place=house` match is recognisable as the building itself.
- **US Census Bureau** (free, no key, US only) follows. It walks the house-number range along
  a TIGER street centerline, so its answer always lands in the roadway: dependable for a pin,
  never precise enough to name a building.
- **Nominatim** (OpenStreetMap, free, no key) is the last resort, since its usage policy caps
  it at one lookup per second.
- **Google Geocoding** leads whenever a key is set. It is the only provider that reports
  rooftop precision explicitly, and it returns a place id.

The chain keeps the **most precise** answer rather than the first one. This matters: with the
Census leading and first-answer-wins, every US address settled for a street interpolation even
when Photon held the actual building, and that is what put comps on their neighbors' buildings.

Results are cached in the browser, so re-uploading the same book costs no lookups, and deals
sharing an address are looked up once rather than once per row.

If a corporate network blocks these services, the progress bar reports it. Add `Latitude`
and `Longitude` columns to the sheet and the tool skips geocoding entirely. Coordinates typed
into the sheet are treated as rooftop-grade, since putting them there is a deliberate
statement about the building.

### Connecting Google (optional)

Everything above works with no key and no account. The **Google** button on the map takes a
Google Maps Platform key and unlocks two things:

- **Rooftop geocoding.** Google returns `ROOFTOP` coordinates and a place id per address,
  which is what lets a comp name its building. Geocoding is an Essentials SKU: roughly $5 per
  1,000 lookups with 10,000 free a month, and a 74-row book with 32 unique addresses costs 32
  lookups, cached thereafter.
- **A photorealistic 3D engine.** Google's own 3D tiles, selectable as a map engine. This is
  an Enterprise SKU with 1,000 free map loads a month, so it is off by default.

The key is held in this browser's local storage. It is never written into the standalone file,
the build, or the repository, and it is sent nowhere except Google. Removing it drops the
Google engine and the Google geocoder immediately.

## The map

The map opens tilted over aerial imagery with buildings extruded in 3D. **Buildings that
hold a deal are picked out in CBRE green; click one and its deals open.** Everything else
stays neutral grey and is not clickable. Buildings appear once you pass street level, which
is where the footprints exist in the underlying data.

The green solid is the whole of the target: the click area is that one building's footprint
and nothing around it. Where a deal's building cannot be identified with confidence, no
building is colored in and the pin is the way to the deal, because coloring in a guess
would put the deal on a neighbor.

Pins work the same way and stay visible at every zoom. Both carry a count when an address
holds several deals, and opening one of those shows a picker first. Choose a deal to see
its terms, then step between deals with the arrows in the footer or return to the list. When
a card would run past the edge of the map, the map pans by the overrun so the whole card
stays in view.

Drag with the right mouse button to rotate and tilt, or use the compass control. The **3D
buildings** button drops the map flat and back again.

Each deal shows, in this order:

Signed date, lease date, term length, lease type, property subtype, rate type, area leased,
floor, suite, base rent, OpEx, escalation, free rent, TI allowance. Those 14 are fixed and in
that order. TIs as-is follows the allowance it qualifies when the column is
present, then lessor, sublessor on a sublease, lessee, and the brokers. Notes, TI notes and
other concessions sit at the foot of the card, and the Comp ID is in the footer.

A deal the export marks confidential carries a red flag in the popup header and a column in
the table.

**Basemaps.** Seven options in the layer switcher: aerial (the default), aerial with
labels, light, streets, light gray canvas, topographic, and dark. Buildings extrude over
all of them.

**Boundaries.** Two overlays sit under the basemap list, and either or both can be on:

| Overlay | What it draws | Appears from |
| --- | --- | --- |
| City limits | Incorporated place boundaries, dashed and thin | Zoom 12 |
| County lines | County boundaries, solid and heavier | Zoom 8 |

They come from the same OpenStreetMap vector tiles as the buildings, so switching one on costs
no new service, no key, and no request the map has not already made. They draw in violet rather
than green, because green is what a building holding a deal wears and a boundary must never be
mistaken for a comp. The choice is remembered and survives a basemap change.

Both zoom thresholds are the tiles' own: administrative levels five and six are published from
zoom 8 and level eight upwards from zoom 12, so asking earlier would draw nothing.

One subtlety is worth knowing, because it looks like a bug when a tool gets it wrong. A boundary
shared by several levels is published at the lowest level taking part, so the stretch where a
county follows a state line is tagged as a state boundary and the stretch where a city follows
the county line is tagged as a county one. Both overlays therefore take every segment *at or
below* their level, which is why the county outline stays closed along its state edge and the
city outline has no hole where it meets the county. Maritime segments are left out: they trace
the coastline out to sea, and nobody wants a county drawn around the water.

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

### The signed date section

Signing is its own question, so it has its own band rather than a relabelled copy of the
charts above: a quarter can be busy for signings and quiet for commencements, and the gap
between the two is the pipeline, which is the one thing neither date shows on its own.

Three measures: how many deals carry a signed date and the span they cover, the median time
from signing to commencement, and how many were papered after the tenant had already taken
the space. Two charts: deals signed per period stacked by lease type, and the distribution of
lead times in days. A lease signed after it commenced reads as a negative lead time and is
counted rather than hidden.

### Chart settings

The **Chart settings** button on the dashboard changes how the charts are drawn:

| Setting | Options |
| --- | --- |
| Series palette | CBRE charts, High contrast, Warm |
| Bar corners | Rounded, square |
| Trend | Line, filled |
| Grid lines | On, off |
| Height | Comfortable, compact |

Choices are saved in the browser. Nothing here can change what a chart *means*: the palettes
are fixed and ordered so a series keeps its color when the set is filtered, every multi-series
chart keeps its legend and tooltips, and there is no option for a second y-axis or a generated
hue.

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
- Signed date, the same presets on the `Signed Date` column, which drives its own dashboard
  section
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

**Lease date and signed date are separate filters** and they combine. Lease date is
commencement, the `Start Date` column. Signed date is the `Signed Date` column: it leads the
popup card, heads the table as Signed, and drives its own dashboard section. A deal signed in
one quarter routinely commences in another, so
"signed this year" and "commencing this year" are different sets: in the sample data, ten
deals were signed from January 2025 and fifteen commenced from January 2025.

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
npm run test:units               # terminal 2, 405 assertions
npm run test:map                 # terminal 2, 26 checks on the vector map layers

npm run build && npm run preview # terminal 1
npm run test:e2e                 # terminal 2, 115 end-to-end checks

npm run build:standalone
npm run test:standalone          # 9 checks against the single file, opened from disk
```

`tests/units.mjs` covers value coercion, header matching, geometry, building-footprint
containment and choice, draw geometry, the brand palette, formatting, filtering, aggregation,
geocoding precision grading, the Google response parser and place-id click resolution, and the
geocoding response parsers with stubbed network calls, and it asserts all 45 columns of the
practice's export schema land on the right field. `tests/maplayers.mjs` asks the map itself which
footprints the sweep colored in and which boundary segments the filters admitted, which the DOM
cannot show and which is where this has gone wrong before; it needs the dev server, where the map
is published on `window.__cbreMap` for exactly that purpose and nowhere else. `tests/smoke.mjs` drives the real
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
imagery from Esri. Both are free and need no key. Google is optional throughout: nothing in
the default path calls it, and no key ships in the build. If a network blocks the building tiles
the map says so and carries on with pins, filters and the dashboard intact.

Matching a comp to its building runs per comp rather than per building: each visible deal
is projected to the screen and the footprints under that one point are queried, so the work
scales with the deals on screen instead of the buildings in view.

Five rules decide which footprint a comp belongs to, and together they are what keeps the
click area on the subject building:

- **The comp's own coordinate must be rooftop-grade.** This one comes first because the other
  four cannot survive a bad coordinate: applied to a point sitting in the roadway they will
  faithfully name whichever neighbor the interpolation drifted towards. See the geocoding
  section above.
- **The query goes to a flat layer, never the 3D one.** Hit-testing an extrusion tests the
  whole solid, walls and roof included, so on a tilted map the building whose facade covers
  a pixel answers for ground it does not stand on, and the footprint genuinely under that
  ground can be hidden behind it. An invisible flat copy of the building layer answers in
  ground space, where a comp's coordinate lives. It is never drawn, only queried.
- **Only the part of a feature the comp actually stands in is used.** Vector tile generators
  union neighboring buildings into a single multi-part feature, so one feature can carry
  twenty footprints scattered across a neighborhood. Highlighting the feature highlights all
  twenty for one deal, which is what turned whole blocks green.
- **The smallest footprint containing the coordinate wins.** OpenStreetMap routinely maps a
  medical campus or a whole block as one polygon with the individual buildings nested inside
  it, and both contain the comp. The inner one is the building.
- **Nothing above 40,000 m² is accepted**, which is a 200 m square: enough for a large
  hospital podium and not for a campus or a land parcel. The test is applied to the single
  part, never to a union's total, since a union of small buildings is individually small while
  covering a neighborhood.

A footprint that fails these tests is left grey rather than approximated, and clicks only
ever go to footprints that passed. The highlight itself is grown by 35 cm and its roof lifted
by half a meter, because two solids sharing a surface exactly leave the depth buffer nothing
to decide with, and the result is grey speckling through the green.

`tests/smoke.mjs` puts a 1.3 km campus polygon around the fixture building and asserts that
ground 190 m away opens nothing. `tests/maplayers.mjs` serves a four-building union as one
feature and asserts that exactly one of them turns green and that clicking the others opens
nothing, and serves boundary segments at four administrative levels to prove each outline takes
in the segments shared with a lower level and leaves the maritime one alone.

Comps located less precisely than rooftop are reachable by their pin and color in nothing,
and the map says how many are in that state rather than leaving the absence looking like a
fault.

### The photorealistic engine

With a Google key, **Photorealistic 3D (Google)** is selectable as a second engine, and it
identifies buildings a completely different way. Google's 3D tiles are a photogrammetry mesh:
terrain, textures and buildings baked into one continuous model, with no per-building features
in it at all, so nothing can be picked out of the mesh geometrically. Instead Google reports a
**place id** for the place clicked, and the Google geocoder records a place id for every comp,
so a click is resolved by comparing two identifiers. No footprint, no polygon-size rule, no
neighbor to get wrong.

Its limits are worth stating. A comp geocoded without a key has no place id, and Google may
report a place the comp set has never heard of; both fall back to the nearest comp within 90 m
of the click, and beyond that nothing opens. The draw tools stay on the MapLibre engine, which
remains the default and needs no key, no billing, and no quota.

```
src/
  lib/          parsing, coercion, header matching, geocoding, filtering, statistics
  components/   upload, column mapper, filter rail, map, popup, dashboard, table
  state/        one context holding the deals, filters, and geocoding progress
tests/          unit and end-to-end suites
```

## Design system

The interface follows CBRE's own design files rather than an impression of them. Two sources:
the style definitions inside CBRE's corporate Word template (`CBRE_Template.docx`, read
directly from its `styles.xml`) and the brand reference that ships with it. Where the two
disagree, the template wins, because it is the artefact CBRE actually publishes with.

### The wordmark

The header carries CBRE's official wordmark, the white artwork on the CBRE Green header as
the guide requires for dark backgrounds. It is never scaled unevenly, recolored or given
effects, and it keeps clear space equal to its own height on every side. The practice name
sits beside it after a hairline rule, and no longer repeats "CBRE". The favicon is a plain
CBRE Green tile: the wordmark is illegible at 16 pixels and the guide forbids altering it, so
the tab carries the brand color and nothing invented.

### Typefaces

CBRE's system is four faces, and the licensing differs between them:

| Face | Role | Licence | How it ships here |
| --- | --- | --- | --- |
| Financier Display | Display headings | Klim, commercial | Named first in its stack; renders wherever CBRE's fonts are installed. Fallback is Georgia, the brand guide's own |
| Calibre | Interface and body | Klim, commercial | Named first in its stack. Fallback is Arial, the brand guide's own |
| Barlow Condensed | Captions, dense data | SIL Open Font License | Embedded as a Latin subset, three weights, 46 KB |
| Space Mono | Technical values | SIL Open Font License | Embedded as a Latin subset, 11 KB |

On a CBRE machine with the corporate fonts deployed, the app renders in Financier Display and
Calibre with nothing downloaded. Anywhere else it renders in Georgia and Arial, which is the
substitution the brand guide itself specifies. This is a substitution, not brand compliance,
and a webfont licence for the two Klim faces would close the gap. The two open faces are
embedded, so the standalone file needs no font server and works offline.

### Roles, as the template sets them

| Role | Face | Weight | Color | In the app |
| --- | --- | --- | --- | --- |
| Display heading | Financier Display | Regular | CBRE Green | Page titles, the upload headline |
| Second-level heading | Calibre | Regular | Sage | Dashboard section titles |
| Third-level heading | Calibre | Medium | CBRE Green | Card titles |
| Fourth-level heading | Calibre | Medium | Dark Grey | Chart titles |
| Eyebrow label | Calibre | Medium, caps, tracked | Cement | KPI labels, panel headings, table headers |
| Lead paragraph | Calibre | Regular | CBRE Green | The upload introduction |
| Body | Calibre | Regular | Dark Grey | Everything else |
| Dense data | Barlow Condensed | Regular to Semibold | Dark Grey | The data table, KPI numerals, chart axes and legends |
| Technical value | Space Mono | Regular | inherits | Comp IDs |

Body text was Dark Green before this pass; CBRE sets body in Dark Grey `435254`, and that is
the single most visible change. Chart titles are the one heading the template's colors do not
decide: the template would make them green, but green is also the single-series color, and a
title should never wear the series color, so they take the fourth-level Dark Grey.

The template's print scale (11pt body, 32pt first heading, 52pt title) is not transplanted.
Sizes are re-derived for a data-dense screen on a scale of 11, 12, 13, 14, 16, 18, 24 and 28
pixels, with 26 pixels for KPI numerals, replacing the 16 unrelated sizes the stylesheet had
grown. Weights collapse to the three the system has, regular, medium and semibold: Calibre
Semibold is the heaviest text weight CBRE uses, so nothing is bold. Tracking survives only on
uppercase eyebrow labels, at one value. Radii tighten from 4, 8 and 12 pixels to 2, 4 and 8,
which is closer to CBRE's architectural visual language, and spacing tokens sit on a 4-pixel
grid.

### Charts

The brand reference's chart rules are applied directly: light dashed gridlines in `CCD9D5` on
the value axis only, small grey axis labels in `767676` with no axis lines or tick marks,
legends at the foot, and moderate bar gaps. Axis labels and legends are set in Barlow
Condensed. The reference states the gap as Excel's gap width 150, a gap one and a half times
the bar, so a bar takes 40% of its band. Recharts spends `barCategoryGap` on both sides of a
band, so column and ranked bar charts use 30% to land on the same 40% bar. A distribution's
bars take 60% of the band instead, since a histogram's bars nearly touch by convention.

### Writing

Interface copy and this document follow CBRE's writing rules: American English for a U.S.
audience, no em or en dashes in prose, "more than" rather than "over", and none of the words
the guide bans. The palette names keep CBRE's own spelling, Dark Grey and Light Grey.

### Two discrepancies, resolved in the template's favour

The brand reference describes second-level headings as Financier Display in CBRE Green; the
template's own style sets them in Calibre at 18pt in Sage. The template wins. Sage on white
measures 4.29:1, short of the 4.5:1 that normal text needs, so section titles are set at 24
pixels, where the large-text threshold of 3:1 applies and the template's own 18pt size lands
anyway.

Cement, which the template uses for fifth-level headings and captions, measures 3.77:1 on
white. It is kept for eyebrow labels and captions exactly as the template uses it, and nowhere
else. A team that needs AA on every label can switch the eyebrow color to Dark Grey in one
token.

## Color

Every color is a CBRE 2021 brand value. Chrome uses CBRE Green, Accent Green and Dark
Green; body text is Dark Grey, with Cement for captions and Light Grey for borders.

Chart series use the `cbre_charts` palette. The brand guide says to assign those slots in
order, and this does, with one deliberate exception: slots 4 and 5 are swapped so accent
green and wheat never sit side by side. Measured against a color-vision simulation that
adjacency scores a separation of 1.6, meaning roughly one man in twelve cannot tell two
neighboring stacked segments apart. Moving terracotta between them lifts the worst
adjacent pair to 14.7 and changes no color values.

The two alternative palettes in the chart settings are built from the same brand list and were
measured the same way, because the pairs that fail are not the ones that look risky. A cool
blue-and-sage set that looked entirely reasonable scored 6.2 for normal vision and was dropped
rather than shipped. What each palette scores is printed beside it in the picker:

| Palette | Closest adjacent pair, light | Dark |
| --- | --- | --- |
| CBRE charts | ΔE 14.7 color-vision / 23.7 normal | 14.7 / 20.2 |
| High contrast | 13.7 / 23.2 | 12.1 / 15.1 |
| Warm | 18.1 / 19.5 | 14.7 / 19.5 |

A unit test asserts that every palette on offer clears both floors, so a palette cannot reach
the picker without having been measured.

The brand guide defines no dark-mode chart palette. The dark theme keeps each slot's
identity and substitutes the brand color from the same family that reads on a dark surface,
so a series holds its meaning when the theme flips. Single-measure charts use one color,
because color encodes nothing when every bar measures the same thing.

## Privacy

Files are read in the browser. Nothing uploads to a server. The only outbound requests are
map tiles from CARTO, OpenStreetMap, and Esri, and geocoding lookups that send the address
text only when a sheet lacks coordinates. Geocoding results cache in browser local storage
and clear from the header bar.

Connecting a Google key adds Google to that list, and only then: address text goes to the
Geocoding API, and the photorealistic engine fetches tiles, when those are the selected
options. The key itself lives in browser local storage and is sent nowhere but Google. Deal
terms are never transmitted to any service, keyed or not.
