# Compliance Screening Prototype

**Branch:** `prototype/compliance-screening`
**Status:** Demo-ready (NOT for production)
**Created:** March 2026

## 🎯 Purpose

This prototype demonstrates the proposed compliance screening feature for OFAC and sanctions list checking. It uses **mock data** to showcase the UI, workflow, and user experience without requiring actual screening APIs or database changes.

## ⚠️ Important Notes

- **This is a PROTOTYPE branch** - Do NOT merge to main
- **Uses mock data** - All beneficiaries and screening results are fictional
- **No real API calls** - Screening is simulated
- **For demo purposes only** - Not production-ready

## 🚀 Quick Start

### 1. Switch to Prototype Branch

```bash
git checkout prototype/compliance-screening
```

### 2. Start Development Server

```bash
npm run dev
```

Server will run on: **http://localhost:3001**

### 3. Login

Use your existing ERR/LoHub credentials. The prototype adds new pages but doesn't change authentication.

### 4. Navigate to New Features

**Option A: Compliance Dashboard**
- Go to: http://localhost:3001/err-portal/compliance
- See all beneficiaries in screening queue
- View, search, and filter
- Click "View" to see individual screening details

**Option B: F1 App Submissions (with screening column)**
- Go to: http://localhost:3001/err-portal/f1-work-plans
- Click "ERR App Submissions" tab
- Notice new "Screening" column with status badges
- Click "View" on any project
- Click "Screening" tab in the dialog

## 📂 New Files Added

### Pages
- `src/app/err-portal/compliance/page.tsx` - Main compliance dashboard
- `src/app/err-portal/compliance/mockData.ts` - Mock data for demo

### Components
- `src/app/err-portal/compliance/components/ComplianceQueue.tsx` - Queue table
- `src/app/err-portal/compliance/components/ScreeningDetailView.tsx` - Individual screening view
- `src/app/err-portal/f1-work-plans/components/ERRAppSubmissions/ScreeningStatusBadge.tsx` - Status badges
- `src/app/err-portal/f1-work-plans/components/ERRAppSubmissions/ProjectScreeningStatus.tsx` - Screening tab

### Modified Files
- `src/app/err-portal/f1-work-plans/components/ERRAppSubmissions/index.tsx` - Added screening column and tab

### Documentation
- `docs/Compliance check feature/COMPLIANCE_FEATURE_PLAN.md` - Complete feature specification
- `docs/Compliance check feature/DEMO_SCRIPT.md` - Demo walkthrough and talking points

## 🎬 Demo Walkthrough

Follow the detailed demo script: `docs/Compliance check feature/DEMO_SCRIPT.md`

**Quick Demo (5 minutes):**
1. Show compliance dashboard (http://localhost:3001/err-portal/compliance)
2. Search for a beneficiary and click "View"
3. Show ERRAppSubmissions with new screening column
4. Open a project and show the new "Screening" tab

## 📊 Mock Data Overview

The prototype includes 11 fictional beneficiaries with different screening statuses:

- **5 Cleared** ✅ - No sanctions match, approved
- **3 Pending** ⏳ - Awaiting screening
- **2 Flagged** ⚠️ - Potential match requiring review
- **1 Rejected** ❌ - Confirmed OFAC match (payment blocked)

## 🎨 Key Features Demonstrated

### 1. Compliance Dashboard
- Statistics overview (Total, Pending, Cleared, Flagged, Rejected)
- Searchable/filterable queue
- Individual beneficiary screening details
- Simulated screening actions

### 2. F1 Integration
- New "Screening" column in ERRAppSubmissions table
- Color-coded status badges
- New "Screening" tab in project detail dialog
- Project-level screening summary

### 3. Visual Design
- Clean, professional UI
- Color-coded statuses (Green/Yellow/Orange/Red)
- Warning banners for flagged/rejected cases
- Responsive layout

### 4. User Experience
- No disruption to existing F1 workflow
- One-click navigation between dashboards
- Clear status indicators
- Intuitive screening process

## 🔄 Switching Back to Main Branch

When done with the demo:

```bash
git checkout feature/dashboard-f1-ocr-surveys
# or
git checkout main
```

The prototype changes will not affect your main work.

## 🐛 Known Limitations (Expected for Prototype)

- **Mock data only** - No real database integration
- **Simulated screening** - No actual API calls
- **No state persistence** - Refresh resets mock data
- **Limited error handling** - Demo-focused, not production-ready
- **No user permissions** - Everyone can access compliance dashboard
- **No translations** - English only for new components

## 📝 Feedback & Questions

After viewing the prototype, please provide feedback on:

1. **UI/UX:** Is the interface clear and intuitive?
2. **Workflow:** Does the integration feel seamless?
3. **Features:** Are there missing capabilities?
4. **Concerns:** Any privacy, security, or operational concerns?

Document feedback in: `docs/Compliance check feature/DEMO_SCRIPT.md` (Feedback Capture Template section)

## 🚦 Next Steps (If Approved)

1. **Select screening provider** (WorldCheck, Dow Jones, Open Sanctions, etc.)
2. **Finalize database schema** (4 new tables)
3. **Implement real API integration** (replace mock data)
4. **Add security & permissions** (role-based access)
5. **Testing & UAT** (compliance officers test full workflow)
6. **Production deployment** (after approval)

Estimated timeline: 10-12 weeks from approval to production

## 📚 Additional Resources

- **Feature Plan:** `docs/Compliance check feature/COMPLIANCE_FEATURE_PLAN.md`
- **Demo Script:** `docs/Compliance check feature/DEMO_SCRIPT.md`
- **Original Requirements:** `docs/Compliance check feature/Manual Compliance Screening Plan In Portal.docx`
- **PRD:** `docs/Compliance check feature/MAP PRODUCT REQUIREMENTS DOCUMENT (PRD) - Compliance Checks.docx`

## 🆘 Troubleshooting

### Server won't start
```bash
# Clear cache and reinstall
rm -rf node_modules .next
npm install
npm run dev
```

### Mock data not loading
- Check browser console for errors (F12)
- Verify you're on the `prototype/compliance-screening` branch
- Clear browser cache and refresh

### Components not rendering
- Ensure all dependencies are installed: `npm install`
- Check for TypeScript errors: `npm run lint`

### Can't access compliance dashboard
- Verify URL: http://localhost:3001/err-portal/compliance
- Check that you're logged in
- Try accessing from ERR portal homepage first

## 📧 Contact

For questions about the prototype:
- Review the demo script first
- Check the feature plan for technical details
- Contact the development team

---

**Remember: This is a prototype for demonstration purposes. Do not use in production or commit to main branch.**
