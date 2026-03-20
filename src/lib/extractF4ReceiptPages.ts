import { PDFDocument } from 'pdf-lib'

/**
 * F4 forms: first N pages are the main report; remaining pages are typically receipts.
 * Pages after this index (0-based) are extracted as receipt attachments.
 */
const MAIN_REPORT_PAGE_COUNT = 3

/**
 * Extract receipt pages from an F4 PDF buffer.
 * Treats pages after the main report (first MAIN_REPORT_PAGE_COUNT pages) as receipts.
 * @param pdfBuffer - Full PDF file buffer
 * @returns Array of buffers, each a single-page PDF (receipt), or empty if no receipt pages
 */
export async function extractF4ReceiptPages(pdfBuffer: ArrayBuffer): Promise<ArrayBuffer[]> {
  const results: ArrayBuffer[] = []
  try {
    const srcDoc = await PDFDocument.load(pdfBuffer)
    const totalPages = srcDoc.getPageCount()
    if (totalPages <= MAIN_REPORT_PAGE_COUNT) return results

    const receiptPageIndices: number[] = []
    for (let i = MAIN_REPORT_PAGE_COUNT; i < totalPages; i++) receiptPageIndices.push(i)

    for (const pageIndex of receiptPageIndices) {
      const newDoc = await PDFDocument.create()
      const [copiedPage] = await newDoc.copyPages(srcDoc, [pageIndex])
      newDoc.addPage(copiedPage)
      const bytes = await newDoc.save()
      results.push(bytes.buffer)
    }
  } catch (e) {
    console.warn('F4 receipt extraction failed:', e)
  }
  return results
}
