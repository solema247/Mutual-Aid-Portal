import type { UsageMetadata } from '@google/generative-ai'

function numEnv(name: string): number | undefined {
  const v = process.env[name]
  if (v == null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

/** Log AI usage to terminal; optional USD estimate via env price-per-1M-token vars. */
export function logGeminiUsage(
  model: string,
  usage: UsageMetadata | undefined,
  context: string
): void {
  const prompt = usage?.promptTokenCount ?? 0
  const candidates = usage?.candidatesTokenCount ?? 0
  const total = usage?.totalTokenCount ?? prompt + candidates
  const inPrice = numEnv('GEMINI_PRICE_INPUT_PER_1M')
  const outPrice = numEnv('GEMINI_PRICE_OUTPUT_PER_1M')
  let estimate = ''
  if (inPrice != null && outPrice != null) {
    const usd = (prompt / 1e6) * inPrice + (candidates / 1e6) * outPrice
    estimate = ` ~$${usd.toFixed(4)} USD (set GEMINI_PRICE_* to adjust)`
  } else {
    estimate = ' (set GEMINI_PRICE_INPUT_PER_1M / GEMINI_PRICE_OUTPUT_PER_1M in .env for USD estimate)'
  }
  console.log(
    `[AI usage] ${context} | provider=gemini model=${model} prompt_tokens=${prompt} output_tokens=${candidates} total_tokens=${total}${estimate}`
  )
}

export function logOpenAiUsage(
  model: string,
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined,
  context: string
): void {
  const prompt = usage?.prompt_tokens ?? 0
  const completion = usage?.completion_tokens ?? 0
  const total = usage?.total_tokens ?? prompt + completion
  const inPrice = numEnv('OPENAI_PRICE_INPUT_PER_1M')
  const outPrice = numEnv('OPENAI_PRICE_OUTPUT_PER_1M')
  let estimate = ''
  if (inPrice != null && outPrice != null) {
    const usd = (prompt / 1e6) * inPrice + (completion / 1e6) * outPrice
    estimate = ` ~$${usd.toFixed(4)} USD`
  } else {
    estimate = ' (optional: OPENAI_PRICE_INPUT_PER_1M / OPENAI_PRICE_OUTPUT_PER_1M)'
  }
  console.log(
    `[AI usage] ${context} | provider=openai model=${model} prompt_tokens=${prompt} output_tokens=${completion} total_tokens=${total}${estimate}`
  )
}
