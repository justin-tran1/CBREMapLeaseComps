import { downloadBlob } from '../lib/download'
import { exportFileName, type ExportInput } from './input'
import { metricMeasure, planPdf } from './pdfLayout'
import { planSlides } from './pptxPlan'

/**
 * Write a dashboard export and hand it to the browser to save.
 *
 * The PDF and PowerPoint libraries are loaded here, on demand, the first time someone exports,
 * so the app opens no slower for carrying them.
 */
export async function writeExport(input: ExportInput): Promise<Blob> {
  if (input.format === 'pdf') {
    const { writePdf } = await import('./pdf')
    return writePdf(input)
  }
  const { writePptx } = await import('./pptx')
  return writePptx(input)
}

export async function exportDashboard(input: ExportInput): Promise<{ filename: string; size: number }> {
  const blob = await writeExport(input)
  const filename = exportFileName(input.format, input.generatedAt)
  downloadBlob(filename, blob)
  return { filename, size: blob.size }
}

export interface ExportEstimate {
  /** Pages in a PDF, slides in a deck, worked out by the rules the writers follow. */
  length: number
  unit: 'page' | 'slide'
  /** The size a deck's table is set in, in points, when the deck carries one. */
  tableFontSize?: number
}

/** How long an export will run, worked out without loading either library. */
export function estimateExport(input: ExportInput): ExportEstimate {
  if (input.format === 'pdf') return { length: planPdf(input, metricMeasure).estimatedPages, unit: 'page' }
  const slides = planSlides(input)
  const table = slides.find((slide) => slide.kind === 'table')
  return {
    length: slides.length,
    unit: 'slide',
    tableFontSize: table?.kind === 'table' ? table.layout.fontSize : undefined,
  }
}
