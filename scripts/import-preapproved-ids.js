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
 *       with Drive read access to the folder.
 * OCR: Prefer GEMINI_API_KEY (same as portal F-form OCR). If unset, fall back to
 *      Cloud Vision DOCUMENT_TEXT_DETECTION via GOOGLE_VISION. OCR runs on
 *      unmatched files by default; pass --skip-ocr to disable.
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

function loadGoogleCredentials(env) {
  const candidates = []
  if (env.GOOGLE_SHEETS || process.env.GOOGLE_SHEETS) {
    candidates.push(env.GOOGLE_SHEETS || process.env.GOOGLE_SHEETS)
  }
  if (env.GOOGLE_VISION || process.env.GOOGLE_VISION) {
    candidates.push(env.GOOGLE_VISION || process.env.GOOGLE_VISION)
  }
  const filePath = env.GOOGLE_VISION_FILE || process.env.GOOGLE_VISION_FILE
  if (filePath && fs.existsSync(path.resolve(String(filePath).trim()))) {
    candidates.push(fs.readFileSync(path.resolve(String(filePath).trim()), 'utf8'))
  }

  const errors = []
  for (const raw of candidates) {
    if (!raw) continue
    try {
      const creds = typeof raw === 'string' ? JSON.parse(raw) : raw
      if (creds && creds.client_email) return creds
      errors.push('JSON missing client_email')
    } catch (e) {
      // Common .env pattern: "{ \"type\": ... }" with escaped quotes
      try {
        const unescaped = String(raw).replace(/\\"/g, '"').replace(/\\n/g, '\n')
        const creds = JSON.parse(unescaped)
        if (creds && creds.client_email) return creds
        errors.push('unescaped JSON missing client_email')
      } catch (e2) {
        errors.push(e.message || String(e))
      }
    }
  }
  throw new Error(
    'Set GOOGLE_SHEETS, GOOGLE_VISION, or GOOGLE_VISION_FILE for Drive access. ' +
      (errors.length ? `Parse errors: ${errors.join('; ')}` : 'No credential sources found.')
  )
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
      'Extract all text from this identity / compliance screening document. Preserve names and ID/passport numbers. Output raw text only.'
    ])
    return (result.response.text() || '').trim()
  } catch (e) {
    console.warn('  Gemini OCR failed:', e.message || e)
    return ''
  }
}

/**
 * OCR for scanned PDFs. Prefer Gemini (same path as portal F-form OCR) when
 * GEMINI_API_KEY is set; fall back to Cloud Vision DOCUMENT_TEXT_DETECTION
 * using GOOGLE_VISION credentials.
 */
async function extractTextOcr(buffer, env, creds) {
  const geminiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY
  if (geminiKey) {
    const text = await extractTextGemini(buffer, geminiKey)
    if (text.length >= 40) return { text, engine: 'gemini' }
  }
  const visionText = await extractTextVision(buffer, creds)
  if (visionText.length >= 40) return { text: visionText, engine: 'vision' }
  return { text: '', engine: null }
}

