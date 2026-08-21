# Volunteer & Responder Protection Analysis - SQL Queries

Analysis of volunteer and frontline responder support spending, with focus on protection vs operational support.

---

## Quick Start

**Three queries, use in order:**

1. **`volunteer_protection_summary.sql`** - Overview of all volunteer spending (protection, communications, incentives, other)
2. **`volunteer_protection_by_state.sql`** - Geographic breakdown of protection spending
3. **`volunteer_protection_details.sql`** - Line-by-line protection expenses
4. **`volunteer_communications_details.sql`** - Line-by-line communications expenses

---

## Query 1: Summary (`volunteer_protection_summary.sql`)

**What it shows:**
- All volunteer spending split into four categories:
  - **PROTECTION** (evacuation, medical, mental health/PSS, security threats, danger/emergency)
  - **COMMUNICATIONS** (phones, internet, Starlink, Wi-Fi, laptops, connectivity allowances)
  - **INCENTIVES/STIPENDS** (living allowances, operational support)
  - **OTHER SUPPORT** (equipment, transport, training, general support)

**Output columns:**
- `category` - Main grouping (Protection / Incentives / Other)
- `sub_category` - Specific type
- `line_items` - Number of expense lines
- `distinct_errs` - Number of ERR codes
- `distinct_spend_units` - Portal projects or backfill rows
- `total_usd` - Total spending
- `pct_of_volunteer_spend` - % of all volunteer spending

**When to use:** Start here for overall picture

---

## Query 2: By State (`volunteer_protection_by_state.sql`)

**What it shows:**
- Protection spending broken down by state
- Separate columns for each protection type:
  - Evacuation & relocation
  - Medical & injury
  - Mental health/psychosocial support
  - Trapped/rescue
  - Security threats (arrest, detention, bail)
  - Danger/emergency

**Output columns:**
- `state`
- `errs_with_protection` - Number of ERRs with any protection spending
- `total_protection_usd` - Total across all protection types
- `[type]_usd` - Spending by protection type
- `[type]_lines` - Line count by protection type

**When to use:** Geographic analysis, comparing states

---

## Query 3: Details (`volunteer_protection_details.sql`)

**What it shows:**
- Every single protection expense line
- Full description, ERR, state, amount, date
- Tagged with protection type

**Output columns:**
- `err_id`, `state`, `project_name`
- `expense_activity`, `expense_description`
- `expense_amount`, `payment_date`
- `protection_type` - Which category (evacuation, medical, security, etc.)

**When to use:** 
- Finding specific anecdotes and stories
- Checking individual cases
- Understanding what "protection" looks like on the ground

---

## How Protection is Defined

**MUST mention both:**
1. Volunteer/coordinator/responder keyword **AND** protection keyword, **OR**
2. Volunteer family + treatment/support keyword (e.g. "Support for a volunteer's family", "Treatment costs for a volunteer's father")

### Data paths

Expenses link via:
- **Portal:** `err_expense.project_id` → `err_projects`
- **Historical backfill:** `err_expense.activities_raw_import_id` → `activities_raw_import` (when `project_id` is null)

### Protection categories and keywords:

#### 1. Evacuation & Relocation
**English:** evacuation, evacuate, relocation, relocate, displacement, displaced, refuge, flee, fled, escape, deportation  
**Arabic:** إجلاء, اجلاء, نزوح, لجوء, فرار, هروب

**Example:** *"Costs of treating and evacuating a female volunteer who was shot"*

#### 2. Medical & Injury
**English:** medical, treatment, hospital, clinic, surgery, injury, injured, wound, shot, shrapnel, harm, chemotherapy  
**Arabic:** علاج, طبي, مستشف, عملية, إصابة, جرح, أذى

**Example:** *"Paying for the treatment of a volunteer injured by shrapnel"*

#### 3. Volunteer family treatment
**English:** volunteer's family, family of volunteer, volunteer's father/mother + treatment/medical/support/costs  
**Arabic:** أسرة المتطوع, عائلة المتطوع, والد المتطوع

**Example:** *"Support for a volunteer's family"*, *"Treatment costs for a volunteer's father"*

#### 4. Trapped/Rescue
**English:** trapped, stranded, stuck, blocked, besieged, rescue  
**Arabic:** محاصر, عالق, محتجز

