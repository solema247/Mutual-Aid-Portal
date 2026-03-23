import { GoogleGenerativeAI } from '@google/generative-ai'
import { GoogleAIFileManager, FileState } from '@google/generative-ai/server'
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { buildF1ExtractInstructions, type F1FormMetadataForPrompt } from '@/lib/f1FormExtractPrompt'
import { logGeminiUsage } from '@/lib/aiUsageLog'

/** Inline PDF limit — above this, use Files API (upload). */
const INLINE_PDF_BYTES = 6 * 1024 * 1024

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export async function extractF1FromPdfWithGemini(
  pdfBuffer: Buffer,
  formMetadata: F1FormMetadataForPrompt
): Promise<{ text: string; usage: import('@google/generative-ai').UsageMetadata | undefined }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set')

  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  const prompt = buildF1ExtractInstructions(formMetadata, 'pdf')

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      maxOutputTokens: 8192
    }
  })

  let fileNameForLog = 'inline'
  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } } | { fileData: { fileUri: string; mimeType: string } }> = []

  if (pdfBuffer.length <= INLINE_PDF_BYTES) {
    parts.push({
      inlineData: {
        data: pdfBuffer.toString('base64'),
        mimeType: 'application/pdf'
      }
    })
  } else {
    const tmpPath = join(tmpdir(), `f1-gemini-${Date.now()}.pdf`)
    writeFileSync(tmpPath, pdfBuffer)
    try {
      const fileManager = new GoogleAIFileManager(apiKey)
      const upload = await fileManager.uploadFile(tmpPath, {
        mimeType: 'application/pdf',
        displayName: 'f1-work-plan.pdf'
      })
      fileNameForLog = upload.file.name
      let meta = upload.file
      const deadline = Date.now() + 120_000
      while (meta.state === FileState.PROCESSING && Date.now() < deadline) {
        await sleep(2000)
        meta = await fileManager.getFile(meta.name)
      }
      if (meta.state === FileState.FAILED) {
        throw new Error(`Gemini file processing failed: ${meta.error?.message || 'unknown'}`)
      }
      parts.push({
        fileData: { fileUri: meta.uri, mimeType: meta.mimeType || 'application/pdf' }
      })
    } finally {
      try {
        unlinkSync(tmpPath)
      } catch {
        /* ignore */
      }
    }
  }

  parts.push({ text: prompt })

  const result = await model.generateContent(parts)
  const response = result.response
  const usage = response.usageMetadata
  logGeminiUsage(modelName, usage, `f1-work-plans PDF (${fileNameForLog})`)

  const text = response.text()
  if (!text?.trim()) {
    throw new Error('Empty response from Gemini')
  }
  return { text: text.trim(), usage }
}
