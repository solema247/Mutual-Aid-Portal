# Compliance Check Feature - Implementation Plan

**Project:** Sudan Mutual Aid Portal - Compliance Screening System
**Lead:** TBC
**Date:** March 2026
**Timeline:** TBC
**Status:** Planning Phase

---

## Executive Summary

The Localization Hub, LCC, and P2H need to conduct sanctions list compliance checks without disrupting the urgent flow of aid to Emergency Response Rooms (ERRs). The current process from F1 request to payment is 1-3 days. This feature will enable OFAC and AML compliance checks required to process $2M per month while maintaining the same lead times.

**Problem:** No systematic way to screen fund recipients against sanctions lists without slowing down aid delivery.

**Solution:** Integrated compliance screening workflow within MAP that leverages existing OCR data extraction, creates a dedicated compliance officer dashboard, and provides audit trails.

**Expected Outcome:** 100% sanctions screening coverage with zero impact on current 1-3 day payment timelines.

---

## Objectives

| # | Project Goal |
|---|--------------|
| 1 | Ensure fund recipients are screened against OFAC and other required sanctions/AML lists with effectively 0% false negatives |
| 2 | Ensure personal and ID data used for compliance is stored, accessed, and retained in line with internal governance and applicable data protection rules |
| 3 | Ensure ERR payment processing times and existing approval workflows are not materially disrupted by the new compliance layer |
| 4 | Provide a transparent audit trail of checks and decisions that can be used for internal governance and external reporting |
| 5 | Complete retroactive screening for any ID not previously processed through this system |

---

## Existing F1 Upload Workflow (No Changes Required)

**Current Flow - Remains Unchanged:**

1. **DirectUpload Tab** (`/err-portal/f1-work-plans`)
   - User selects state, emergency room, uploads F1 PDF
   - OCR runs via `/api/fsystem/process` → extracts F1 data
   - `ExtractedDataReview` component shows extracted data for review/editing
   - User confirms → `handleConfirmUpload` saves to `err_projects` table with `status='pending'`

2. **ERRAppSubmissions Tab** (F1 review & approval)
   - **"New" tab**: Shows `status='new'` or `'pending'` projects
   - Compliance officers review and can: approve, request feedback, or decline
   - **"Staging" tab**: Shows `status='approved'` and `funding_status='unassigned'` projects
   - Staged projects move to F2 for grant allocation

**✅ Key Principle: The compliance screening integrates seamlessly WITHOUT blocking or changing the existing upload flow.**

---

## Implementation Phases (Integrated Approach)

### Phase 1: Beneficiary Identity Extraction (Background Process)

**Trigger:** F1 form uploaded and saved to `err_projects` table

**Integration Point:** After `handleConfirmUpload` in `DirectUpload/index.tsx`

**Process:**
1. ✅ **Existing flow continues unchanged** - F1 saved to DB immediately
2. 🆕 **Background job triggered** (via API route):
   - **Step A:** Extract officer names from existing OCR data (first 5 pages):
     - Program Officer Name (`program_officer_name`)
     - Finance Officer Name (`finance_officer_name`)
     - Reporting Officer Name (`reporting_officer_name`)
   - **Step B:** **Scan entire F1 PDF to detect ID document pages:**
     - Run intelligent detection across all pages
     - Identify which pages contain ID documents (ID cards, passports)
     - Extract information ONLY from detected ID pages
   - **Step C:** Parse ID documents to extract:
     - Full Name (from ID card/passport)
     - ID Number (national ID or passport number)
     - Date of Birth
     - ID Type (national ID, passport, etc.)
   - **Step D:** Match officer names with ID documents
   - **Step E:** Save to `beneficiary_identities` table

**ID Document Detection Strategy (Smart Scanning):**

Current OCR processes **pages 1-5** (line 191 in `route.ts`):
```typescript
const firstBatchPages = Array.from({ length: Math.min(5, maxPagesHint) }, (_, i) => i + 1)
```

For compliance, we need to **scan ALL pages** to find ID documents:

```typescript
// In /api/compliance/extract-identity route:
async function detectAndExtractIDPages(fileBuffer: Buffer) {
  // Step 1: Run OCR + feature detection on ALL pages
  const result = await visionClient.batchAnnotateFiles({
    requests: [{
      inputConfig: {
        mimeType: 'application/pdf',
        content: fileBuffer.toString('base64')
      },
      features: [
        { type: 'DOCUMENT_TEXT_DETECTION' },    // Extract text
        { type: 'LABEL_DETECTION' },            // Detect image labels (e.g., "ID card", "passport")
        { type: 'FACE_DETECTION', maxResults: 10 } // Detect faces (ID photos)
      ],
      imageContext: { languageHints: ['ar', 'en'] }
      // No 'pages' parameter = process ALL pages
    }]
  })

  // Step 2: Identify which pages contain ID documents
  const responses = result[0]?.responses?.[0]?.responses || []
  const idPages: Array<{ pageNumber: number, text: string, confidence: number }> = []

  responses.forEach((pageResponse: any, pageIndex: number) => {
    const pageNumber = pageIndex + 1
    const text = pageResponse?.fullTextAnnotation?.text || ''
    const labels = pageResponse?.labelAnnotations || []
    const faces = pageResponse?.faceAnnotations || []

    // Detection criteria for ID documents:
    let isIDPage = false
    let confidence = 0

    // Criterion 1: Text patterns indicating ID documents
    const idPatterns = [
      /national\s*id/i,
      /بطاقة\s*شخصية/i,           // Arabic: national ID
      /بطاقة\s*الرقم\s*الوطني/i,  // Arabic: national ID number
      /passport/i,
      /جواز\s*سفر/i,              // Arabic: passport
      /id\s*number/i,
      /الرقم\s*الوطني/i,          // Arabic: national number
      /date\s*of\s*birth/i,
      /تاريخ\s*الميلاد/i,         // Arabic: date of birth
      /place\s*of\s*birth/i,
      /مكان\s*الميلاد/i           // Arabic: place of birth
    ]

    const patternMatches = idPatterns.filter(pattern => pattern.test(text)).length
    if (patternMatches >= 2) { // At least 2 ID-related terms
      isIDPage = true
      confidence += 0.3
    }

    // Criterion 2: Contains face detection (ID photo)
    if (faces.length > 0 && faces.length <= 3) { // Typical ID has 1-2 faces, not a group photo
      isIDPage = true
      confidence += 0.4
    }

    // Criterion 3: Image labels contain "ID", "passport", "card", "document"
    const idLabels = labels.filter((label: any) =>
      /id|passport|card|document|identity/i.test(label.description || '')
    )
    if (idLabels.length > 0) {
      isIDPage = true
      confidence += 0.3
    }

    // Criterion 4: Page has structured numeric data (ID numbers are usually long numeric strings)
    const longNumbers = text.match(/\b\d{8,}\b/g) // 8+ digit numbers
    if (longNumbers && longNumbers.length > 0) {
      confidence += 0.2
    }

    // Only include if confidence > 0.5 (at least 2 criteria met)
    if (isIDPage && confidence > 0.5) {
      idPages.push({ pageNumber, text, confidence })
      console.log(`Detected ID document on page ${pageNumber} (confidence: ${confidence})`)
    }
  })

  // Step 3: Extract identity information from detected ID pages only
  if (idPages.length === 0) {
    console.log('No ID documents detected in F1 PDF')
    return { identities: [] }
  }

  // Combine text from all detected ID pages
  const idPagesText = idPages.map(p =>
    `--- Page ${p.pageNumber} (confidence: ${p.confidence}) ---\n${p.text}`
  ).join('\n\n')

  // Step 4: Parse ID information using GPT (minimal prompt)
  const openai = getOpenAIClient()
  const completion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    max_tokens: 500, // Keep it minimal
    temperature: 0,
    messages: [{
      role: "system",
      content: `Extract ONLY identity document information (ID card, passport, etc.) from the text.

Look for:
- Full Name (as written on ID document)
- ID Number (national ID, passport number, etc.)
- Date of Birth (in any format)
- ID Type (national_id, passport, or other)

