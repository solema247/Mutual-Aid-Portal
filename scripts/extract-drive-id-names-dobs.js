#!/usr/bin/env node

/**
 * Extract names + DOBs from pre-approved ID / Visual Compliance PDFs in Drive.
 * Dry output only — writes CSV under scripts/output/ (gitignored).
 *
 * Usage:
 *   node scripts/extract-drive-id-names-dobs.js
 *   node scripts/extract-drive-id-names-dobs.js --folder=ID
 *   OCR_CONCURRENCY=4 node scripts/extract-drive-id-names-dobs.js
 */

const { google } = require('googleapis')
const fs = require('fs')
const os = require('os')
const path = require('path')

const DEFAULT_FOLDER_ID = '1DwiVNtODxcj0H4YjPQyRdJgjPmf1YeWp'

function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(envPath)) return {}
  const env = {}
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach((line) => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=')
      if (key && valueParts.length > 0) {
        env[key.trim()] = valueParts.join('=').trim().replace(/^['"]|['"]$/g, '')
      }
    }
  })
  return env
}

function loadGoogleCredentials(env) {
  const candidates = []
  if (env.GOOGLE_VISION || process.env.GOOGLE_VISION) {
    candidates.push(env.GOOGLE_VISION || process.env.GOOGLE_VISION)
  }
  if (env.GOOGLE_SHEETS || process.env.GOOGLE_SHEETS) {
    candidates.push(env.GOOGLE_SHEETS || process.env.GOOGLE_SHEETS)
  }
  const errors = []
  for (const raw of candidates) {
    if (!raw) continue
    try {
      const creds = typeof raw === 'string' ? JSON.parse(raw) : raw
      if (creds && creds.client_email) return creds
    } catch (e) {
      try {
        const unescaped = String(raw).replace(/\\"/g, '"').replace(/\\n/g, '\n')
        const creds = JSON.parse(unescaped)
        if (creds && creds.client_email) return creds
      } catch (e2) {
        errors.push(e.message || String(e))
      }
    }
  }
  throw new Error('Need GOOGLE_VISION or GOOGLE_SHEETS credentials. ' + errors.join('; '))
}

async function getDriveClient(creds) {
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/drive.readonly']
  })
  return google.drive({ version: 'v3', auth })
}

