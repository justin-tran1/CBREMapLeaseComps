/**
 * Writes src/export/pdfMetrics.json: the advance width of every character the PDF report can
 * draw, and the kerning pairs of its built-in fonts, in thousandths of an em, read from jsPDF
 * itself with the fonts the report embeds.
 *
 * The export dialog says how many pages a report will run to before the PDF library loads.
 * With these numbers it wraps text exactly as jsPDF and the table library will, so the count it
 * shows is the count the file has. Run `npm run metrics:pdf` after changing a report font or
 * upgrading jsPDF.
 */
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const { jsPDF } = require(path.join(root, 'node_modules/jspdf/dist/jspdf.node.min.js'))

const doc = new jsPDF({ unit: 'pt' })
const font = (file) => fs.readFileSync(path.join(root, 'src/assets/fonts', file)).toString('base64')
doc.addFileToVFS('BarlowCondensed-Regular.ttf', font('BarlowCondensed-Regular.ttf'))
doc.addFont('BarlowCondensed-Regular.ttf', 'Barlow Condensed', 'normal')
doc.addFileToVFS('BarlowCondensed-SemiBold.ttf', font('BarlowCondensed-SemiBold.ttf'))
doc.addFont('BarlowCondensed-SemiBold.ttf', 'Barlow Condensed', 'bold')

// The same repertoire as pdfSafe in src/export/text.ts: what is left after it has run.
const DRAWABLE = /^[ -~ -ÿŒœˆ˜–—‘-‚“-„†-•…‰‹›€™]$/
const chars = []
for (let code = 0x20; code <= 0x2122; code++) {
  const ch = String.fromCharCode(code)
  if (DRAWABLE.test(ch)) chars.push(ch)
}

// The roles of src/export/pdfLayout.ts and the faces src/export/pdf.ts sets them in.
const ROLES = {
  display: ['times', 'normal'],
  body: ['helvetica', 'normal'],
  bodyBold: ['helvetica', 'bold'],
  figure: ['Barlow Condensed', 'bold'],
  table: ['Barlow Condensed', 'normal'],
}

const unit = (text) => Math.round(doc.getStringUnitWidth(text) * 1000 * 1000) / 1000
const widths = {}
const kerning = {}
for (const [role, [family, style]] of Object.entries(ROLES)) {
  doc.setFont(family, style).setFontSize(10)
  widths[role] = chars.map(unit)
  const pairs = {}
  chars.forEach((a, i) =>
    chars.forEach((b, j) => {
      const k = Math.round((unit(a + b) - widths[role][i] - widths[role][j]) * 1000) / 1000
      if (k !== 0) pairs[a + b] = k
    }),
  )
  if (Object.keys(pairs).length > 0) kerning[role] = pairs
}

const out = { generatedBy: 'tools/pdf-metrics.cjs', jspdf: require(path.join(root, 'node_modules/jspdf/package.json')).version, chars: chars.join(''), widths, kerning }
fs.writeFileSync(path.join(root, 'src/export/pdfMetrics.json'), `${JSON.stringify(out)}\n`)
console.log(`${chars.length} characters, ${Object.values(kerning).reduce((n, p) => n + Object.keys(p).length, 0)} kerning pairs`)