Return JSON:
{
  "identities": [
    {
      "full_name": string,
      "id_number": string,
      "date_of_birth": string (YYYY-MM-DD format if possible),
      "id_type": "national_id" | "passport" | "other"
    }
  ]
}

Rules:
- Extract one identity per ID document found
- If multiple IDs present, return array with multiple objects
- Normalize dates to YYYY-MM-DD format
- If field not found, use null
- Do NOT extract other information (address, signature, photo, etc.)

If no ID documents found, return {"identities": []}.`
    }, {
      role: "user",
      content: idPagesText
    }]
  })

  return JSON.parse(completion.choices[0]?.message?.content || '{"identities":[]}')
}
```

**Why Scan Entire Document:**
- ✅ **Flexible:** ID documents can be anywhere (beginning, middle, end)
- ✅ **Accurate:** Detects IDs wherever they appear, regardless of location
- ✅ **Intelligent:** Uses multiple detection criteria (text patterns, face detection, labels)
- ✅ **Minimal Extraction:** Only extracts from pages identified as IDs (not all pages)
- ✅ **Robust:** Handles different ERR submission formats

**Detection Criteria (Multi-factor):**
1. **Text Patterns:** Keywords like "national ID", "passport", "بطاقة شخصية", "جواز سفر", "ID number"
2. **Face Detection:** Page contains 1-3 faces (typical for ID photos, excludes group photos)
3. **Image Labels:** Google Vision labels page as "ID card", "passport", "document"
4. **Numeric Patterns:** Long numeric strings (8+ digits) typical of ID numbers
5. **Confidence Score:** Must meet 2+ criteria to be classified as ID page

**Technical Implementation:**

**Option A (Recommended):** Background API route triggered after F1 upload:
```typescript
// In DirectUpload/index.tsx, after successful DB insert:
fetch('/api/compliance/extract-identity', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    project_id: insertedProjectId,
    temp_file_key: tempKey // Re-use uploaded PDF
  })
}).catch(() => {}) // Fire-and-forget, don't block F1 upload
```

**Option B:** Scheduled job (fallback if API call fails):
- Runs every 5 minutes
- Queries `err_projects` where `id NOT IN (SELECT DISTINCT f1_submission_id FROM beneficiary_identities)`
- Processes missing identity extractions

**Outputs:**
- New records in `beneficiary_identities` table:
  - Links officer names from F1 form to ID document data
  - Stores: `full_name`, `id_number`, `date_of_birth`, `id_type`, `position`, `phone`
- Links to `err_projects.id`
- **No user-facing changes** - happens in background
- **Processing time:** ~10-15 seconds (parallel to F1 review)

---

### Phase 2: Automatic Screening Check (Background Process)

**Trigger:** Beneficiary identity extracted (Phase 1 complete)

**Process:**
1. For each beneficiary identity created in Phase 1:
2. Query `screening_results` table using:
   - **Primary match:** ID Number (exact match)
   - **Secondary match:** Full Name + Date of Birth (exact match)
   - **Tertiary match:** Full Name + Phone (fuzzy match)
3. **If previous screening found (≤ 6 months old):**
   - Link existing `screening_results.id` to `beneficiary_identities.screening_result_id`
   - Set `beneficiary_identities.screening_status = 'Cleared'` (or match the result)
   - **No queue entry needed** ✅ Fast-track
4. **If no screening found OR screening expired:**
   - Proceed to Phase 3 (add to queue)

**Benefits:**
- 🚀 **Instant approval** for repeat beneficiaries (no re-screening delay)
- ⏱️ **Maintains 1-3 day timeline** - most beneficiaries have prior screenings
- 🔄 **Automatic re-screening** after 6 months (configurable)

**Technical Implementation:**
```sql
-- Pseudo-query for matching
SELECT * FROM screening_results
WHERE (id_number = ? AND id_number IS NOT NULL)
   OR (full_name = ? AND date_of_birth = ?)
   OR similarity(full_name, ?) > 0.9 -- fuzzy match
ORDER BY screened_at DESC
LIMIT 1
```

---

### Phase 3: Add to Screening Queue (Only for New Beneficiaries)

**Trigger:** New beneficiary with no prior screening record (Phase 2 found no match)

**Process:**
1. Insert beneficiary into `screening_queue` table:
   - Link to `beneficiary_identities.id`
   - Link to `err_projects.id` (parent F1)
   - Set `status = 'Pending'`
   - Set `priority` based on F1 urgency (optional)
2. Update `beneficiary_identities.screening_status = 'Pending'`
3. Trigger notification (Phase 4)

**Queue Management:**
- FIFO processing by default
- Priority flags for urgent cases (configurable)
- Batch processing support (screen multiple at once)
- Aging alerts (notify if pending > 24 hours)

---

### Phase 4: Notification System

**Trigger:** New beneficiary added to screening queue

**Recipients:** Compliance Officer(s)

**Notification Channels:**
1. **In-app notification** (MAP system notification)
2. **Email notification** including:
   - Number of new cases
   - Direct link to compliance dashboard
   - Summary of pending items

**Configuration:**
- Configurable notification frequency (real-time, daily digest)
- Role-based notification routing

---

### Phase 5: Manual Screening Dashboard (Compliance Officer)

**Location:** `/err-portal/compliance` (new page)

**Access Control:** Compliance Officer role only (granted by System Administrator/LoHub)

**Dashboard Features:**

#### Pending Cases View
- List of all beneficiaries with status `Pending Manual Screening`
- Sortable/filterable by:
  - Queue date
  - F1 submission date
  - State
  - Risk indicators

#### Beneficiary Detail View
- Full identity information
- Linked F1 form (view original)
- OCR confidence scores
- Previous screening history (if any)

#### Screening Actions
1. **Manual Entry:** Officer enters screening result directly
2. **External Check Button:** (Optional) Trigger API call to 3rd party screening service
3. **Add Notes:** Compliance officer notes/justification
4. **Approve/Flag/Reject:** Set screening outcome

**Integration Points:**
- Explore 3rd party options (OFAC API, WorldCheck, Dow Jones, etc.)
- Configurable matching rules (exact, fuzzy, alias matching)
- Confidence scoring for automated flags

---

### Phase 6: Save Result and Update Status

**Process:**
1. Save screening result to `screening_results` table
2. Update beneficiary status in F1 workflow
3. Update `screening_queue` status to `Completed` (or archive)
4. Trigger downstream approval workflow (if cleared)

**Status Values:**
- ✅ **Cleared:** No sanctions match, approved for payment
- ⚠️ **Flagged:** Potential match requiring review
- ❌ **Rejected:** Confirmed sanctions match, payment blocked
- 📋 **More Info Required:** Insufficient data for decision

**Workflow Integration:**
- Cleared beneficiaries proceed to existing F1 approval workflow
- Flagged cases require additional review before payment
- Rejected cases block payment and trigger escalation

---

### Phase 7: Audit Logging

**Purpose:** Full transparency and compliance reporting

**Audit Trail Captures:**
- Date added to queue (`queued_at`)
- Who performed screening (`screened_by`)
- Screening date (`screened_at`)
- Result (`risk_status`, `risk_score`, `match_details`)
- Officer notes
- Notifications sent (timestamp, recipient)
- Status changes (with timestamps)
- Data access logs (who viewed compliance data)

**Retention:**
- Configurable retention periods per internal governance
- Export capabilities for external audits
- Immutable logs (prevent tampering)

---

## Database Schema

### Table: `screening_queue`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `beneficiary_id` | UUID | FK to beneficiary/F1 record |
| `f1_submission_id` | UUID | FK to F1 submission |
| `queued_at` | TIMESTAMP | When added to queue |
| `status` | ENUM | `Pending`, `In Progress`, `Completed` |
| `priority` | INT | Optional priority flag |
| `assigned_to` | UUID | FK to compliance officer (optional) |