function extractNameAndId(text) {
  const cleaned = (text || '').replace(/\r/g, '')
  let confidence = 'low'
  let name = ''
  let idNumber = ''

  // Descartes / Visual Compliance screening report (common in this Drive folder)
  const vc = cleaned.match(/Search criteria:\s*([^\[\n]+?)(?:\s*\[|$)/i)
  if (vc && vc[1]) {
    name = vc[1].replace(/\s+/g, ' ').trim()
  }

  const idPatterns = [
    /(?:ID|National\s*ID|NID|Passport|Document)\s*(?:No\.?|Number|#)?\s*[:：]?\s*([A-Z0-9\-\/]{5,})/i,
    /(?:رقم|الهوية|القومي|جواز)\s*[:：]?\s*([0-9]{6,})/,
    /\bP[0-9]{7,9}\b/, // passport-style in MRZ / VC reports
    /\b(\d{8,14})\b/
  ]
  for (const re of idPatterns) {
    const m = cleaned.match(re)
    if (m) {
      idNumber = (m[1] || m[0] || '').trim()
      if (idNumber) break
    }
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
        break
      }
    }
  }

  if (idNumber && name) confidence = 'high'
  else if (name || idNumber) confidence = 'medium'
  else confidence = 'low'

  return { name, idNumber, confidence }
}

function nameFromFilename(filename) {
  const base = path.basename(filename, path.extname(filename))
  const cleaned = base
    .replace(/\bVC\b/gi, ' ')
    .replace(/\(not clear\)/gi, ' ')
    .replace(/[_\-]+/g, ' ')
    .replace(/\b\d{5,}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (nameTokens(cleaned).length >= 2) return cleaned
  return ''
}

async function extractTextVision(buffer, creds) {
  if (!creds) return ''
  try {
    const vision = require('@google-cloud/vision')
    const client = new vision.ImageAnnotatorClient({ credentials: creds })
    // Sync PDF annotate (first pages) — works for many ID scans
    const request = {
      requests: [
        {
          inputConfig: {
            content: buffer.toString('base64'),
            mimeType: 'application/pdf'
          },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          // First 2 pages is enough for most ID cards
        }
      ]
    }
    const [result] = await client.batchAnnotateFiles(request)
    const responses = result.responses || []
    const parts = []
    for (const fileResp of responses) {
      for (const pageResp of fileResp.responses || []) {
        const full = pageResp.fullTextAnnotation?.text
        if (full) parts.push(full)
      }
    }
    return parts.join('\n').trim()
  } catch (e) {
    console.warn('  Vision OCR failed:', e.message || e)
    return ''
  }
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

function parseArgs(argv) {
  let folderId = DEFAULT_FOLDER_ID
  let apply = false
  // OCR unmatched/low-confidence by default (Gemini if key set, else Cloud Vision)
  let ocr = true
  for (const a of argv.slice(2)) {
    if (a === '--apply') apply = true
    else if (a === '--ocr') ocr = true
    else if (a === '--skip-ocr') ocr = false
    else if (a.startsWith('--folder=')) folderId = a.slice('--folder='.length).trim()
  }
  return { folderId, apply, ocr }
}

async function main() {
  const { folderId, apply, ocr } = parseArgs(process.argv)
  const fileEnv = loadEnvFile()
  const env = { ...fileEnv, ...process.env }

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error('Error: missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  console.log(`\nMode: ${apply ? 'APPLY (writes enabled)' : 'DRY RUN (no writes)'}${ocr ? ' + OCR on unmatched' : ' (filename match only; OCR default — use --skip-ocr to disable)'}`)
  console.log(`Drive folder: ${folderId}`)
  const geminiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY
  console.log(`OCR engine preference: ${geminiKey ? 'Gemini (GEMINI_API_KEY)' : 'Cloud Vision (GOOGLE_VISION) — add GEMINI_API_KEY to use portal Gemini OCR'}\n`)

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
  console.log(`Open screenings to match against: ${open.length}`)

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

  // Index open screenings by normalised payee name for O(1) exact matches
  const byNameKey = new Map() // key -> screening[]
  for (const s of open) {
    const names = Array.isArray(s.names) ? s.names : []
    for (const n of names) {
      const key = normalizedNameKey(n)
      if (!key) continue
      if (!byNameKey.has(key)) byNameKey.set(key, [])
      byNameKey.get(key).push(s)
    }
  }

  const claimed = new Set() // screening ids already planned to clear
  const reviewRows = []
  const clearPlan = []

  const tryMatchName = (name) => {
    const key = normalizedNameKey(name)
    if (!key) return null
    const hits = (byNameKey.get(key) || []).filter(s => !claimed.has(s.id))
    return hits[0] || null
  }

  const tryMatchId = (idDigits) => {
    if (!idDigits || idDigits.length < 6) return null
    for (const s of open) {
      if (claimed.has(s.id)) continue
      const p = projectById.get(s.project_id)
      const hay = `${p?.banking_details || ''} ${(Array.isArray(s.names) ? s.names.join(' ') : '')}`
      if (hay.replace(/\D/g, '').includes(idDigits)) return s
    }
    return null
  }

  let matchedByFilename = 0
  let unmatched = []

  for (const file of pdfs) {
    const name = nameFromFilename(file.name)
    const confidence = name ? 'medium' : 'low'
    let matched = name ? tryMatchName(name) : null
    let matchType = matched ? 'normalized_name' : ''
    const wouldClear = Boolean(matched)

    if (wouldClear) {
      claimed.add(matched.id)
      matchedByFilename++
      clearPlan.push({
        screening: matched,
        file,
        matchType,
        name,
        idNumber: '',
        confidence
      })
      const p = projectById.get(matched.project_id)
      reviewRows.push({
        driveFileId: file.id,
        filename: file.name,
        drivePath: file.path,
        driveLink: file.webViewLink,
        extractedName: name,
        idNumber: '',
        confidence,
        extractionOk: true,
        matchType,
        matchedErrId: p?.err_id || '',
        matchedScreeningId: matched.id,
        wouldClear: true
      })
    } else {
      unmatched.push({ file, name, confidence })
    }
  }

  console.log(`Filename/name matches: ${matchedByFilename}`)
  console.log(`Unmatched after filename pass: ${unmatched.length}`)

  if (ocr && unmatched.length > 0) {
    const concurrency = Math.max(1, Math.min(4, Number(env.OCR_CONCURRENCY || 3)))
    console.log(`OCR pass on ${unmatched.length} unmatched PDF(s) (concurrency=${concurrency})…`)

    let cursor = 0
    const workers = Array.from({ length: concurrency }, async () => {
      while (cursor < unmatched.length) {
        const idx = cursor++
        const item = unmatched[idx]
        const { file } = item
        process.stdout.write(`  [${idx + 1}/${unmatched.length}] OCR ${file.path} … `)
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
            extractedName: item.name || '',
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

        const tmpPath = path.join(os.tmpdir(), `preapproved-id-${file.id}.pdf`)
        try {
          fs.writeFileSync(tmpPath, buffer)
          let text = await extractTextPdfJs(buffer)
          let engine = 'text'
          if (text.length < 40) {
            const ocrResult = await extractTextOcr(buffer, env, creds)
            text = ocrResult.text
            engine = ocrResult.engine || 'none'
          }
          let { name, idNumber, confidence } = extractNameAndId(text)
          if (!name && item.name) {
            name = item.name
            if (confidence === 'low') confidence = idNumber ? 'high' : 'medium'
          }
          if (idNumber && name) confidence = 'high'
          else if (idNumber || name) confidence = confidence === 'low' ? 'medium' : confidence

          let matched = null
          let matchType = ''
          const idDigits = normalizeIdDigits(idNumber)
          matched = tryMatchId(idDigits)
          if (matched) matchType = 'id_number'
          if (!matched && name && confidence !== 'low') {
            matched = tryMatchName(name)
            if (matched) matchType = 'normalized_name'
          }

          const wouldClear = Boolean(matched) && confidence !== 'low'
          if (wouldClear) {
            claimed.add(matched.id)
            clearPlan.push({
              screening: matched,
              file,
              matchType,
              name,
              idNumber,
              confidence
            })
          }

          console.log(
            `${wouldClear ? 'MATCH' : 'no match'} (${engine}) name=${name || '—'} id=${maskId(idNumber)}`
          )
          const p = matched ? projectById.get(matched.project_id) : null
          reviewRows.push({
            driveFileId: file.id,
            filename: file.name,
            drivePath: file.path,
            driveLink: file.webViewLink,
            extractedName: name || '',
            idNumber: idNumber || '',
            confidence,
            extractionOk: Boolean(name || idNumber) && confidence !== 'low',
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
    })
    await Promise.all(workers)
  } else {
    for (const item of unmatched) {
      reviewRows.push({
        driveFileId: item.file.id,
        filename: item.file.name,
        drivePath: item.file.path,
        driveLink: item.file.webViewLink,
        extractedName: item.name || '',
        idNumber: '',
        confidence: item.name ? 'medium' : 'low',
        extractionOk: Boolean(item.name),
        matchType: '',
        matchedErrId: '',
        matchedScreeningId: '',
        wouldClear: false
      })
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
  console.log(`Would clear: ${clearPlan.length} screening(s); unmatched stay in Compliance Review.`)

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
