import { GoogleGenerativeAI } from '@google/generative-ai'

export function isRetryableGeminiError (e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e)
  return /\[503|\[429|503 Service|429 Too Many|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|try again later|overloaded|ECONNRESET|ETIMEDOUT|fetch failed/i.test(
    m
  )
}

export type GeminiParseSnipsResilientConfig = {
  /** e.g. `[F4 parse-snips]` */
  logPrefix: string
  primaryModelId: string
  fallbackModelId: string
  /** Used when `opts.temperature` is omitted (F4: 0.1, F5: 0). */
  temperatureDefault: number
}

function getModelWithId (
  apiKey: string,
  modelId: string,
  systemInstruction: string,
  maxOutputTokens: number,
  temperatureDefault: number,
  opts?: { temperature?: number }
) {
  const genAI = new GoogleGenerativeAI(apiKey)
  return genAI.getGenerativeModel({
    model: modelId,
    systemInstruction,
    generationConfig: {
      temperature: opts?.temperature ?? temperatureDefault,
      responseMimeType: 'application/json',
      maxOutputTokens,
    },
  })
}

/**
 * Retries transient API errors on the primary model, then optionally uses full Flash if primary is Lite.
 */
export function createGeminiParseSnipsResilient (config: GeminiParseSnipsResilientConfig) {
  const {
    logPrefix,
    primaryModelId,
    fallbackModelId,
    temperatureDefault,
  } = config

  async function generateContentResilient (
    systemInstruction: string,
    maxOutputTokens: number,
    opts: { temperature?: number } | undefined,
    content: any
  ) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error('GEMINI_API_KEY not set')

    const primaryAttempts = 3
    let lastErr: unknown
    for (let attempt = 0; attempt < primaryAttempts; attempt++) {
      try {
        const model = getModelWithId(
          apiKey,
          primaryModelId,
          systemInstruction,
          maxOutputTokens,
          temperatureDefault,
          opts
        )
        return await model.generateContent(content as any)
      } catch (e) {
        lastErr = e
        if (!isRetryableGeminiError(e)) throw e
        if (attempt < primaryAttempts - 1) {
          const delayMs = 500 * Math.pow(2, attempt)
          console.warn(`${logPrefix} GEMINI_RETRY`, {
            model: primaryModelId,
            attempt: attempt + 1,
            delayMs,
          })
          await new Promise(r => setTimeout(r, delayMs))
        }
      }
    }

    const tryFallback =
      primaryModelId !== fallbackModelId && primaryModelId.includes('flash-lite')
    if (tryFallback) {
      console.warn(`${logPrefix} GEMINI_FALLBACK_MODEL`, {
        from: primaryModelId,
        to: fallbackModelId,
      })
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const model = getModelWithId(
            apiKey,
            fallbackModelId,
            systemInstruction,
            maxOutputTokens,
            temperatureDefault,
            opts
          )
          return await model.generateContent(content as any)
        } catch (e) {
          lastErr = e
          if (!isRetryableGeminiError(e)) throw e
          if (attempt < 1) {
            const delayMs = 800
            console.warn(`${logPrefix} GEMINI_RETRY`, {
              model: fallbackModelId,
              attempt: attempt + 1,
              delayMs,
            })
            await new Promise(r => setTimeout(r, delayMs))
          }
        }
      }
    }

    if (lastErr instanceof Error) throw lastErr
    throw new Error(String(lastErr))
  }

  return { generateContentResilient }
}