### Table: `screening_results`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `beneficiary_id` | UUID | FK to beneficiary record |
| `risk_status` | ENUM | `Cleared`, `Flagged`, `Rejected`, `More Info Required` |
| `risk_score` | DECIMAL | Numeric risk score (0-100) |
| `match_details` | JSONB | Details of any sanctions list matches |
| `lists_checked` | TEXT[] | Array of list names checked (OFAC, EU, UN, etc.) |
| `screened_by` | UUID | FK to user (compliance officer) |
| `screened_at` | TIMESTAMP | Screening completion timestamp |
| `notes` | TEXT | Compliance officer notes |
| `external_reference` | TEXT | 3rd party screening service reference ID |
| `created_at` | TIMESTAMP | Record creation |
| `updated_at` | TIMESTAMP | Last update |

### Table: `beneficiary_identities` (new)

Store structured identity data extracted from F1 forms:

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `f1_submission_id` | UUID | FK to `err_projects.id` (the F1 submission) |
| `full_name` | TEXT | Full name (from OCR) |
| `date_of_birth` | DATE | DOB (if available) |
| `id_number` | TEXT | National ID number (if available) |
| `id_type` | TEXT | Type of ID document (passport, national ID, etc.) |
| `nationality` | TEXT | Nationality (if available) |
| `position` | TEXT | Role/position (Program Officer, Finance Officer, etc.) |
| `phone` | TEXT | Phone number (for matching) |
| `ocr_confidence` | DECIMAL | OCR confidence score (0-1) |
| `verified` | BOOLEAN | Manual verification flag |
| `screening_status` | ENUM | `Cleared`, `Pending`, `Flagged`, `Rejected`, `Not Required` |
| `screening_result_id` | UUID | FK to `screening_results.id` (null if pending) |
| `created_at` | TIMESTAMP | Record creation |
| `updated_at` | TIMESTAMP | Last update |

**Indexes:**
```sql
CREATE INDEX idx_beneficiary_f1 ON beneficiary_identities(f1_submission_id);
CREATE INDEX idx_beneficiary_id_number ON beneficiary_identities(id_number) WHERE id_number IS NOT NULL;
CREATE INDEX idx_beneficiary_name_dob ON beneficiary_identities(full_name, date_of_birth);
CREATE INDEX idx_beneficiary_status ON beneficiary_identities(screening_status);
```

### Table: `compliance_audit_log`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `event_type` | TEXT | Type of action (view, edit, approve, etc.) |
| `user_id` | UUID | FK to user who performed action |
| `beneficiary_id` | UUID | FK to beneficiary (if applicable) |
| `event_data` | JSONB | Details of action/change |
| `timestamp` | TIMESTAMP | When action occurred |
| `ip_address` | INET | IP address of user |

---

## Project Scope

### In Scope

| # | Deliverable |
|---|-------------|
| 1 | Compliance data model changes (ID fields moved from files to structured tables when OCR is available) and storage strategy connected to existing F1/MOU records |
| 2 | Dedicated compliance web page at `/err-portal/compliance` with strict permissions for running checks, viewing results, resolving flags, and approving recipients |
| 3 | Integration with one or more OFAC/AML list providers (API or regularly updated dataset) plus matching logic and confidence scoring |
| 4 | Basic reporting and export of compliance outcomes (cleared, flagged, rejected) per recipient and per MOU/F1 |
| 5 | Data security and data protection policies, including database-level access controls, retention rules, and governance documentation for all compliance data |
| 6 | Explore and evaluate 3rd party options (WorldCheck, Dow Jones, ComplyAdvantage, etc.) that can be integrated into MAP |

### Out of Scope

| # | Item |
|---|------|
| 1 | Screening of historical F1s (backlog processing is Phase 2) |
| 2 | Real-time automated screening without human-in-the-loop |
| 3 | Integration with external payment systems |

---

## Functional Requirements

| # | Requirement | Priority |
|---|-------------|----------|
| 1 | Store structured recipient identity data (name, position, ID number, nationality, DOB where available) in database tables, linked to original F1 and document files | P0 (MVP) |
| 2 | Automatically check recipients against OFAC/AML lists whenever a new F1 is submitted or updated, using configurable matching rules (exact, fuzzy, and alias matching) | P0 (MVP) |
| 3 | Display results in a dedicated compliance page at `/err-portal/compliance` with status per recipient | P0 (MVP) |
| 4 | Provide human-in-the-loop workflows: reviewers can mark matches as cleared/confirmed, request more information, add notes, and lock outcomes | P0 (MVP) |
| 5 | Enforce strict access controls and audit logs for who viewed/edited compliance data and decisions, including timestamped actions | P0 (MVP) |
| 6 | Allow configuration of check frequency (e.g., re-screen each person once every 6 months or when new lists are imported) and automated reminders to review outstanding flags | P0 (MVP) |
| 7 | Generate downloadable or API-accessible compliance summaries per payment batch/MOU for finance and external partners | P1 (Phase 2) |

---

## Non-Functional Requirements

| # | Requirement | Details |
|---|-------------|---------|
| 1 | **Security** | Role-based access control for compliance pages and data, encrypted storage for personal data (at-rest and in-transit), encrypted transport for all API calls |
| 2 | **Performance** | Compliance checks and page loads must not add more than a few minutes to the end-to-end F1-to-payment workflow under normal monthly volumes |
| 3 | **Scalability** | Ability to scale to higher volumes of recipients and additional sanctions/AML lists without major redesign (e.g., multiple country lists, internal watchlists) |
| 4 | **Compliance & Auditability** | Full audit trail for data changes and decisions, configurable retention periods, and easy export for external audits or donor reporting |

---

## Security Controls

| Control | Implementation |
|---------|----------------|
| **Access Control** | Access permissions limited to Compliance Officer role, granted by System Administrator (LoHub). Use existing permission system in `FUNCTION_PERMISSIONS.md` |
| **Data Integrity** | Prevent modification of results after approval except with special authorization. Immutable audit logs |
| **Encryption** | Encrypt sensitive PII at rest (database encryption). TLS for all API calls |
| **Audit Logging** | Log every view, modification, approval, and rejection action with user, timestamp, and IP |
| **Data Retention** | Configurable retention periods. Automatic purging of expired records with governance approval |
| **Principle of Least Privilege** | Compliance officers only see data for pending/assigned cases. Admin oversight for full access |
| **Data Minimization** | Scan entire F1 PDF to **detect ID pages**, but only extract from detected ID pages. Raw OCR text of ID pages is NOT stored. Only structured fields (`full_name`, `id_number`, `date_of_birth`) are saved. |
| **ID Document Protection** | Original ID images/scans remain embedded in F1 PDF only. No separate ID image files created. ID pages are processed transiently (detect → OCR → parse → discard raw text). Detection uses Google Vision features (face detection, label detection, text patterns) to identify ID pages. |

## Privacy & Data Protection

### Data Processing Principles

1. **Minimal Data Collection:**
   - Only extract identity fields required for OFAC screening: `full_name`, `id_number`, `date_of_birth`
   - Do NOT extract: photo, address, signature, other ID details
   - Intelligent detection: Scan entire F1 to detect ID pages, but only extract from detected ID pages (not all pages)

2. **Transient Processing:**
   - ID page OCR text is processed in memory only
   - Raw OCR text is discarded after parsing structured fields
   - No persistent storage of ID page images or full text

3. **Purpose Limitation:**
   - ID data is used ONLY for sanctions screening
   - Not used for other purposes (analytics, profiling, etc.)
   - Access restricted to compliance officers only

4. **Storage Security:**
   - `beneficiary_identities` table stores only structured fields
   - Database encryption at rest (Supabase encryption)
   - Row-level security policies enforce access controls

5. **Retention Policy:**
   - Screening results retained for [TBC: 5 years? 7 years?] per regulatory requirements
   - After retention period, records are automatically purged
   - Audit logs of data access retained separately

6. **Right to Access/Deletion:**
   - Beneficiaries can request access to their screening data
   - Beneficiaries can request deletion (subject to legal retention requirements)
   - Compliance officer can manually anonymize records if needed

### Technical Implementation

