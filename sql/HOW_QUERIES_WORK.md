# How the Protection Queries Work (Simple Explanation)

---

## The Big Question

**"How much money goes to protecting volunteers (evacuation, medical, security) vs. paying them regular incentives?"**

---

## Step-by-Step Logic

### Step 1: Link expenses to project context

Every expense line in `err_expense` links via one of two paths:

| Path | When | Join |
|------|------|------|
| Portal | `project_id` is set | `err_projects` |
| Historical backfill | `project_id` is null | `activities_raw_import` |

Queries use `LEFT JOIN` on both and take `COALESCE` for ERR code and state.

### Step 2: Find anything volunteer-related

Check if the line mentions:
- English: volunteer, coordinator, responder
- Arabic: متطوع, منسق

If NO volunteer keywords → skip this line

### Step 3: Is it PROTECTION or not?

For lines that DO mention volunteers, check if they ALSO mention protection keywords:

#### PROTECTION = Volunteer keyword + Protection keyword

**Protection keywords:**
- Evacuation: evacuat, relocat, flee, escape, deportation, إجلاء, نزوح
- Medical: medical, treatment, hospital, surgery, injury, wound, shot, shrapnel, علاج, طبي, إصابة
- Volunteer family: volunteer's family, volunteer's father/mother + treatment/medical/support/costs
- Mental health: psychological, mental health, trauma, counseling, PSS, دعم نفسي, صدمة, علاج نفسي
- Trapped: trapped, stranded, stuck, blocked, محاصر, عالق
- Security: arrest, detention, bail, fine, lawyer, اعتقال, كفالة, ضمان, غرامة
- Danger: danger, risk, threat, emergency, crisis, خطر, تهديد

**Example that IS protection:**
> "Costs of treating and evacuating a female volunteer who was shot"
- ✓ Mentions "volunteer"
- ✓ Mentions "evacuating" and "shot"
- → **PROTECTION - Evacuation**

**Example that IS protection (family):**
> "Support for a volunteer's family"
- ✓ Mentions "volunteer's family"
- ✓ Mentions "support"
- → **PROTECTION - Medical/family**

**Example that is NOT protection:**
> "Volunteers evacuated 200 families to safety"
- ✓ Mentions "volunteers"
- ✓ Mentions "evacuated"
- ✗ BUT volunteers are evacuating OTHERS, not being evacuated themselves
- → **NOT protection** (this is community service, not volunteer protection)

### Step 4: Is it COMMUNICATIONS?

Check for volunteer + phone/internet/Starlink/Wi-Fi/communication keywords:

**Communications keywords:**
- Phones: phone, smartphone, mobile, laptop, tablet, هاتف
- Internet: internet, Starlink, Wi-Fi, connectivity, airtime, data bundle, إنترنت, شبكة
- General: communication, communications, تواصل, اتصالات

**Example:**
> "Technical support for 10 volunteers through the purchase of smartphones"
- → **COMMUNICATIONS**

Lines with both communication and incentive keywords (e.g. "communication incentives") are classified as communications, not incentives.

### Step 5: If not protection or communications, is it INCENTIVES?

Check for: incentive, stipend, allowance, salary, حافز, نثرية

**Example:**
> "Incentives for 37 volunteers at 500,000 pounds each"
- → **INCENTIVES**

### Step 6: Everything else = OTHER SUPPORT

This catches:
- Equipment (reflectors, tools)
- Transport (fuel, vehicles)
- Training
- General "volunteer support" that doesn't specify

---

## Why the AND Rule Matters

**Without the AND rule:**
- "Volunteers distributed food to 500 families" → Wrongly counted as protection
- "Volunteers operated community kitchen" → Wrongly counted as protection

**With the AND rule:**
- Must mention BOTH volunteer AND protection keyword
- Catches only cases where volunteers themselves need protection

---

## The Four Queries

### Query 1: Summary
- Counts up protection, communications, incentives, and other support
- Shows totals by category
- **Use first** for overall picture

### Query 2: By State
- Protection spending grouped by state
- Splits protection into evacuation, medical, security, etc.

### Query 3: Protection Details
- Shows EVERY protection expense line
- Full description, amount, ERR, state, data source (portal vs backfill)

### Query 4: Communications Details
- Shows EVERY communications expense line
- Phones, internet, Starlink, laptops, communication allowances

---

## Common Questions

**Q: Why do results include both English and Arabic?**  
**A:** F4 expense descriptions are bilingual. Some ERRs report in English, some in Arabic, some mix both.

**Q: Why were some protection lines missing before?**  
**A:** Expenses with `project_id = null` link to `activities_raw_import` (historical backfill), not `err_projects`. Queries now include both paths.

**Q: Can I add more keywords?**  
**A:** Yes. Add them to the pattern in the queries. For example, to add "deportation":
```sql
WHEN ex.expense_description ~* '(evacuat|relocat|deportation|إجلاء|نزوح)'
```

---

## Quick Reference: All Keywords

| Category | English | Arabic |
|----------|---------|--------|
| **Volunteer** | volunteer, coordinator, responder | متطوع, منسق |
| **Evacuation** | evacuation, relocation, displacement, refuge, flee, escape, deportation | إجلاء, اجلاء, نزوح, لجوء, فرار, هروب |
| **Medical** | medical, treatment, hospital, surgery, clinic, injury, wound, shot, shrapnel | علاج, طبي, مستشف, عملية, إصابة, جرح, أذى |
| **Volunteer family** | volunteer's family, family of volunteer, volunteer's father/mother + treatment/support | أسرة المتطوع, عائلة المتطوع, والد المتطوع |
| **Mental Health** | psychological, mental health, trauma, counseling, PSS | دعم نفسي, صدمة, علاج نفسي |
| **Trapped** | trapped, stranded, stuck, blocked, besieged, rescue | محاصر, عالق, محتجز |
| **Security** | arrest, detention, jail, custody, bail, fine, guarantee, legal, lawyer, harassment, threat | اعتقال, احتجاز, سجن, كفالة, ضمان, محامي, قانوني, تهديد, غرامة |
| **Danger** | danger, risk, threat, emergency, crisis, unsafe | خطر, تهديد, طوارئ, أزمة |
| **Incentive** | incentive, stipend, allowance, salary, volunteer fund | حافز, حوافز, نثرية, نثريات, راتب, مكافأة, صندوق دعم المتطوعين |
| **Communications** | communication, internet, phone, smartphone, Starlink, Wi-Fi, laptop, connectivity, airtime | اتصالات, هاتف, إنترنت, شبكة, تواصل, اتصال |
