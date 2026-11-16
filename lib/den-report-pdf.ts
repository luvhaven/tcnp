import { format } from 'date-fns'
import { DEN_REPORT_SECTIONS, DEN_REPORT_TYPE_LABEL, type DenReport } from '@/lib/den-repository'

export type ReportPdfImage = { dataUrl: string; format: 'JPEG' | 'PNG'; caption: string | null; width: number; height: number }

/** A file name that survives every operating system. */
export function reportFileName(report: Pick<DenReport, 'title'>, programName: string | null): string {
  const slug = [programName, report.title].filter(Boolean).join(' ')
    .normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).toLowerCase()
  return `${slug || 'den-report'}.pdf`
}

/**
 * Builds the report as an A4 PDF in the browser. jsPDF is loaded only when a
 * report is actually exported, so it adds nothing to the page's first load.
 */
export async function downloadReportPdf(input: {
  report: DenReport
  programName: string | null
  authorName: string | null
  images: ReportPdfImage[]
  otherMedia: string[]
}) {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 18
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const width = pageWidth - margin * 2
  let y = margin

  const ensure = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage()
      y = margin
    }
  }
  const paragraph = (text: string, size: number, style: 'normal' | 'bold', gapAfter: number, color: [number, number, number] = [30, 30, 30]) => {
    doc.setFont('helvetica', style)
    doc.setFontSize(size)
    doc.setTextColor(...color)
    const lineHeight = size * 0.45
    for (const line of doc.splitTextToSize(text, width) as string[]) {
      ensure(lineHeight)
      doc.text(line, margin, y + lineHeight * 0.8)
      y += lineHeight
    }
    y += gapAfter
  }

  const { report } = input
  paragraph('THE COVENANT NATION · PROTOCOL · NOVEMBER (DEN)', 8, 'bold', 3, [120, 120, 120])
  paragraph(report.title, 18, 'bold', 2)
  paragraph(
    [
      DEN_REPORT_TYPE_LABEL[report.report_type],
      input.programName,
      input.authorName ? `Written by ${input.authorName}` : null,
      report.submitted_at ? `Submitted ${format(new Date(report.submitted_at), 'd MMM yyyy')}` : 'Draft — not yet submitted',
    ].filter(Boolean).join('  ·  '),
    9, 'normal', 4, [90, 90, 90],
  )
  doc.setDrawColor(220, 220, 220)
  doc.line(margin, y, pageWidth - margin, y)
  y += 6

  for (const section of DEN_REPORT_SECTIONS) {
    const text = report[section.key]?.trim()
    if (!text) continue
    ensure(14)
    paragraph(section.label, 12, 'bold', 1.5)
    paragraph(text, 10.5, 'normal', 5)
  }

  if (input.images.length > 0 || input.otherMedia.length > 0) {
    ensure(14)
    paragraph('Media', 12, 'bold', 2)
    for (const image of input.images) {
      // Fit inside 120 x 90 mm without changing the picture's proportions.
      const aspect = image.height / Math.max(1, image.width)
      let drawWidth = Math.min(width, 120)
      let drawHeight = drawWidth * aspect
      if (drawHeight > 90) {
        drawHeight = 90
        drawWidth = drawHeight / aspect
      }
      ensure(drawHeight + 10)
      doc.addImage(image.dataUrl, image.format, margin, y, drawWidth, drawHeight)
      y += drawHeight + 2
      if (image.caption) paragraph(image.caption, 9, 'normal', 4, [90, 90, 90])
      else y += 4
    }
    if (input.otherMedia.length > 0) {
      paragraph(`Also attached in the app: ${input.otherMedia.join(', ')}`, 9, 'normal', 0, [90, 90, 90])
    }
  }

  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(140, 140, 140)
    doc.text(`Page ${page} of ${pages}`, pageWidth - margin, pageHeight - 8, { align: 'right' })
  }

  doc.save(reportFileName(report, input.programName))
}

/** Loads an image for the PDF. Returns null instead of failing the export. */
export async function loadPdfImage(url: string, mime: string | null, caption: string | null): Promise<ReportPdfImage | null> {
  if (mime !== 'image/jpeg' && mime !== 'image/png') return null
  try {
    const blob = await (await fetch(url)).blob()
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
    const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
      image.onerror = () => reject(new Error('image failed to load'))
      image.src = dataUrl
    })
    return { dataUrl, format: mime === 'image/png' ? 'PNG' : 'JPEG', caption, ...size }
  } catch {
    return null
  }
}
