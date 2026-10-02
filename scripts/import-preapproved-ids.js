#!/usr/bin/env node

/**
 * One-off import: pre-approved ID PDFs from Google Drive → auto-clear matching
 * compliance screenings (including open missing-ID) through History: "Cleared".
 *
 * Default Drive folder:
 *   https://drive.google.com/drive/folders/1DwiVNtODxcj0H4YjPQyRdJgjPmf1YeWp
 *
 * Usage:
 *   node scripts/import-preapproved-ids.js              # dry-run (default)
 *   node scripts/import-preapproved-ids.js --apply      # write clears
 *   node scripts/import-preapproved-ids.js --folder=ID  # override folder
 *
 * Auth: GOOGLE_SHEETS (JSON) or GOOGLE_VISION_FILE / GOOGLE_VISION (service account)
 *       with Drive read access to the folder. GEMINI_API_KEY optional OCR fallback.
 *
 * Writes a review CSV under scripts/output/ (gitignored). Does NOT save PDF copies
 * in the repo. ID numbers are masked in logs and CSV.
 *
 * Matching: ID number (normalised digits) first; normalised name only as fallback.
 * Never auto-approve on fuzzy name match alone.
 */

const { createClient } = require('@supabase/supabase-js')
const { google } = require('googleapis')
const fs = require('fs')
const os = require('os')
const path = require('path')

const DEFAULT_FOLDER_ID = '1DwiVNtODxcj0H4YjPQyRdJgjPmf1YeWp'

function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(envPath)) return {}
  const env = {}
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
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

const STOP_WORDS = new Set([
  'bin', 'ibn', 'mr', 'mrs', 'dr', 'the', 'of', 'for',
  'name', 'account', 'number', 'bank', 'signature'
])

function nameTokens(name) {
  const cleaned = (name || '').toLowerCase().replace(/[^a-z\u0600-\u06ff\s]/g, ' ')
  return cleaned
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w) && !/^\d+$/.test(w))
}

function normalizedNameKey(name) {
  const counts = new Map()
  for (const tok of nameTokens(name)) counts.set(tok, (counts.get(tok) || 0) + 1)
  return Array.from(counts.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([tok, n]) => `${tok}:${n}`)
    .join('|')
}