**ID Page Detection & Extraction (Minimal Data):**
```typescript
// In /api/compliance/extract-identity
async function detectAndExtractIDMinimal(pdfBuffer: Buffer) {
  // Step 1: Scan entire PDF with multi-feature detection
  const detectionResult = await visionClient.batchAnnotateFiles({
    requests: [{
      inputConfig: { mimeType: 'application/pdf', content: pdfBuffer.toString('base64') },
      features: [
        { type: 'DOCUMENT_TEXT_DETECTION' },    // Extract text
        { type: 'FACE_DETECTION', maxResults: 10 }, // Detect ID photos
        { type: 'LABEL_DETECTION' }             // Detect "ID card", "passport" labels
      ],
      imageContext: { languageHints: ['ar', 'en'] }
      // No 'pages' parameter = process ALL pages for detection
    }]
  })

  // Step 2: Identify which pages contain ID documents (in-memory processing)
  const responses = detectionResult[0]?.responses?.[0]?.responses || []
  const idPages: number[] = []
  const idPagesText: string[] = []

  responses.forEach((pageResponse: any, pageIndex: number) => {
    const text = pageResponse?.fullTextAnnotation?.text || ''
    const faces = pageResponse?.faceAnnotations?.length || 0
    const labels = pageResponse?.labelAnnotations || []

    // Multi-criteria detection
    const hasIDKeywords = /national\s*id|بطاقة\s*شخصية|passport|جواز\s*سفر|id\s*number/i.test(text)
    const hasIDPhoto = faces > 0 && faces <= 3
    const hasIDLabels = labels.some((l: any) => /id|passport|card|document/i.test(l.description))

    // Require at least 2 detection criteria
    const detectionScore = [hasIDKeywords, hasIDPhoto, hasIDLabels].filter(Boolean).length
    if (detectionScore >= 2) {
      idPages.push(pageIndex + 1)
      idPagesText.push(text) // Only store text from detected ID pages
      console.log(`Detected ID on page ${pageIndex + 1}`)
    }
  })

  if (idPages.length === 0) {
    console.log('No ID documents detected')
    return { identities: [], id_pages: [] }
  }

  // Step 3: Parse ONLY required fields from detected ID pages (minimal prompt)
  const combinedIDText = idPagesText.join('\n\n---\n\n') // In-memory only
  const parsed = await parseIDFields(combinedIDText) // Returns: { identities: [...] }

  // Step 4: Discard raw OCR text (not stored)
  // combinedIDText and idPagesText are garbage collected after function completes

  return { ...parsed, id_pages: idPages } // Only structured fields returned
}

async function parseIDFields(text: string) {
  const openai = getOpenAIClient()
  const completion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    max_tokens: 500,
    temperature: 0,
    messages: [{
      role: "system",
      content: `Extract ONLY: full_name, id_number, date_of_birth, id_type from ID documents.
Return JSON: {"identities": [{"full_name": "...", "id_number": "...", "date_of_birth": "YYYY-MM-DD", "id_type": "national_id|passport"}]}
Do NOT extract: photo, address, signature, other details.`
    }, { role: "user", content: text }]
  })
  return JSON.parse(completion.choices[0]?.message?.content || '{"identities":[]}')
}
```

**Database Storage (Minimal Fields):**
```sql
-- beneficiary_identities table stores ONLY:
CREATE TABLE beneficiary_identities (
  id UUID PRIMARY KEY,
  f1_submission_id UUID REFERENCES err_projects(id),
  full_name TEXT NOT NULL,           -- From ID document
  id_number TEXT,                    -- From ID document (encrypted at rest)
  date_of_birth DATE,                -- From ID document
  id_type TEXT,                      -- Type: national_id, passport, etc.
  position TEXT,                     -- Role: Program Officer, Finance Officer, etc.
  phone TEXT,                        -- For matching (from F1 form, not ID)
  screening_status TEXT DEFAULT 'Pending',
  screening_result_id UUID REFERENCES screening_results(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- NOT stored:
-- - ID photo/image
-- - Full ID card scan
-- - Address
-- - Signature
-- - Other ID details
-- - Raw OCR text of ID pages
```

**Row-Level Security (Supabase):**
```sql
-- Only compliance officers can read beneficiary_identities
ALTER TABLE beneficiary_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Compliance officers can view beneficiaries"
  ON beneficiary_identities FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_permissions
      WHERE user_id = auth.uid()
      AND function_name = 'compliance_view_queue'
    )
  );

-- System processes can insert (for identity extraction)
CREATE POLICY "System can insert beneficiaries"
  ON beneficiary_identities FOR INSERT
  WITH CHECK (true); -- Authenticated service role only
```

---

## Success Criteria

| # | Metric | Target |
|---|--------|--------|
| 1 | **Coverage** | 100% of new F1-linked recipients are screened against OFAC (and configured lists) before payment approval, with documented outcome |
| 2 | **SLA Compliance** | Median time from F1 submission to payment remains within the current 1-3 day SLA after the compliance system goes live |
| 3 | **Zero Sanctions Violations** | Zero known instances of payments made to recipients later confirmed to be on the configured sanctions lists within the first 12 months, or clear documented justification where exceptions apply |
| 4 | **System Adoption** | Compliance teams (Localization Hub, LCC, P2H) adopt and regularly use the dedicated compliance page, with >90% of checks performed through the system rather than ad hoc/manual processes |

---

## Integration with ERRAppSubmissions Workflow

### Visual Changes to Existing UI

#### 1. ERRAppSubmissions Table - Add Screening Status Column

**Location:** `src/app/err-portal/f1-work-plans/components/ERRAppSubmissions/index.tsx`

Add new column to the project table:

| ERR ID | Date | Location | Version | Funding Cycle | Funding Status | **Screening Status** | Actions |
|--------|------|----------|---------|---------------|----------------|---------------------|---------|
| ERR001 | 2026-03-01 | Khartoum | 1 | Cycle 5 | Unassigned | ✅ **Cleared** | View |
| ERR002 | 2026-03-02 | Darfur | 1 | Cycle 5 | Unassigned | ⏳ **Pending (2)** | View |
| ERR003 | 2026-03-03 | Gezira | 1 | Cycle 5 | Unassigned | ⚠️ **Flagged (1)** | View |

**Badge Color Coding:**
- ✅ **Cleared** - Green badge - All beneficiaries screened and cleared
- ⏳ **Pending** - Yellow badge - (N) beneficiaries awaiting screening
- ⚠️ **Flagged** - Orange badge - (N) beneficiaries with potential matches
- ❌ **Rejected** - Red badge - Sanctions match found, payment blocked
- ⚪ **Not Required** - Gray badge - No beneficiary data available

#### 2. Project Detail Dialog - Add Screening Tab

**Location:** `src/app/err-portal/f1-work-plans/components/ERRAppSubmissions/index.tsx`

Add new tab alongside "Details", "Feedback", "Staging":

**Tabs:**
- Details
- Feedback
- **🆕 Screening** ← New tab
- Staging

**Screening Tab Content:**
```
Compliance Screening Status

Beneficiaries (3):
  1. ✅ Ahmed Mohamed Ali - Program Officer - Cleared (Screened 2026-02-15)
  2. ⏳ Fatima Hassan - Finance Officer - Pending Screening
  3. ✅ Omar Ibrahim - Reporting Officer - Cleared (Screened 2026-01-20)

Overall Status: ⏳ Pending (1 of 3 beneficiaries awaiting screening)

[View Full Screening Details →] (opens /err-portal/compliance/project/{id})
```

#### 3. Approval Button Behavior

**Location:** `src/app/err-portal/f1-work-plans/components/ERRAppSubmissions/FeedbackForm.tsx`

**Before:**
```typescript
<Button onClick={() => handleApprove()}>Approve</Button>
```

