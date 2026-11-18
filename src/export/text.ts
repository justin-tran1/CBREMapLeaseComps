/**
 * Text that a PDF font can actually draw.
 *
 * The report sets body text in the PDF's built-in Helvetica and figures in an embedded Latin
 * subset of Barlow Condensed. Both cover the same repertoire, essentially Windows-1252: Latin-1
 * plus the typographic dashes, quotes, bullet, ellipsis, euro and trademark. A character outside
 * it would print as nothing or as an empty box, silently, in a tenant or landlord name. So it is
 * decomposed first, which turns "Łódź" into "Lodz" and "Škoda" into "Skoda", and anything that
 * still cannot be drawn becomes a question mark a reader can see.
 */
const DRAWABLE = /^[ -~ -ÿŒœˆ˜–—‘-‚“-„†-•…‰‹›€™]$/

const LOOKALIKE: Record<string, string> = { 'Ł': 'L', 'ł': 'l', 'Đ': 'D', 'đ': 'd', 'Ħ': 'H', 'ħ': 'h', '−': '-', '‐': '-', '′': "'", '″': '"' }

export function pdfSafe(text: string): string {
  let out = ''
  for (const ch of text.replace(/[\t\r\n]+/g, ' ')) {
    if (DRAWABLE.test(ch)) {
      out += ch
      continue
    }
    if (LOOKALIKE[ch]) {
      out += LOOKALIKE[ch]
      continue
    }
    const stripped = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '')
    out += stripped && [...stripped].every((c) => DRAWABLE.test(c)) ? stripped : '?'
  }
  return out
}