function maskId(id) {
  if (!id) return ''
  const digits = String(id).replace(/\D/g, '')
  if (digits.length <= 4) return '****'
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`
}

function normalizeIdDigits(id) {
  return String(id || '').replace(/\D/g, '')
}

function parseArgs(argv) {
  let folderId = DEFAULT_FOLDER_ID
  let apply = false
  for (const a of argv.slice(2)) {
    if (a === '--apply') apply = true
    else if (a.startsWith('--folder=')) folderId = a.slice('--folder='.length).trim()
  }
  return { folderId, apply }
}

function loadGoogleCredentials(env) {
  let raw = env.GOOGLE_SHEETS || process.env.GOOGLE_SHEETS || ''
  if (!raw && (env.GOOGLE_VISION || process.env.GOOGLE_VISION)) {
    raw = env.GOOGLE_VISION || process.env.GOOGLE_VISION
  }
  const filePath = env.GOOGLE_VISION_FILE || process.env.GOOGLE_VISION_FILE
  if (!raw && filePath && fs.existsSync(path.resolve(filePath.trim()))) {
    raw = fs.readFileSync(path.resolve(filePath.trim()), 'utf8')
  }
  if (!raw) {
    throw new Error(
      'Set GOOGLE_SHEETS (inline JSON) or GOOGLE_VISION / GOOGLE_VISION_FILE for Drive access.'
    )
  }
  const creds = typeof raw === 'string' ? JSON.parse(raw) : raw
  return creds
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
        const nested = await listPdfsRecursive(drive, f.id, label)
        out.push(...nested)
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

async function extractTextPdfJs(buffer) {
  try {
    const pdfjs = require('pdfjs-dist/legacy/build/pdf.js')
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) })
    const pdf = await loadingTask.promise
    const parts = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      parts.push(content.items.map(it => ('str' in it ? it.str : '')).join(' '))
    }
    return parts.join('\n').trim()
  } catch (e) {
    return ''
  }
}

async function extractTextGemini(buffer, apiKey) {
  if (!apiKey) return ''
  try {
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
      'Extract all text from this identity document. Preserve names and ID numbers. Output raw text only.'
    ])
    return (result.response.text() || '').trim()
  } catch (e) {
    console.warn('  Gemini OCR failed:', e.message || e)
    return ''
  }
}

function extractNameAndId(text) {
  const cleaned = (text || '').replace(/\r/g, '')
  let confidence = 'low'
  let name = ''
  let idNumber = ''

  const idPatterns = [
    /(?:ID|National\s*ID|NID|Passport|Document)\s*(?:No\.?|Number|#)?\s*[:：]?\s*([A-Z0-9\-\/]{5,})/i,
    /(?:رقم|الهوية|القومي|جواز)\s*[:：]?\s*([0-9]{6,})/,
    /\b(\d{8,14})\b/
  ]
  for (const re of idPatterns) {
    const m = cleaned.match(re)
    if (m && m[1]) {
      idNumber = m[1].trim()
      break
    }
  }

  const namePatterns = [
    /(?:Full\s*)?Name\s*[:：]\s*([^\n]{3,80})/i,
    /(?:اسم|الاسم)\s*[:：]?\s*([^\n]{3,80})/
  ]
  for (const re of namePatterns) {
    const m = cleaned.match(re)
    if (m && m[1]) {
      name = m[1].replace(/\s+/g, ' ').trim()
      break
    }
  }

  // Filename fallback: "John Doe - 12345.pdf" or "John_Doe.pdf"
  if (!name) {
    // filled by caller with filename hint
  }

  if (idNumber && name) confidence = 'high'
  else if (idNumber || name) confidence = 'medium'
  else confidence = 'low'

  return { name, idNumber, confidence }
}

function nameFromFilename(filename) {
  const base = path.basename(filename, path.extname(filename))
  const withoutId = base
    .replace(/[_\-]+/g, ' ')
    .replace(/\b\d{5,}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (nameTokens(withoutId).length >= 2) return withoutId
  return ''
}

function buildReviewCsv(rows) {
  const header = [
    'drive_file_id',
    'filename',
    'drive_path',
    'drive_link',
    'extracted_name',
    'id_number_masked',
    'confidence',
    'extraction_ok',
    'match_type',
    'matched_err_id',
    'matched_screening_id',
    'would_clear'
  ]
  const lines = [header.join(',')]
  const esc = (v) => {
    const s = String(v ?? '')
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  for (const r of rows) {
    lines.push(
      [
        r.driveFileId,
        r.filename,
        r.drivePath,
        r.driveLink,
        r.extractedName,
        maskId(r.idNumber),
        r.confidence,
        r.extractionOk ? 'yes' : 'no',
        r.matchType || '',
        r.matchedErrId || '',
        r.matchedScreeningId || '',
        r.wouldClear ? 'yes' : 'no'
      ]
        .map(esc)
        .join(',')
    )
  }
  return lines.join('\n') + '\n'
}

async function main() {
  const { folderId, apply } = parseArgs(process.argv)
  const fileEnv = loadEnvFile()
  const env = { ...fileEnv, ...process.env }

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error('Error: missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  console.log(`\nMode: ${apply ? 'APPLY (writes enabled)' : 'DRY RUN (no writes)'}`)
  console.log(`Drive folder: ${folderId}\n`)

  const creds = loadGoogleCredentials(env)
  const drive = await getDriveClient(creds)
  const pdfs = await listPdfsRecursive(drive, folderId)
  console.log(`Found ${pdfs.length} PDF(s) (including subfolders).`)

  const supabase = createClient(supabaseUrl, supabaseKey)
  const { data: screenings, error: scErr } = await supabase
    .from('compliance_screenings')
    .select('id, project_id, names, status, flag_type, finance_review_status')
  if (scErr) throw scErr

  const open = (screenings || []).filter(
    s => s.status === 'pending_screening' || s.status === 'flagged'
  )
  const projIds = open.map(s => s.project_id)
  const projectById = new Map()
  for (let i = 0; i < projIds.length; i += 200) {
    const chunk = projIds.slice(i, i + 200)
    const { data, error } = await supabase
      .from('err_projects')
      .select('id, err_id, banking_details')
      .in('id', chunk)
    if (error) throw error
    for (const p of data || []) projectById.set(p.id, p)
  }

  const reviewRows = []
  const clearPlan = [] // { screening, file, matchType, name, idNumber }

  for (const file of pdfs) {
    process.stdout.write(`  Reading ${file.path} … `)
    let buffer
    try {
      buffer = await downloadPdfBuffer(drive, file.id)
    } catch (e) {
      console.log('DOWNLOAD FAILED')
      reviewRows.push({
        driveFileId: file.id,
        filename: file.name,
        drivePath: file.path,
        driveLink: file.webViewLink,
        extractedName: '',
        idNumber: '',
        confidence: 'low',
        extractionOk: false,
        matchType: '',
        matchedErrId: '',
        matchedScreeningId: '',
        wouldClear: false
      })
      continue
    }

    // Process in memory / OS temp only — never write into the repo
    const tmpPath = path.join(os.tmpdir(), `preapproved-id-${file.id}.pdf`)
    try {
      fs.writeFileSync(tmpPath, buffer)
      let text = await extractTextPdfJs(buffer)
      let usedOcr = false
      if (text.length < 40) {
        text = await extractTextGemini(buffer, env.GEMINI_API_KEY)
        usedOcr = Boolean(text)
      }
      let { name, idNumber, confidence } = extractNameAndId(text)
      if (!name) {
        const fromFile = nameFromFilename(file.name)
        if (fromFile) {
          name = fromFile
          if (confidence === 'low') confidence = idNumber ? 'medium' : 'low'
        }
      }
      const extractionOk = Boolean(name || idNumber) && confidence !== 'low'
      if (!name && !idNumber) confidence = 'low'

      console.log(
        extractionOk
          ? `ok (${usedOcr ? 'ocr' : 'text'}) name=${name || '—'} id=${maskId(idNumber)}`
          : `LOW CONFIDENCE name=${name || '—'} id=${maskId(idNumber)}`
      )

      let matchType = ''
      let matched = null
      const idDigits = normalizeIdDigits(idNumber)

      if (idDigits.length >= 6) {
        for (const s of open) {
          const p = projectById.get(s.project_id)
          const hay = `${p?.banking_details || ''} ${(Array.isArray(s.names) ? s.names.join(' ') : '')}`
          const hayDigits = hay.replace(/\D/g, '')
          if (hayDigits.includes(idDigits)) {
            matched = s
            matchType = 'id_number'
            break
          }
        }
      }

      if (!matched && name && confidence !== 'low') {
        const key = normalizedNameKey(name)
        if (key) {
          for (const s of open) {
            const names = Array.isArray(s.names) ? s.names : []
            if (names.some(n => normalizedNameKey(n) === key)) {
              matched = s
              matchType = 'normalized_name'
              break
            }
          }
        }
      }

      // Never auto-approve on fuzzy name alone — already enforced (exact normalised only)

      const wouldClear =
        Boolean(matched) &&
        (matchType === 'id_number' || matchType === 'normalized_name') &&
        confidence !== 'low'

      if (wouldClear) {
        clearPlan.push({
          screening: matched,
          file,
          matchType,
          name,
          idNumber,
          confidence
        })
      }

      const p = matched ? projectById.get(matched.project_id) : null
      reviewRows.push({
        driveFileId: file.id,
        filename: file.name,
        drivePath: file.path,
        driveLink: file.webViewLink,
        extractedName: name,
        idNumber,
        confidence,
        extractionOk,
        matchType,
        matchedErrId: p?.err_id || '',
        matchedScreeningId: matched?.id || '',
        wouldClear
      })
    } finally {
      try {
        fs.unlinkSync(tmpPath)
      } catch {
        /* ignore */
      }
    }
  }

  const outDir = path.join(__dirname, 'output')
  fs.mkdirSync(outDir, { recursive: true })
  const csvPath = path.join(
    outDir,
    `preapproved-ids-review-${new Date().toISOString().slice(0, 10)}.csv`
  )
  fs.writeFileSync(csvPath, buildReviewCsv(reviewRows), 'utf8')
  console.log(`\nReview CSV written (not for commit): ${csvPath}`)
  console.log(`Would clear: ${clearPlan.length} screening(s); unmatched/low-confidence stay in queue.`)

  if (!apply) {
    console.log('\nDry-run complete. Re-run with --apply to clear matches → History: Cleared.')
    return
  }

  let cleared = 0
  for (const item of clearPlan) {
    const audit =
      `Auto-approved from a pre-approved ID (Drive file: ${item.file.name}; ` +
      `link: ${item.file.webViewLink}; match: ${item.matchType}; ` +
      `id: ${maskId(item.idNumber)}). Moved to History: Cleared.`
    const { error } = await supabase
      .from('compliance_screenings')
      .update({
        status: 'cleared',
        flag_type: null,
        flag_note: audit,
        screened_by: 'system:auto-approve-preapproved-id',
        screened_at: new Date().toISOString(),
        finance_review_status: null,
        finance_review_note: null,
        finance_reviewed_by: null,
        finance_reviewed_at: null
      })
      .eq('id', item.screening.id)
    if (error) {
      console.error(`  Failed ${item.screening.project_id}:`, error.message)
      continue
    }
    cleared++
  }
  console.log(`\nCleared ${cleared} screening(s) → History status "cleared".`)
  console.log('Done.')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