**After (with compliance gate):**
```typescript
<Button
  onClick={() => handleApprove()}
  disabled={screeningStatus === 'Rejected'}
>
  {screeningStatus === 'Rejected' ? 'Cannot Approve - Sanctions Match' :
   screeningStatus === 'Flagged' ? 'Approve (Flagged - Requires Override)' :
   screeningStatus === 'Pending' ? 'Approve (Screening in Progress)' :
   'Approve'}
</Button>

{screeningStatus === 'Pending' && (
  <AlertBanner variant="warning">
    ⚠️ 1 beneficiary is awaiting compliance screening.
    You can approve now, but final payment requires cleared screening.
  </AlertBanner>
)}

{screeningStatus === 'Flagged' && (
  <AlertBanner variant="danger">
    ⚠️ Potential sanctions match detected.
    Please review <a href="/err-portal/compliance">screening dashboard</a> before approving.
  </AlertBanner>
)}
```

**Logic:**
- ✅ **Cleared:** Normal approval (no changes)
- ⏳ **Pending:** Allow approval with warning (non-blocking, screening continues in parallel)
- ⚠️ **Flagged:** Allow approval with strong warning (requires override justification)
- ❌ **Rejected:** **Block approval** - cannot proceed until resolved

---

## User Flows

### Flow 1: New F1 Submission with Prior Screening (Happy Path - 90% of cases)

**Timeline: 1-3 days (unchanged)**

```
Day 1 - ERR Upload:
1. ERR uploads F1 form via DirectUpload
2. OCR extracts data → saved to err_projects (status='pending')
3. [Background] Identity extraction runs → finds 3 beneficiaries
4. [Background] Screening check runs → finds all 3 have prior clearances
5. Auto-link existing screening results → screening_status='Cleared'

Day 1-2 - Compliance Officer Review:
6. Officer opens ERRAppSubmissions → sees ✅ Cleared badge
7. Officer reviews F1 details → clicks "Screening" tab → all beneficiaries cleared
8. Officer proceeds with normal F1 review (project quality, budget, etc.)

Day 2-3 - Approval:
9. Officer clicks "Approve" → no screening warnings
10. F1 moves to staging → ready for F2 grant allocation
11. ✅ Payment proceeds (no compliance delays)
```

### Flow 2: New Beneficiary Requiring Screening (10% of cases)

**Timeline: 1-3 days (compliance runs in parallel)**

```
Day 1 - ERR Upload:
1. ERR uploads F1 form via DirectUpload
2. OCR extracts data → saved to err_projects (status='pending')
3. [Background] Identity extraction runs → finds 3 beneficiaries
4. [Background] Screening check runs:
   - Beneficiary 1 (Ahmed): ✅ Prior screening found (cleared)
   - Beneficiary 2 (Fatima): ❌ No prior screening → added to queue
   - Beneficiary 3 (Omar): ✅ Prior screening found (cleared)
5. System sends notification: "1 new beneficiary added to screening queue"

Day 1 - Compliance Officer (Parallel Process):
6. Compliance officer receives notification
7. Opens /err-portal/compliance dashboard
8. Reviews Fatima Hassan's details:
   - Name: Fatima Hassan
   - Position: Finance Officer
   - F1: ERR002-Darfur-Cycle5
   - ID: 123456789
9. Clicks "Run Screening" → calls 3rd party API
10. Result: 0 matches found
11. Officer marks as "Cleared" with note: "No OFAC match"
12. screening_results saved → beneficiary_identities updated

Day 1-2 - F1 Review (Parallel Process):
13. Meanwhile, officer reviewing F1 in ERRAppSubmissions
14. Sees ⏳ Pending (1) badge → clicks Screening tab
15. Sees: 2 cleared, 1 pending
16. Continues F1 review (doesn't wait for screening to complete)

Day 2 - Approval:
17. Screening completes → badge changes to ✅ Cleared
18. Officer returns to F1 → clicks "Approve" → no warnings
19. F1 moves to staging → ready for F2
20. ✅ Payment proceeds (screening completed in parallel)
```

### Flow 3: Flagged Match Requiring Resolution

**Timeline: 2-4 days (manual review required)**

```
Day 1 - Upload & Screening:
1. ERR uploads F1 → identity extraction finds "Mohamed Ali Ahmed"
2. No prior screening → added to queue
3. Compliance officer runs screening → 85% fuzzy match with OFAC list
4. System flags match → screening_status='Flagged'

Day 1-2 - Investigation:
5. Officer reviews match details:
   - F1 Beneficiary: Mohamed Ali Ahmed, DOB: 1985-03-12
   - OFAC Match: Mohammed Ahmed Ali, DOB: 1984-03-15
6. Officer compares:
   - Different DOB (1 year difference)
   - Different ID numbers
   - Different location
7. Officer determines: False positive (common name)
8. Officer marks as "Cleared" with justification:
   "Different DOB and ID number. Common name variation. Cleared."

Day 2-3 - F1 Review:
9. F1 reviewer sees badge change from ⚠️ Flagged → ✅ Cleared
10. Reviews screening tab → sees officer's justification
11. Proceeds with approval → F1 moves to staging

Day 3-4 - Payment:
12. ✅ Payment proceeds (screening resolved)
```

### Flow 4: Confirmed Sanctions Match (Rare - Block Payment)

**Timeline: Payment blocked immediately**

```
Day 1 - Upload & Screening:
1. ERR uploads F1 → identity extraction finds "Hassan Ibrahim Mohamed"
2. No prior screening → added to queue
3. Compliance officer runs screening → 100% exact match with OFAC list
4. System flags match:
   - Name: Exact match
   - DOB: Exact match
   - ID: Match confirmed
5. Officer marks as "Rejected" with note: "OFAC exact match confirmed. SDN List."
6. screening_status='Rejected'

Day 1 - F1 Review:
7. F1 reviewer sees ❌ Rejected badge
8. Attempts to approve → button disabled
9. Error message: "Cannot approve: Sanctions match detected for beneficiary Hassan Ibrahim Mohamed"

Day 1 - Escalation:
10. System sends urgent notification to LoHub leadership
11. Compliance officer documents incident in audit log
12. F1 status set to 'declined' with reason: "Sanctions compliance violation"
13. ERR notified to resubmit F1 with different beneficiary

❌ Payment BLOCKED - Cannot proceed
```

### Flow 5: ERR Workflow Unchanged (No Beneficiary Data)

**Timeline: 1-3 days (no compliance impact)**

```
1. ERR uploads F1 without clear beneficiary identity data
2. Identity extraction runs → no parseable names/IDs found
3. screening_status='Not Required' (gray badge)
4. F1 review proceeds normally (no compliance gate)
5. ✅ Approval continues as usual (compliance not applicable)
```

---

## Technical Implementation Notes

### Code Integration Points (Existing Files to Modify)

#### 1. DirectUpload Component
**File:** `src/app/err-portal/f1-work-plans/components/DirectUpload/index.tsx`

**Changes:**
```typescript
// In handleConfirmUpload function, after successful DB insert:
const { error: insertError } = await supabase
  .from('err_projects')
  .insert([{...dataForDB}])

if (insertError) throw insertError

// 🆕 ADD: Trigger identity extraction (fire-and-forget, non-blocking)
fetch('/api/compliance/extract-identity', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    project_id: insertedProjectId, // Get from insert response
    ocr_data: editedData, // Pass OCR results
  })
}).catch(err => console.warn('Identity extraction failed:', err))
// Don't await - let it run in background

alert('F1 workplan uploaded successfully!')
// Rest of function continues unchanged...
```

#### 2. ERRAppSubmissions Component
**File:** `src/app/err-portal/f1-work-plans/components/ERRAppSubmissions/index.tsx`

**Changes:**

A. Add screening status to project type:
```typescript
// Add to F1Project type in types/index.ts
type F1Project = {
  // ...existing fields
  screening_status?: 'Cleared' | 'Pending' | 'Flagged' | 'Rejected' | 'Not Required'
  pending_screenings_count?: number
  flagged_screenings_count?: number
}
```

