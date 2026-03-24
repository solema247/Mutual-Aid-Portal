# Compliance Screening Prototype - Demo Script

**Version:** Prototype v1.0
**Date:** March 2026
**Branch:** `prototype/compliance-screening`
**Status:** Demo-ready (not for production)

---

## 📋 Table of Contents

1. [Demo Setup](#demo-setup)
2. [Demo Flow](#demo-flow)
3. [Talking Points](#talking-points)
4. [Key Features to Highlight](#key-features-to-highlight)
5. [Q&A Preparation](#qa-preparation)
6. [Technical Details](#technical-details)

---

## 🎬 Demo Setup

### Before the Demo

1. **Switch to prototype branch:**
   ```bash
   git checkout prototype/compliance-screening
   ```

2. **Start the development server:**
   ```bash
   npm run dev
   ```
   Server runs on: http://localhost:3001

3. **Login credentials:**
   - Use your existing ERR/LoHub credentials
   - Ensure you have compliance permissions (or use admin account)

4. **Browser setup:**
   - Use latest Chrome/Firefox for best experience
   - Open browser console (F12) if you need to show technical details
   - Set zoom to 100%

5. **Have these ready:**
   - This demo script (print or second screen)
   - Feature plan document (`COMPLIANCE_FEATURE_PLAN.md`)
   - Questions log for capturing stakeholder feedback

### Demo Environment Check

Before starting, verify:
- ✅ Server running on port 3001
- ✅ Can access `/err-portal/compliance` page
- ✅ Can see ERRAppSubmissions with new screening column
- ✅ Mock data loads correctly (11 beneficiaries)

---

## 🎯 Demo Flow (15-20 minutes)

### Part 1: The Problem (2 minutes)

**Intro:**
> "Currently, we process about $2M per month in aid payments to ERRs, but we don't have a systematic way to screen fund recipients against OFAC and other sanctions lists. This creates compliance risk and could jeopardize our funding relationships."

**Key Points:**
- F1-to-payment timeline is 1-3 days (fast!)
- Need to add sanctions screening without slowing this down
- Manual screening is error-prone and not auditable
- Donors require compliance reporting

### Part 2: The Solution Overview (3 minutes)

**Navigate to:** `/err-portal/compliance`

**Intro:**
> "This prototype shows how we'll integrate automated sanctions screening into our existing F1 workflow without disrupting operations."

**Show:**
1. **Compliance Dashboard** - Main screening interface
2. **Statistics Cards** - At-a-glance metrics
   - Total beneficiaries
   - Pending (awaiting screening)
   - Cleared (approved)
   - Flagged (requires review)
   - Rejected (sanctions match)
3. **Demo Notice** - Highlight that this uses mock data

**Talking Point:**
> "Notice the clean, organized interface. Compliance officers can see all pending screenings in one place, with clear status indicators."

### Part 3: Screening Queue (5 minutes)

**Still on compliance dashboard, scroll to queue table**

**Show:**
1. **Search/Filter** - Demonstrate searching by name
   - Search for "Ahmed" → Shows Ahmed Mohamed Ali
   - Filter by status "Pending" → Shows only pending cases

2. **Queue Table** - Point out columns:
   - Name, Position (Program/Finance/Reporting Officer)
   - F1 Project (linked to specific aid project)
   - ERR Code (which Emergency Response Room)
   - State/Location
   - Status badge (color-coded: Green/Yellow/Orange/Red)
   - Queued date

**Talking Point:**
> "All beneficiary information is extracted automatically from ID documents attached to F1 forms. The system detects ID pages intelligently - whether they're at the beginning, middle, or end of the PDF."

3. **Click "View" on a Pending beneficiary** (e.g., Fatima Hassan Ibrahim)

### Part 4: Individual Screening Process (5 minutes)

**In the screening detail modal:**

**Show Section 1 - Beneficiary Information:**
- Full Name, Position, Phone
- ID Number (extracted from ID document)
- Date of Birth
- Location

**Talking Point:**
> "This information is automatically extracted from ID documents using OCR and AI. We only extract the minimum data needed for OFAC screening: name, ID number, and date of birth. We don't store photos, addresses, or other unnecessary personal data."

**Show Section 2 - Associated F1 Project:**
- Project name and ERR code
- Links this screening to specific aid distribution

**Talking Point:**
> "Every screening is linked to a specific F1 project, creating a complete audit trail from aid request to payment."

**Demo Action - Run Screening:**
1. Click **"Run OFAC Screening Check"** button
2. Wait for simulated process (2 seconds)
3. Alert appears: "Screening complete! (Demo mode...)"

**Talking Point:**
> "In production, this button calls external screening APIs like WorldCheck, Dow Jones, or Open Sanctions. Results come back in seconds. For this demo, it's simulated."

**Demo Action - Record Result:**
1. Type in notes field: "No OFAC match found. Cleared for payment."
2. Click **"Clear"** button (green)
3. Alert appears confirming save

**Talking Point:**
> "Compliance officers can clear, flag for review, or reject beneficiaries. Every action is logged with timestamp, officer name, and justification notes."

4. **Close modal and show queue updates** (in real system, status would change)

### Part 5: Integration with F1 Workflow (5 minutes)

**Navigate to:** `/err-portal/f1-work-plans`

**Click on:** "ERR App Submissions" tab

**Show the table - point out NEW column:**
> "Here's where the magic happens - compliance is now integrated into the F1 review process."

**Show:**
1. **New "Screening" column** with status badges:
   - ✅ Cleared (green) - Ready for payment
   - ⏳ Pending (yellow) - Screening in progress
   - ⚠️ Flagged (orange) - Requires review
   - ❌ Rejected (red) - Payment blocked

2. **Click "View" on project with Flagged status** (ERR-GZ-005 - Gezira project)

### Part 6: F1 Project Detail - Screening Tab (3 minutes)

**In the project dialog:**

**Show:**
1. **NEW "Screening" tab** (with pending count badge if applicable)
2. **Click on Screening tab**

**Show Screening Tab Content:**
1. **Overall Status Summary:**
   - Status badge for whole project
   - Count breakdown: Total, Cleared, Pending, Flagged

2. **Beneficiaries List:**
   - All 3 officers for this project
   - Individual screening status for each
   - ID numbers shown

3. **Warning/Info Banners:**
   - If flagged: Orange warning about potential match
   - If pending: Yellow info about screening in progress
   - If rejected: Red alert that payment is blocked

**Talking Point:**
> "F1 reviewers don't need to leave their workflow. They can see screening status right here in the project detail. If there's an issue, they're warned immediately."

4. **Click "View Full Screening Details"** → Opens compliance dashboard

**Talking Point:**
> "One-click access to the full compliance dashboard for detailed investigation."

### Part 7: Different Scenarios (2 minutes)

**Back in ERRAppSubmissions, show different projects:**

1. **Cleared Project** (ERR-KH-001):
   - All green badges ✅
   - "All beneficiaries cleared, payment can proceed"

2. **Pending Project** (ERR-DF-003):
   - Yellow badge ⏳
   - "Can approve F1 now, but payment waits for screening completion"

3. **Flagged Project** (ERR-GZ-005):
   - Orange badge ⚠️
   - "Potential match found - requires compliance officer review"

4. **Rejected Project** (ERR-BN-001):
   - Red badge ❌
   - "Exact OFAC match - payment BLOCKED until resolved"

**Talking Point:**
> "The system handles all four scenarios gracefully. Most beneficiaries (90%+) will have prior clearances and auto-approve. Only new or flagged cases require manual review."

---

## 💡 Talking Points

### Opening (Problem Statement)

**Key Message:** "We need to balance compliance with operational speed."

- Currently processing $2M/month with 1-3 day turnaround
- No systematic sanctions screening = compliance risk
- Manual screening is slow, error-prone, not auditable
- Donors require documented compliance for all payments

### Solution Overview

**Key Message:** "Automated, non-disruptive compliance layer."

- Integrates seamlessly into existing F1 workflow
- Background processing - doesn't slow down uploads
- Intelligent ID detection - works with any ERR format
- 90% auto-clearance through prior screening lookup
- Human-in-the-loop for flagged cases
- Complete audit trail for reporting

### Technical Highlights

**Key Message:** "Built for privacy, security, and scalability."

- **Privacy by design:** Only extracts minimum required data (name, ID number, DOB)
- **Intelligent detection:** Scans entire PDF to find ID documents (not fixed pages)
- **Data minimization:** Raw ID images never extracted separately
- **Encrypted storage:** All PII encrypted at rest and in transit
- **Audit logging:** Every action tracked with timestamp and user
- **Scalable:** Queue-based processing handles volume spikes

### Business Impact

**Key Message:** "Enables compliant scaling."

- **Zero disruption:** Maintains 1-3 day F1-to-payment timeline
- **100% coverage:** All beneficiaries screened before payment
- **Audit-ready:** Complete documentation for donor reporting
- **Risk mitigation:** Zero sanctions violations
- **Scalable:** Supports growth to higher payment volumes

---

## 🌟 Key Features to Highlight

### 1. Seamless Integration
- ✅ No changes to F1 upload process for ERRs
- ✅ No extra steps for staff
- ✅ Works in background automatically

### 2. Intelligent ID Detection
- ✅ Scans entire PDF (not just last pages)
- ✅ Multi-criteria detection (text patterns + face detection + labels)
- ✅ Handles any ERR submission format

### 3. Privacy & Security
- ✅ Minimal data extraction (only 3 fields)
- ✅ No ID photos stored separately
- ✅ Encrypted database storage
- ✅ Role-based access control

### 4. Efficient Workflow
- ✅ Prior screening lookup (instant for repeat beneficiaries)
- ✅ Queue-based processing
- ✅ Clear status indicators
- ✅ One-click navigation between dashboards

### 5. Audit Trail
- ✅ Every screening logged
- ✅ Officer name + timestamp
- ✅ Justification notes required
- ✅ Exportable for donor reporting

### 6. Visual Clarity
- ✅ Color-coded status badges
- ✅ At-a-glance statistics
- ✅ Warning banners for issues
- ✅ Clean, intuitive UI

---

## ❓ Q&A Preparation

### Expected Questions & Answers

#### Q: "Will this slow down our F1 approval process?"
**A:** No. The screening happens in the background after upload. 90% of beneficiaries will have prior clearances and auto-approve instantly. Only new beneficiaries (10%) need manual screening, which happens in parallel while the F1 is being reviewed for other aspects (budget, project quality, etc.).

#### Q: "What if ID documents are missing or unclear?"
**A:** If no ID documents are detected, the system marks screening as "Not Required" and allows the F1 to proceed. We can configure whether this requires manual override or not. In Phase 2, we can add a notification to ERRs requesting clearer ID documents.

#### Q: "Which screening services will you integrate with?"
**A:** We're evaluating several options:
- WorldCheck (Refinitiv)
- Dow Jones Risk & Compliance
- ComplyAdvantage
- Open Sanctions (free, open-source)

We'll select based on cost, API reliability, coverage, and donor requirements. The system is designed to support multiple providers.

#### Q: "How do you handle false positives?"
**A:** The compliance officer reviews all flagged cases. They can see match details (name similarity %, DOB match, ID match) and add justification notes. If it's a false positive (e.g., common name, different person), they mark it as "Cleared" with explanation. Full audit trail is preserved.

#### Q: "What happens if there's a confirmed OFAC match?"
**A:** Payment is BLOCKED immediately. The F1 cannot be approved. System sends urgent notification to LoHub leadership. Compliance officer documents the incident. ERR is notified to resubmit F1 with different beneficiary. Zero-tolerance policy.

#### Q: "How is personal data protected?"
**A:** Multiple layers:
1. Only 3 fields extracted (name, ID#, DOB) - no photos, addresses, etc.
2. Transient processing - raw OCR text discarded immediately
3. Database encryption at rest
4. TLS encryption in transit
5. Role-based access (only compliance officers)
6. Audit logs track all data access

#### Q: "Can we screen historical F1s retroactively?"
**A:** Yes, Phase 5 includes batch processing for historical F1s. We'll run screenings on all past beneficiaries and update their status. This creates a complete compliance record.

#### Q: "How much will this cost?"
**A:** Costs include:
- Development: [TBC based on timeline]
- 3rd party screening API: $X/month (varies by provider and volume)
- Infrastructure: Minimal (uses existing Supabase)
Total estimated: $Y/month for 1000 screenings

Open Sanctions is free if budget is a constraint.

#### Q: "When can we go live?"
**A:** Proposed timeline:
- Phase 1 (MVP): 4-6 weeks - Core functionality
- Phase 2 (Integration): 2-3 weeks - 3rd party API
- Phase 3 (Testing): 2 weeks - UAT & security testing
- Phase 4 (Deployment): 1 week - Production rollout
- **Total: ~10-12 weeks** from approval to production

#### Q: "How do we train compliance officers?"
**A:** We'll provide:
- User manual with screenshots
- Video walkthrough
- Hands-on training session (2 hours)
- Test environment for practice
- Ongoing support during first month

#### Q: "What reports can we generate?"
**A:** Export features include:
- Compliance summary per F1 project
- All screenings by date range
- Flagged/rejected cases only
- Audit log export
- Format: CSV, Excel, PDF
These can be submitted to donors for compliance reporting.

---

## 🔧 Technical Details (For Technical Stakeholders)

### Architecture

**Frontend:**
- Next.js 14 (React 18, TypeScript)
- Tailwind CSS + Radix UI components
- Client-side state management

**Backend:**
- Next.js API routes
- Supabase (PostgreSQL database)
- Google Cloud Vision (OCR)
- OpenAI GPT-3.5 (ID parsing)

**3rd Party Integration:**
- OFAC/AML screening APIs (TBD)
- Email notifications

### Database Schema (4 New Tables)

1. **beneficiary_identities** - Extracted identity data
2. **screening_queue** - Pending screenings
3. **screening_results** - Screening outcomes
4. **compliance_audit_log** - Full audit trail

### API Routes (9 New Endpoints)

- `POST /api/compliance/extract-identity` - ID extraction
- `POST /api/compliance/screen` - Run screening
- `POST /api/compliance/save-result` - Save result
- `GET /api/compliance/queue` - Fetch queue
- `GET /api/compliance/project/:id/summary` - Project summary
- ... [see feature plan for complete list]

### Security Measures

- Row-level security (RLS) on Supabase
- Role-based permissions
- Encrypted storage (database encryption)
- TLS for API calls
- Input validation & sanitization
- SQL injection protection
- XSS protection

### Performance

- Background processing (non-blocking)
- OCR: ~15-30 seconds per PDF
- Screening API: ~2-5 seconds per beneficiary
- Prior screening lookup: <1 second
- Target: 95% of F1s processed within 1 day

### Scalability

- Queue-based architecture
- Horizontal scaling ready
- Batch processing support
- Can handle 100+ concurrent screenings
- Designed for 1000-5000 beneficiaries/month

---

## 📸 Demo Screenshots (Capture During Demo)

**Recommended screenshots for documentation:**

1. ✅ Compliance Dashboard - Full view
2. ✅ Statistics cards showing metrics
3. ✅ Screening queue table
4. ✅ Beneficiary detail modal (pending case)
5. ✅ ERRAppSubmissions with screening column
6. ✅ F1 project detail - Screening tab
7. ✅ Warning banner for flagged case
8. ✅ Alert banner for rejected case

**How to capture:**
- Use browser screenshot tool (Cmd+Shift+4 on Mac)
- Save to `docs/Compliance check feature/screenshots/`
- Name files descriptively (e.g., `compliance-dashboard.png`)

---

## 📝 Feedback Capture Template

During/after demo, capture stakeholder feedback:

### What stakeholders liked:
- [ ] Feature 1: _____
- [ ] Feature 2: _____
- [ ] Feature 3: _____

### Concerns raised:
- [ ] Concern 1: _____ (Response: _____)
- [ ] Concern 2: _____ (Response: _____)

### Requested changes:
- [ ] Change 1: _____ (Priority: High/Medium/Low)
- [ ] Change 2: _____ (Priority: High/Medium/Low)

### Questions to follow up on:
- [ ] Question 1: _____
- [ ] Question 2: _____

### Decision:
- [ ] Approved to proceed with development
- [ ] Approved with modifications: _____
- [ ] On hold pending: _____
- [ ] Not approved (reason: _____)

---

## ✅ Demo Checklist

**Before Demo:**
- [ ] Prototype branch checked out
- [ ] Server running (localhost:3001)
- [ ] Browser prepared (console open if needed)
- [ ] Demo script printed or on second screen
- [ ] Mock data verified
- [ ] Backup plan (slides/video) if tech fails

**During Demo:**
- [ ] Introduce problem (2 min)
- [ ] Show compliance dashboard (3 min)
- [ ] Demo screening queue (5 min)
- [ ] Demo individual screening (5 min)
- [ ] Show F1 integration (5 min)
- [ ] Highlight screening tab (3 min)
- [ ] Show different scenarios (2 min)
- [ ] Q&A (remaining time)

**After Demo:**
- [ ] Capture stakeholder feedback
- [ ] Take screenshots for documentation
- [ ] Log any bugs/issues found
- [ ] Send follow-up email with summary
- [ ] Update feature plan based on feedback

---

## 🚀 Next Steps After Demo

### If Approved:

1. **Immediate (Day 1-2):**
   - Select 3rd party screening provider
   - Finalize database schema
   - Get API credentials for screening service

2. **Short-term (Week 1-2):**
   - Begin MVP development sprint
   - Set up test environment
   - Create test dataset

3. **Medium-term (Week 3-6):**
   - Complete MVP implementation
   - Internal testing
   - Security audit

4. **Long-term (Week 7-12):**
   - 3rd party API integration
   - User acceptance testing
   - Production deployment
   - Training & rollout

### If Changes Requested:

1. Document all requested changes
2. Prioritize (P0/P1/P2)
3. Revise feature plan
4. Update prototype
5. Schedule follow-up demo

---

**Demo Contact:**
[Your Name]
[Your Email]
[Your Phone]

**Supporting Documents:**
- Feature Plan: `docs/Compliance check feature/COMPLIANCE_FEATURE_PLAN.md`
- Original Requirements: `docs/Compliance check feature/*.docx`
- Technical Spec: [TBD after approval]

---

**Good luck with the demo! 🎉**
