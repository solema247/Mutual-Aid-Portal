import { jsPDF } from 'jspdf'
import nodeHtmlToImage from 'node-html-to-image'

export async function generateMouPdf(html: string): Promise<Buffer> {
  try {
    // Convert HTML sections to images
    const sections = html.split('<div class="section">').slice(1)
    const sectionImages: Buffer[] = []

    for (const section of sections) {
      const sectionHtml = `<div class="section">${section}`
      const image = await nodeHtmlToImage({
        html: sectionHtml,
        transparent: true,
        puppeteerArgs: { args: ['--no-sandbox'] }
      }) as Buffer
      sectionImages.push(image)
    }

    // Create PDF
    const pdf = new jsPDF('p', 'pt', 'a4')
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 36 // ~0.5 inch

    let currentY = margin
    for (const image of sectionImages) {
      // Convert Buffer to base64
      const base64 = `data:image/png;base64,${image.toString('base64')}`
      
      // Calculate dimensions
      const imgWidth = pageWidth - (margin * 2)
      const imgHeight = (image.length / (pageWidth * 4)) * imgWidth // Approximate height based on buffer size

      if (currentY + imgHeight > pageHeight - margin) {
        pdf.addPage()
        currentY = margin
      }

      pdf.addImage(base64, 'PNG', margin, currentY, imgWidth, imgHeight)
      currentY += imgHeight + 12 // gap between sections
    }

    return Buffer.from(pdf.output('arraybuffer'))
  } catch (error) {
    console.error('Error generating PDF:', error)
    throw error
  }
}