B. Fetch screening status with projects:
```typescript
// In fetchAllProjects function:
const { data: projectsData, error: projectsError } = await supabase
  .from('err_projects')
  .select(`
    *,
    emergency_rooms(id, name, name_ar, err_code),
    funding_cycles(id, name, cycle_number),
    screening_summary:beneficiary_identities!f1_submission_id(
      screening_status,
      count
    )
  `)
  .or('source.is.null,source.neq.mutual_aid_portal')
  .order('submitted_at', { ascending: false })

// Process screening_summary to compute overall status
const projectsWithScreening = projectsData.map(p => ({
  ...p,
  screening_status: computeOverallStatus(p.screening_summary),
  pending_screenings_count: countPending(p.screening_summary),
  flagged_screenings_count: countFlagged(p.screening_summary)
}))
```

C. Add screening status column to table:
```tsx
<TableHeader>
  <TableRow>
    <TableHead>ERR ID</TableHead>
    <TableHead>Date</TableHead>
    <TableHead>Location</TableHead>
    <TableHead>Version</TableHead>
    <TableHead>Funding Cycle</TableHead>
    <TableHead>Funding Status</TableHead>
    {/* 🆕 ADD: */}
    <TableHead>Screening</TableHead>
    <TableHead>Actions</TableHead>
  </TableRow>
</TableHeader>

<TableBody>
  {projects.map((project) => (
    <TableRow key={project.id}>
      {/* ...existing cells */}
      {/* 🆕 ADD: */}
      <TableCell>
        <ScreeningStatusBadge
          status={project.screening_status}
          pendingCount={project.pending_screenings_count}
          flaggedCount={project.flagged_screenings_count}
        />
      </TableCell>
      <TableCell>...</TableCell>
    </TableRow>
  ))}
</TableBody>
```

D. Add screening tab to project dialog:
```tsx
<TabsList className="grid w-full grid-cols-4">
  <TabsTrigger value="details">Details</TabsTrigger>
  <TabsTrigger value="feedback">Feedback</TabsTrigger>
  {/* 🆕 ADD: */}
  <TabsTrigger value="screening">
    Screening
    {project.pending_screenings_count > 0 && (
      <Badge variant="warning" className="ml-2">
        {project.pending_screenings_count}
      </Badge>
    )}
  </TabsTrigger>
  <TabsTrigger value="staging">Staging</TabsTrigger>
</TabsList>

<TabsContent value="screening" className="py-6">
  <ProjectScreeningStatus projectId={selectedProject.id} />
</TabsContent>
```

#### 3. FeedbackForm Component (Approval Gate)
**File:** `src/app/err-portal/f1-work-plans/components/ERRAppSubmissions/FeedbackForm.tsx`

**Changes:**
```typescript
// Add screening status check before approval
const handleApprove = async () => {
  // 🆕 ADD: Check screening status
  if (project.screening_status === 'Rejected') {
    alert('Cannot approve: Sanctions match detected. Please review compliance dashboard.')
    return
  }

  if (project.screening_status === 'Flagged') {
    const confirmed = confirm(
      'WARNING: Potential sanctions match detected. ' +
      'Review compliance dashboard before approving. ' +
      'Do you want to proceed with approval?'
    )
    if (!confirmed) return
  }

  if (project.screening_status === 'Pending') {
    const confirmed = confirm(
      'Screening in progress for some beneficiaries. ' +
      'You can approve now, but payment requires cleared screening. ' +
      'Continue?'
    )
    if (!confirmed) return
  }

  // Existing approval logic continues...
  await handleFeedbackSubmit(feedbackText, 'approve')
}
```

### Frontend Components (New)

**New Pages:**
- `/src/app/err-portal/compliance/page.tsx` - Main compliance dashboard
- `/src/app/err-portal/compliance/queue/page.tsx` - Screening queue view (embedded in main page)
- `/src/app/err-portal/compliance/project/[id]/page.tsx` - Project-specific screening view

**New Components:**
- `src/app/err-portal/f1-work-plans/components/ERRAppSubmissions/ScreeningStatusBadge.tsx` - Badge showing screening status
- `src/app/err-portal/f1-work-plans/components/ERRAppSubmissions/ProjectScreeningStatus.tsx` - Screening tab content
- `src/app/err-portal/compliance/components/ComplianceQueue.tsx` - Queue table with filters
- `src/app/err-portal/compliance/components/BeneficiaryScreeningDetail.tsx` - Detail view for screening
- `src/app/err-portal/compliance/components/ScreeningResultForm.tsx` - Form to enter screening results
- `src/app/err-portal/compliance/components/ComplianceAuditLog.tsx` - Audit trail viewer

### Backend API Routes (New)

**Identity Extraction:**
- `POST /api/compliance/extract-identity` - Detect and extract identity from F1 PDF (**intelligent ID page detection**)
  - Input: `{ project_id, temp_file_key }`
  - Process:
    1. Retrieve F1 PDF from temp storage using `temp_file_key`
    2. **Scan entire PDF** with multi-feature detection (OCR + face detection + label detection)
    3. **Identify pages containing ID documents** using detection criteria:
       - Text patterns: "national ID", "passport", "بطاقة شخصية", "ID number", etc.
       - Face detection: 1-3 faces per page (typical for ID photos)
       - Image labels: "ID card", "passport", "document"
       - Numeric patterns: Long numeric strings (8+ digits for ID numbers)
    4. **Extract information ONLY from detected ID pages** (not all pages)
    5. Parse ID document information: `full_name`, `id_number`, `date_of_birth`, `id_type`
    6. Retrieve officer names from `err_projects` table (from existing F1 OCR)
    7. Match ID documents with officer names using fuzzy name matching
    8. Create records in `beneficiary_identities` table (link name + position + ID data)
  - Output: `{ success: boolean, identities_created: number, id_pages_detected: number[], identities: [...] }`
  - Triggers: Automatic screening check (Phase 2)
  - **Data Minimization:**
    - Scans all pages but only extracts from detected ID pages
    - Raw ID page OCR text is NOT stored (only parsed structured fields)
    - Original ID images remain in F1 PDF only (not extracted separately)
  - **Performance:** ~15-30 seconds depending on PDF length (intelligent detection avoids unnecessary processing)

**Screening Check:**
- `POST /api/compliance/check-screening` - Check for existing screening results
  - Input: `{ beneficiary_id }`
  - Process: Query `screening_results` for matches
  - Output: `{ found: boolean, result?: ScreeningResult }`

**Queue Management:**
- `GET /api/compliance/queue` - Fetch pending screening queue
  - Returns: List of beneficiaries awaiting screening with F1 context
- `POST /api/compliance/queue/prioritize` - Change queue priority

**Screening Execution:**
- `POST /api/compliance/screen` - Run screening check (manual trigger)
  - Input: `{ beneficiary_id, provider: 'ofac' | 'worldcheck' | ... }`
  - Process: Call 3rd party API or check local list
  - Output: `{ matches: [], confidence: 0-100 }`

**Result Management:**
- `POST /api/compliance/save-result` - Save screening result
  - Input: `{ beneficiary_id, risk_status, risk_score, notes, match_details }`
  - Process: Save to `screening_results`, update `beneficiary_identities`, update queue
  - Triggers: Audit log entry, notification to F1 reviewer

**Reporting:**
- `GET /api/compliance/audit-log/:beneficiaryId` - Fetch audit trail
- `GET /api/compliance/project/:projectId/summary` - Get screening summary for F1 project
- `GET /api/compliance/export` - Export compliance summary (CSV/Excel)

### Integration Points

**3rd Party Screening Services (to evaluate):**
- WorldCheck (Refinitiv)
- Dow Jones Risk & Compliance
- ComplyAdvantage
- LexisNexis Bridger
- Open Sanctions (open source alternative)

**Integration Approach:**
- API-based integration (preferred)
- Scheduled list downloads + local matching (fallback)
- Hybrid: local fuzzy matching + API confirmation

### Database Migrations

**Required Migrations:**
1. Create `beneficiary_identities` table
2. Create `screening_queue` table
3. Create `screening_results` table
4. Create `compliance_audit_log` table
5. Add compliance permissions to `function_permissions` table
6. Create indexes on frequently queried fields (id_number, full_name, dob)

### Permission System

