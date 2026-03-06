# F1 Upload: 429 "Exceeded your current quota" – Which service is causing it?

When users see **"429 you have exceeded your current quota, please check your plan"** during F1 upload, the cause is almost always **OpenAI**.

## Why OpenAI?

The F1 upload flow ([`src/app/api/fsystem/process/route.ts`](../src/app/api/fsystem/process/route.ts)) calls three external services in order:

| Order | Service | Used for | Typical 429 message |
|-------|---------|----------|----------------------|
| 1 | **Supabase** | Auth + permission check (`requirePermission`) | Different wording (e.g. rate limit) |
| 2 | **Google Cloud Vision** | OCR (PDF/image text extraction) | "Resource Exhausted" / "Quota exceeded" |
| 3 | **OpenAI** | Extract structured data from OCR text (F1/F4/F5) | **"You have exceeded your current quota, please check your plan"** |

The exact phrase *"exceeded your current quota, please check your plan"* is **OpenAI’s** standard 429 response when you hit usage or billing limits. So if users see that exact message, the failure is at **OpenAI**, not Vision or Supabase.

## How to fix it

1. **OpenAI usage and billing**
   - Go to [OpenAI Platform → Usage](https://platform.openai.com/usage) and [Billing](https://platform.openai.com/account/billing).
   - Check:
     - **Rate limits** (requests/min, tokens/min) for `gpt-3.5-turbo`.
     - **Spend / quota** – unpaid balance or exhausted prepaid quota will trigger this 429.
   - Fix: add payment method, increase limits, or wait for quota reset (e.g. monthly).

2. **Optional: confirm in logs**
   - In Vercel (or your host), check function logs for the F1 process route around the time of the error.
   - If the failure is right after "Processing with OpenAI" (or similar) and the next line is an error, that confirms OpenAI.

3. **If the message is different**
   - **Google Vision**: "Resource Exhausted" or "Quota exceeded" → check [Google Cloud Console → APIs & Services → Vision API → Quotas](https://console.cloud.google.com/apis/api/vision.googleapis.com/quotas).
   - **Supabase**: 429 on login/permission → check [Supabase Dashboard](https://supabase.com/dashboard) for auth/database rate limits and plan limits.

## Code reference

- F1 process API: [`src/app/api/fsystem/process/route.ts`](../src/app/api/fsystem/process/route.ts)  
  - Vision: `visionClient.batchAnnotateFiles` (PDF) or `visionClient.documentTextDetection` (image).  
  - OpenAI: `openai.chat.completions.create` with `gpt-3.5-turbo` (around line 317).  
- Env: `OPENAI_API_KEY` must be set and the key must have quota/billing in good standing.
