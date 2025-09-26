export function generateMouPdf(html: string): string {
  // Add PDF-specific styling
  const styledHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        @page {
          margin: 1cm;
          size: A4;
        }
        body {
          font-family: Arial, sans-serif;
          line-height: 1.5;
          color: #111;
        }
        .section {
          margin: 1em 0;
          padding: 1em;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          page-break-inside: avoid;
        }
        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1em;
        }
        .box {
          padding: 0.5em;
          border: 1px solid #e5e7eb;
          border-radius: 4px;
        }
        .rtl {
          direction: rtl;
        }
        .text-muted {
          color: #6b7280;
        }
        h1 { font-size: 1.5em; margin: 0 0 0.5em; }
        h2 { font-size: 1.2em; margin: 1em 0 0.5em; }
        ul { margin: 0.5em 0; padding-left: 1.5em; }
      </style>
    </head>
    <body>
      ${html}
    </body>
    </html>
  `

  return styledHtml
}