async function listPdfsRecursive(drive, folderId, prefix = '') {
  const out = []
  let pageToken = null
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, webViewLink)',
      pageSize: 200,
      pageToken: pageToken || undefined,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    })
    for (const f of res.data.files || []) {
      const label = prefix ? `${prefix}/${f.name}` : f.name
      if (f.mimeType === 'application/vnd.google-apps.folder') {
        out.push(...(await listPdfsRecursive(drive, f.id, label)))
      } else if (
        f.mimeType === 'application/pdf' ||
        (f.name && f.name.toLowerCase().endsWith('.pdf'))
      ) {
        out.push({
          id: f.id,
          name: f.name,
          path: label,
          webViewLink: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`
        })
      }
    }
    pageToken = res.data.nextPageToken || null
  } while (pageToken)
  return out
}

async function downloadPdfBuffer(drive, fileId) {
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' }
  )
  return Buffer.from(res.data)
}

async function extractTextVision(buffer, creds) {
  const vision = require('@google-cloud/vision')
  const client = new vision.ImageAnnotatorClient({ credentials: creds })
  const [result] = await client.batchAnnotateFiles({
    requests: [
      {
        inputConfig: {
          content: buffer.toString('base64'),
          mimeType: 'application/pdf'
        },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }]
      }
    ]
  })
  const parts = []
  for (const fileResp of result.responses || []) {
    for (const pageResp of fileResp.responses || []) {
      const full = pageResp.fullTextAnnotation?.text
      if (full) parts.push(full)
    }
  }
  return parts.join('\n').trim()
}

async function extractTextGemini(buffer, apiKey) {
  if (!apiKey) return ''
  const { GoogleGenerativeAI } = require('@google/generative-ai')
  const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: 'gemini-2.5-flash'
  })
  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: 'application/pdf',
        data: buffer.toString('base64')
      }
    },
    'Extract the full person name and date of birth from this identity or compliance document. Output raw text of the document, preserving name and DOB lines.'
  ])
  return (result.response.text() || '').trim()
}

function nameFromFilename(filename) {
  const base = path.basename(filename, path.extname(filename))
  return base
    .replace(/\bVC\b/gi, ' ')
    .replace(/\(not clear\)/gi, ' ')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeDob(raw) {
  if (!raw) return ''
  let s = String(raw).trim()
  // DD-MM-YYYY / DD/MM/YYYY / DD.MM.YYYY
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/)
  if (m) {
    const d = m[1].padStart(2, '0')
    const mo = m[2].padStart(2, '0')
    return `${d}/${mo}/${m[3]}`
  }
  // YYYY-MM-DD
  m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/)
  if (m) {
    const d = m[3].padStart(2, '0')
    const mo = m[2].padStart(2, '0')
    return `${d}/${mo}/${m[1]}`
  }
  // YYMMDD from MRZ (assume 19xx/20xx)
  m = s.match(/^(\d{2})(\d{2})(\d{2})$/)
  if (m) {
    const yy = Number(m[1])
    const yyyy = yy > 30 ? `19${m[1]}` : `20${m[1]}`
    return `${m[3]}/${m[2]}/${yyyy}`
  }
  return s
}

function isPlausibleDob(ddmmyyyy) {
  const m = String(ddmmyyyy).match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return false
  const d = Number(m[1])
  const mo = Number(m[2])
  const y = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false
  if (y < 1920 || y > 2015) return false // adult beneficiaries roughly
  return true
}

function extractNameAndDob(text, filename) {
  const cleaned = (text || '').replace(/\r/g, '')
  let name = ''
  let dob = ''
  let nameSource = ''
  let dobSource = ''

  const vc = cleaned.match(/Search criteria:\s*([^\[\n]+?)(?:\s*\[|$)/i)
  if (vc && vc[1]) {
    name = vc[1].replace(/\s+/g, ' ').trim()
    nameSource = 'vc_search_criteria'
  }

  if (!name) {
    const namePatterns = [
      /(?:Full\s*)?Name\s*[:：]\s*([^\n]{3,80})/i,
      /(?:اسم|الاسم)\s*[:：]?\s*([^\n]{3,80})/
    ]
    for (const re of namePatterns) {
      const m = cleaned.match(re)
      if (m && m[1]) {
        name = m[1].replace(/\s+/g, ' ').trim()
        nameSource = 'document_label'
        break
      }
    }
  }

  if (!name) {
    name = nameFromFilename(filename)
    if (name) nameSource = 'filename'
  }

  const dobPatterns = [
    /(?:Date\s*of\s*Birth|Birth\s*Date|DOB|D\.?O\.?B\.?)\s*[:：]?\s*([0-9]{1,2}[\/\-.][0-9]{1,2}[\/\-.][0-9]{2,4})/i,
    /(?:تاريخ\s* الميلاد|تاريخ الميلاد|الميلاد)\s*[:：]?\s*([0-9]{1,2}[\/\-.][0-9]{1,2}[\/\-.][0-9]{2,4})/i,
    /(?:Date\s*of\s*Birth|Birth\s*Date|DOB)\s*[:：]?\s*([0-9]{4}[\/\-.][0-9]{1,2}[\/\-.][0-9]{1,2})/i
  ]
  for (const re of dobPatterns) {
    const m = cleaned.match(re)
    if (m && m[1]) {
      const n = normalizeDob(m[1])
      if (isPlausibleDob(n)) {
        dob = n
        dobSource = 'labeled_field'
        break
      }
    }
  }

  // MRZ line often has YYMMDD birth then sex then expiry: e.g. 800218M320904
  if (!dob) {
    const mrz = cleaned.match(/\b(\d{6})[MF<](\d{6})[A-Z0-9<]/i)
    if (mrz) {
      const n = normalizeDob(mrz[1])
      if (isPlausibleDob(n)) {
        dob = n
        dobSource = 'mrz'
      }
    }
  }

  // Fallback: collect plausible DD-MM-YYYY dates and pick earliest (likely DOB vs issue/expiry)
  if (!dob) {
    const dates = []
    const re = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/g
    let m
    while ((m = re.exec(cleaned)) !== null) {
      const n = normalizeDob(`${m[1]}/${m[2]}/${m[3]}`)
      if (isPlausibleDob(n)) dates.push(n)
    }
    if (dates.length) {
      dates.sort((a, b) => {
        const [da, ma, ya] = a.split('/').map(Number)
        const [db, mb, yb] = b.split('/').map(Number)
        return new Date(ya, ma - 1, da) - new Date(yb, mb - 1, db)
      })
      dob = dates[0]
      dobSource = 'earliest_plausible_date'
    }
  }

  return { name, dob, nameSource, dobSource }
}

function csvEscape(v) {
  const s = String(v ?? '')
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

async function main() {
  const env = { ...loadEnvFile(), ...process.env }
  let folderId = DEFAULT_FOLDER_ID
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--folder=')) folderId = a.slice('--folder='.length).trim()
  }

  const creds = loadGoogleCredentials(env)
  const drive = await getDriveClient(creds)
  const pdfs = await listPdfsRecursive(drive, folderId)
  console.log(`Found ${pdfs.length} PDF(s). Extracting name + DOB…`)

  const concurrency = Math.max(1, Math.min(5, Number(env.OCR_CONCURRENCY || 3)))
  const rows = new Array(pdfs.length)
  let cursor = 0
  let done = 0

  const workers = Array.from({ length: concurrency }, async () => {
    while (cursor < pdfs.length) {
      const idx = cursor++
      const file = pdfs[idx]
      const tmpPath = path.join(os.tmpdir(), `drive-id-extract-${file.id}.pdf`)
      try {
        process.stdout.write(`  [${idx + 1}/${pdfs.length}] ${file.path} … `)
        const buffer = await downloadPdfBuffer(drive, file.id)
        fs.writeFileSync(tmpPath, buffer)
        let text = ''
        let engine = 'none'
        try {
          text = await extractTextVision(buffer, creds)
          if (text.length >= 40) engine = 'vision'
        } catch (e) {
          console.warn(`vision fail: ${e.message}`)
        }
        if (text.length < 40 && (env.GEMINI_API_KEY || process.env.GEMINI_API_KEY)) {
          text = await extractTextGemini(buffer, env.GEMINI_API_KEY || process.env.GEMINI_API_KEY)
          if (text.length >= 40) engine = 'gemini'
        }
        const extracted = extractNameAndDob(text, file.name)
        rows[idx] = {
          filename: file.name,
          drive_path: file.path,
          drive_link: file.webViewLink,
          name: extracted.name,
          dob: extracted.dob,
          name_source: extracted.nameSource,
          dob_source: extracted.dobSource,
          ocr_engine: engine,
          extraction_ok: Boolean(extracted.name)
        }
        done++
        console.log(
          `${extracted.name || '—'} | DOB ${extracted.dob || '—'} (${engine})`
        )
      } catch (e) {
        rows[idx] = {
          filename: file.name,
          drive_path: file.path,
          drive_link: file.webViewLink,
          name: nameFromFilename(file.name),
          dob: '',
          name_source: 'filename',
          dob_source: '',
          ocr_engine: 'error',
          extraction_ok: false,
          error: e.message || String(e)
        }
        done++
        console.log(`ERROR ${e.message || e}`)
      } finally {
        try {
          fs.unlinkSync(tmpPath)
        } catch {
          /* ignore */
        }
      }
    }
  })

  await Promise.all(workers)

  const outDir = path.join(__dirname, 'output')
  fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(
    outDir,
    `drive-id-names-dobs-${new Date().toISOString().slice(0, 10)}.csv`
  )
  const header = [
    'filename',
    'drive_path',
    'drive_link',
    'name',
    'dob',
    'name_source',
    'dob_source',
    'ocr_engine',
    'extraction_ok'
  ]
  const lines = [header.join(',')]
  for (const r of rows) {
    if (!r) continue
    lines.push(
      [
        r.filename,
        r.drive_path,
        r.drive_link,
        r.name,
        r.dob,
        r.name_source,
        r.dob_source,
        r.ocr_engine,
        r.extraction_ok ? 'yes' : 'no'
      ]
        .map(csvEscape)
        .join(',')
    )
  }
  fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')

  const withDob = rows.filter((r) => r && r.dob).length
  const withName = rows.filter((r) => r && r.name).length
  console.log(`\nWrote ${rows.length} rows → ${outPath}`)
  console.log(`Names: ${withName} | DOBs: ${withDob}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