**Example:** *"Volunteers trapped in conflict zone"*

#### 5. Security Threats
**English:** arrest, detention, jail, custody, bail, fine, guarantee, legal, lawyer, harassment, threat, intimidation  
**Arabic:** اعتقال, احتجاز, سجن, كفالة, ضمان, محامي, قانوني, تهديد, غرامة

**Example:** *"Volunteers paid the fine imposed to be released from detention"*

#### 6. Danger/Emergency
**English:** danger, risk, threat, emergency, crisis, unsafe  
**Arabic:** خطر, تهديد, طوارئ, أزمة

**Example:** *"Emergency support for volunteers in danger"*

#### 7. Mental Health/Psychosocial Support
**English:** psychological, mental health, trauma, counseling, PSS  
**Arabic:** دعم نفسي, صدمة, علاج نفسي

**Example:** *"Psychological support for volunteers"*

#### 8. Volunteer Communications (separate category, not protection)
**English:** communication, internet, phone, smartphone, Starlink, Wi-Fi, laptop, connectivity, airtime  
**Arabic:** اتصالات, هاتف, إنترنت, شبكة, تواصل

**Example:** *"Technical support for 10 volunteers through the purchase of smartphones"*

Must mention volunteer AND communications keyword. Classified after protection, before incentives.

---

## What is NOT Protection

- Community evacuation (civilians, not volunteers)
- General food baskets
- Community medical care
- "Emergency room" references (غرفة طوارئ) - these refer to ERR offices, not emergencies

**The AND rule:** A line mentioning "volunteers evacuated 200 families" is NOT volunteer protection because the volunteers are evacuating others, not being evacuated themselves.

---

## Current Results (August 2026)

Includes portal projects and historical backfill via `activities_raw_import`.

| Category | USD | ERRs | Line items |
|----------|----:|-----:|-----------:|
| **PROTECTION** | **$86,839** | **20** | **141** |
| - Medical & injury | $52,479 | 9 | 87 |
| - Evacuation & relocation | $30,711 | 9 | 49 |
| - Security threats | $2,647 | 1 | 1 |
| - Mental health/PSS | $350 | 2 | 2 |
| - Danger/emergency | $652 | 2 | 2 |
| - Trapped/rescue | $0 | 0 | 0 |
| **COMMUNICATIONS** | **$23,596** | **37** | **77** |
| **INCENTIVES/STIPENDS** | **$387,301** | **—** | **1,176** |
| **OTHER VOLUNTEER SUPPORT** | **$530,793** | **—** | **1,402** |

**Key finding:** Incentives are ~4.5× larger than protection. Communications ($23,596) supports volunteer coordination via phones and internet, concentrated in Khartoum and North Darfur.

---

## State Rankings (Top 5)

| State | Protection USD | Main type |
|-------|---------------:|-----------|
| Khartoum | $47,852 | Medical |
| North Darfur | $25,524 | Evacuation + security |
| South Kordofan | $5,558 | Evacuation |
| West Kordofan | $5,314 | Evacuation |
| South Darfur | $1,315 | Evacuation |

---

## Related Documentation

- **`docs/volunteer-responder-protection-analysis.md`** - Full analysis with F1/F5 context, anecdotes, methodology
- **`QUERY_EXPLANATIONS.md`** - Plain language explanation of how the queries work
- **`analysis_volunteer_protection_comprehensive.sql`** - Alternative version with more detailed sub-buckets

---

## Tips

1. **Start with summary query** - Get overall picture first
2. **Check state breakdown** - Identify geographic patterns
3. **Use details query** - Find specific stories and validate classification
4. **Sort details by amount** - Largest cases first
5. **Filter details by state** - Add `WHERE state = 'Khartoum'` to details query
6. **Export results** - Save as CSV for reports/presentations

---

## Limitations

1. **Text-based classification** - Relies on expense descriptions mentioning protection keywords
2. **Under-reporting likely** - Some protection may be recorded as generic "volunteer support"
3. **Two data paths** - Portal and historical backfill may overlap for the same ERR
4. **Community vs volunteer blur** - Some lines may be ambiguous about who the beneficiary is
5. **Arabic-English mix** - Bilingual data requires searching both languages

When in doubt, check the details query to see actual descriptions.