**New Function Permissions:**
- `compliance_view_queue` - View screening queue
- `compliance_screen_beneficiary` - Perform screening
- `compliance_approve_result` - Approve screening results
- `compliance_view_audit_log` - View audit logs
- `compliance_export_data` - Export compliance reports

**Role Assignment:**
- Compliance Officer: All compliance permissions
- System Admin: All compliance permissions + audit log access
- Regular users: No compliance access

---

## Testing Strategy

### Unit Tests
- Identity extraction from OCR data
- Existing record lookup logic
- Queue insertion/update
- Audit log creation

### Integration Tests
- End-to-end F1 submission → screening → approval flow
- Notification delivery
- 3rd party API integration (mock and live)

### Security Tests
- Permission enforcement (non-compliance users blocked)
- Data encryption verification
- SQL injection protection
- XSS protection on input fields

### Performance Tests
- Screening speed (target: <1 minute per beneficiary)
- Queue processing with 100+ pending items
- Report generation with 1000+ records

### User Acceptance Testing
- Compliance officers test full workflow
- ERR users verify no disruption to F1 submission
- Finance team validates export format

---

## Rollout Plan

### Phase 1: MVP Development (4-6 weeks)
- Database schema implementation
- Basic compliance dashboard
- Manual screening workflow
- Email notifications
- Audit logging

### Phase 2: 3rd Party Integration (2-3 weeks)
- Evaluate and select screening provider
- API integration
- Automated matching rules
- Confidence scoring

### Phase 3: Testing & UAT (2 weeks)
- Security testing
- Performance testing
- User acceptance testing
- Documentation

### Phase 4: Production Deployment (1 week)
- Deploy to production
- Train compliance officers
- Monitor first 100 screenings
- Iterate based on feedback

### Phase 5: Historical Backlog (ongoing)
- Retroactive screening of historical F1s
- Batch processing
- Exception handling

---

## Open Questions

1. **Screening Provider:** Which 3rd party service should we integrate? (Cost, API reliability, coverage)
2. **Re-screening Frequency:** How often should we re-screen cleared beneficiaries? (Every 6 months? Annually?)
3. **Escalation Path:** Who is notified when a confirmed sanctions match is found?
4. **Data Retention:** How long should we retain screening results and audit logs? (5 years? 7 years?)
5. **Automated vs Manual:** Should we support fully automated clearing for low-risk cases (0% match confidence)?
6. **Multi-language Support:** Do we need Arabic translation for compliance dashboard?
7. **Mobile Access:** Do compliance officers need mobile access to the dashboard?

---

## Dependencies

- Existing OCR implementation in F1 work plans
- Supabase database access and permissions
- Email notification system
- Existing user role/permission system
- 3rd party screening service subscription

---

## Budget Estimate

**Status:** TBC

**Cost Breakdown (Estimated):**
- Development: TBC
- 3rd party screening service: $X/month (depends on provider and volume)
- Infrastructure: Minimal (existing Supabase instance)
- Training: TBC

---

## Complete Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Phase 1: F1 Upload (Existing Flow - NO CHANGES)                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
         ERR uploads F1 PDF via DirectUpload component
                                    │
                                    ▼
         OCR extracts F1 data (/api/fsystem/process)
                                    │
                                    ▼
         User reviews/edits in ExtractedDataReview
                                    │
                                    ▼
         handleConfirmUpload saves to err_projects
                     (status='pending')
                                    │
                                    ▼
         ✅ F1 visible in ERRAppSubmissions "New" tab
                                    │
                                    │
┌───────────────────────────────────┴─────────────────────────────────────────┐
│ Phase 2: Identity Extraction (NEW - Background Process)                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
         POST /api/compliance/extract-identity
                                    │
                                    ▼
         Scan entire F1 PDF with multi-feature detection:
         - Run OCR on all pages
         - Detect faces (ID photos)
         - Detect image labels ("ID card", "passport")
                                    │
                                    ▼
         Identify pages containing ID documents:
         - Text patterns: "national ID", "بطاقة شخصية", etc.
         - Face detection: 1-3 faces per page
         - Image labels: "ID card", "passport"
         - Confidence score: ≥2 criteria must match
                                    │
                                    ▼
         Extract identity ONLY from detected ID pages:
         - Full name (from ID document)
         - ID number (national ID or passport)
         - Date of birth
         - ID type (national_id, passport, other)
                                    │
                                    ▼
         Match ID data with officer names from F1 form:
         - program_officer_name
         - finance_officer_name
         - reporting_officer_name
                                    │
                                    ▼
         For each matched identity:
         INSERT INTO beneficiary_identities
         (f1_submission_id, full_name, id_number, date_of_birth,
          id_type, position, phone, ...)
                                    │
                                    │
┌───────────────────────────────────┴─────────────────────────────────────────┐
│ Phase 3: Screening Check (NEW - Background Process)                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
         For each beneficiary_identities record:
         Query screening_results for existing screening
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
         Prior screening found?              No prior screening
         (within 6 months)                          │
                    │                               ▼
                    │                   INSERT INTO screening_queue
                    │                   (beneficiary_id, status='Pending')
                    │                               │
                    │                               ▼
                    │                   UPDATE beneficiary_identities
                    │                   SET screening_status='Pending'
                    │                               │
                    │                               ▼
                    │                   Send notification to compliance officer
                    │                               │
                    │                               │
                    └───────────────┬───────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
         Link existing result              Wait for manual screening
         UPDATE beneficiary_identities     (Phase 4)
         SET screening_result_id=X,
             screening_status='Cleared'
                    │
                    │
┌───────────────────┴─────────────────────────────────────────────────────────┐
│ Phase 4: F1 Review (Existing Flow with Screening Status Visibility)        │
└─────────────────────────────────────────────────────────────────────────────┘
                    │
                    ▼
         Compliance officer opens ERRAppSubmissions
                    │
                    ▼
         Table shows screening status badge:
         ✅ Cleared | ⏳ Pending (N) | ⚠️ Flagged (N) | ❌ Rejected
                    │
                    ▼
         Officer clicks project → opens detail dialog
                    │
                    ▼
         New "Screening" tab shows beneficiary list
         with individual screening statuses
                    │
                    ▼
         Officer reviews F1 quality, budget, etc.
         (normal review process continues)
                    │
                    │
┌───────────────────┴─────────────────────────────────────────────────────────┐
│ Phase 5: Manual Screening (NEW - Compliance Officer Workflow)              │
└─────────────────────────────────────────────────────────────────────────────┘
                    │
                    ▼
         Compliance officer opens /err-portal/compliance
                    │
                    ▼
         Dashboard shows screening_queue (status='Pending')
                    │
                    ▼
         Officer selects beneficiary → views details:
         - Full name, DOB, ID number, position
         - Linked F1 project
         - OCR confidence scores
                    │
                    ▼
         Officer clicks "Run Screening"
                    │
                    ▼
         POST /api/compliance/screen
         → Calls 3rd party API (OFAC, WorldCheck, etc.)
         → Returns matches with confidence scores
                    │
            ┌───────┴───────┐
            ▼               ▼
         No matches      Matches found
            │               │
            ▼               ▼
         Officer marks   Officer reviews match details:
         "Cleared"       - Name similarity
                         - DOB match
                         - ID number match
            │               │
            │       ┌───────┴────────┐
            │       ▼                ▼
            │   False positive   Confirmed match
            │   (different DOB,  (exact match)
            │    common name)         │
            │       │                 ▼
            │       ▼            Officer marks
            │   Officer marks    "Rejected"
            │   "Cleared" with   + escalation
            │   justification         │
            │       │                 │
            └───────┴─────────────────┘
                    │
                    ▼
         POST /api/compliance/save-result
         → INSERT INTO screening_results
         → UPDATE beneficiary_identities
         → UPDATE screening_queue (status='Completed')
         → INSERT INTO compliance_audit_log
                    │
                    │
