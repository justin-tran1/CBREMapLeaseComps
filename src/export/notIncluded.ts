/**
 * Stands in for html2canvas, DOMPurify and canvg, which jsPDF loads only for `doc.html()` and
 * `addSvgAsImage()`. The export uses neither: charts go into the PDF as vectors through
 * svg2pdf.js. Without this stand-in the standalone file would carry about 380 KB of code that
 * never runs. Wired up as an alias in vite.config.ts.
 */
export default function notIncluded(): never {
  throw new Error('This part of the PDF library is not included in the app.')
}