┌───────────────────┴─────────────────────────────────────────────────────────┐
│ Phase 6: F1 Approval (Existing Flow with Compliance Gate)                  │
└─────────────────────────────────────────────────────────────────────────────┘
                    │
                    ▼
         Officer returns to ERRAppSubmissions
         → Badge updated: ⏳ Pending → ✅ Cleared (or ⚠️ Flagged / ❌ Rejected)
                    │
                    ▼
         Officer clicks "Approve" button
                    │
            ┌───────┴───────────────────────────┐
            ▼                                   ▼
         screening_status='Cleared'      screening_status='Rejected'
            │                                   │
            ▼                                   ▼
         Approval proceeds normally      Approval BLOCKED
         → status='approved'             → Error message shown
         → moves to staging              → Cannot proceed
            │                                   │
            ▼                                   ▼
         F2 grant allocation             ERR must resubmit with
         → Payment processing            different beneficiary
            │
            ▼
         ✅ Payment released
```

---

## Implementation Checklist

### Phase 1: Database Schema (Week 1)

**New Tables to Create:**
- [ ] `beneficiary_identities` - Store extracted identity data
- [ ] `screening_queue` - Track pending screenings
- [ ] `screening_results` - Store screening outcomes
- [ ] `compliance_audit_log` - Audit trail

**Indexes to Create:**
- [ ] `idx_beneficiary_f1` on `beneficiary_identities(f1_submission_id)`
- [ ] `idx_beneficiary_id_number` on `beneficiary_identities(id_number)`
- [ ] `idx_beneficiary_name_dob` on `beneficiary_identities(full_name, date_of_birth)`
- [ ] `idx_screening_queue_status` on `screening_queue(status)`

**Permissions to Add:**
- [ ] `compliance_view_queue`
- [ ] `compliance_screen_beneficiary`
- [ ] `compliance_approve_result`
- [ ] `compliance_view_audit_log`
- [ ] `compliance_export_data`

### Phase 2: Backend API Routes (Week 1-2)

**New API Routes to Create:**
- [ ] `POST /api/compliance/extract-identity` - Identity extraction from OCR
- [ ] `POST /api/compliance/check-screening` - Check for existing screening
- [ ] `GET /api/compliance/queue` - Fetch screening queue
- [ ] `POST /api/compliance/queue/prioritize` - Change queue priority
- [ ] `POST /api/compliance/screen` - Run screening check
- [ ] `POST /api/compliance/save-result` - Save screening result
- [ ] `GET /api/compliance/project/:id/summary` - Get F1 screening summary
- [ ] `GET /api/compliance/audit-log/:beneficiaryId` - Fetch audit trail
- [ ] `GET /api/compliance/export` - Export compliance summary

### Phase 3: Frontend - Existing Files to Modify (Week 2-3)

**Files to Modify:**
- [ ] `src/app/err-portal/f1-work-plans/components/DirectUpload/index.tsx`
  - Add identity extraction trigger in `handleConfirmUpload`
- [ ] `src/app/err-portal/f1-work-plans/components/ERRAppSubmissions/index.tsx`
  - Add screening status column to table
  - Add screening tab to project dialog
  - Fetch screening summary with projects
- [ ] `src/app/err-portal/f1-work-plans/components/ERRAppSubmissions/FeedbackForm.tsx`
  - Add screening status check in approval logic
  - Add warning messages for flagged/rejected cases
- [ ] `src/app/err-portal/f1-work-plans/types/index.ts`
  - Add `screening_status` to `F1Project` type

### Phase 4: Frontend - New Components to Create (Week 3-4)

**New Components:**
- [ ] `src/app/err-portal/f1-work-plans/components/ERRAppSubmissions/ScreeningStatusBadge.tsx`
  - Badge component showing screening status with color coding
- [ ] `src/app/err-portal/f1-work-plans/components/ERRAppSubmissions/ProjectScreeningStatus.tsx`
  - Screening tab content showing beneficiary list
- [ ] `src/app/err-portal/compliance/page.tsx`
  - Main compliance dashboard
- [ ] `src/app/err-portal/compliance/components/ComplianceQueue.tsx`
  - Queue table with filters and sorting
- [ ] `src/app/err-portal/compliance/components/BeneficiaryScreeningDetail.tsx`
  - Detail view for individual beneficiary screening
- [ ] `src/app/err-portal/compliance/components/ScreeningResultForm.tsx`
  - Form to enter screening results
- [ ] `src/app/err-portal/compliance/components/ComplianceAuditLog.tsx`
  - Audit trail viewer

### Phase 5: Integration & Testing (Week 4-5)

**3rd Party Integration:**
- [ ] Evaluate and select screening provider (OFAC, WorldCheck, etc.)
- [ ] Set up API credentials and test environment
- [ ] Implement API wrapper in `/api/compliance/providers/`
- [ ] Add retry logic and error handling

**Testing:**
- [ ] Unit tests for identity extraction logic
- [ ] Unit tests for screening match logic
- [ ] Integration test: F1 upload → identity extraction → screening check
- [ ] Integration test: Manual screening workflow
- [ ] Security test: Permission enforcement
- [ ] Performance test: Queue processing with 100+ items
- [ ] UAT with compliance officers

### Phase 6: Deployment & Monitoring (Week 5-6)

**Deployment:**
- [ ] Deploy database migrations to staging
- [ ] Deploy backend API routes to staging
- [ ] Deploy frontend changes to staging
- [ ] Test end-to-end in staging environment
- [ ] Create rollback plan
- [ ] Deploy to production (phased rollout)

**Monitoring:**
- [ ] Set up monitoring for identity extraction success rate
- [ ] Set up alerts for screening queue backlog (>50 pending)
- [ ] Track screening turnaround time (target: <24 hours)
- [ ] Monitor false positive rate
- [ ] Track approval gate blocks (rejected cases)

**Documentation:**
- [ ] Compliance officer training guide
- [ ] System administrator guide (permission setup)
- [ ] Developer documentation (API reference)
- [ ] Audit and reporting guide

---

## Summary: Key Integration Principles

### ✅ What Stays the Same (No Changes)

1. **F1 Upload Flow:** ERRs upload F1 forms exactly as before
2. **OCR Processing:** Existing OCR extraction continues unchanged
3. **ERRAppSubmissions Review:** F1 review workflow remains the same
4. **Approval Process:** Approve/feedback/decline logic is unchanged
5. **Staging & F2:** Grant allocation process continues as normal
6. **Timeline:** 1-3 day F1-to-payment SLA is maintained

### 🆕 What's New (Compliance Layer)

1. **Background Identity Extraction:** After F1 upload, parse beneficiary names (non-blocking)
2. **Automatic Screening Check:** Look for prior screenings, fast-track if found
3. **Screening Queue:** New beneficiaries added to compliance officer queue
4. **Dedicated Compliance Dashboard:** New page at `/err-portal/compliance` for screening workflow
5. **Visual Status Indicators:** Screening badges in ERRAppSubmissions table and detail view
6. **Approval Gate:** Reject button disabled if sanctions match confirmed
7. **Audit Trail:** Complete logging of all screening actions

### 🎯 Success Criteria Met

- ✅ **100% Coverage:** All F1 beneficiaries screened before payment
- ✅ **Zero Disruption:** Existing F1 upload flow unchanged, ERRs unaffected
- ✅ **Maintains SLA:** 1-3 day timeline preserved via background processing + prior screening lookups
- ✅ **Compliance Ready:** Full audit trail for OFAC reporting
- ✅ **Scalable:** Queue-based processing handles volume spikes

---

## Next Steps

1. ✅ Review and approve this feature plan
2. 🔲 Select 3rd party screening provider (evaluate cost, API, coverage)
3. 🔲 Finalize database schema (confirm column types, constraints)
4. 🔲 Create technical specification document (detailed API specs)
5. 🔲 Begin development sprint planning (assign tasks to dev team)
6. 🔲 Set up development environment (test accounts with screening provider)
7. 🔲 Create compliance officer training materials (user guide, video)
8. 🔲 Pilot with small test group (5-10 F1s) before full rollout

---

**Document Version:** 2.0
**Last Updated:** March 9, 2026
**Author:** Claude Code (based on source documents)
**Status:** Ready for Review
**Approvers:** TBC
