# Compliance Screening - User Journey Demo

**Two User Perspectives:**
1. **Program Manager (ERR)** - Uploading F1 (unchanged experience)
2. **Finance/Compliance Officer** - Reviewing & Approving with Screening

**Total Demo Time:** 8-10 minutes

---

## 🎥 Video Recording Instructions

### Tools to Record Demo Video

**Option 1: Loom (Recommended - Easiest)**
- Visit: https://www.loom.com
- Free plan allows 5-minute videos
- Click "Record" → "Screen + Camera"
- Follow script below
- Automatic hosting & sharing

**Option 2: Mac Built-in (QuickTime/Screenshot)**
- Press `Cmd + Shift + 5`
- Select "Record Entire Screen" or "Record Selected Portion"
- Click record, follow script
- Stop with button in menu bar
- Save as .mov file

**Option 3: Windows Game Bar**
- Press `Windows + G`
- Click record button
- Follow script below
- Stop recording
- Find in Videos/Captures folder

**Option 4: OBS Studio (Professional)**
- Download: https://obsproject.com
- More control over recording quality
- Can add overlays, multiple sources

### Recording Setup
- **Resolution:** 1920x1080 or 1280x720
- **Frame rate:** 30 fps minimum
- **Audio:** Use good microphone or headset
- **Browser zoom:** Set to 100% for clarity
- **Close unnecessary tabs/apps**
- **Test audio levels before full recording**

---

## 📖 Full Demo Script (8-10 minutes)

### SCENE 1: Introduction (30 seconds)
**[Screen: Your face or blank screen with title]**

**Narrator:**
> "Hello! Today I'll show you how our new compliance screening feature works from two perspectives: an ERR Program Manager uploading an F1 form, and a Compliance Officer reviewing and approving payments. The key benefit? Zero disruption to existing workflows while ensuring 100% OFAC compliance."

**[Transition to screen share]**

---

### SCENE 2: Program Manager Perspective (2-3 minutes)

**[Navigate to: http://localhost:3001/login]**

**Narrator:**
> "First, let's see the Program Manager's experience. I'm logging in as a Program Manager from Khartoum ERR..."

**[Login with ERR credentials]**

**ACTION:** Login and navigate to F1 Work Plans

**[Navigate to: /err-portal/f1-work-plans → Direct Upload tab]**

**Narrator:**
> "As a Program Manager, I need to submit an F1 work plan for our emergency food distribution project. The process is exactly the same as before - no new steps."

**[Screen shows: Direct Upload form]**

**ACTION:** Fill out F1 upload form
- Select State: "Khartoum"
- Select Emergency Room: "ERR-KH-001"
- Select a sample PDF from your files (or use any PDF as demo)

**Narrator:**
> "I select my state, emergency room, and upload the F1 form with attached ID documents for our three officers: Program Officer, Finance Officer, and Reporting Officer."

**[Click Upload & Process]**

**Narrator:**
> "I upload and the system processes it with OCR as usual. Behind the scenes - and this is new - the system automatically extracts identity information from the ID documents attached to my F1."

**[Wait for OCR processing, show the extraction review screen]**

**Narrator:**
> "I review the extracted data, make any corrections needed, and confirm the upload."

**[Click Confirm Upload]**

**[Success message appears]**

**Narrator:**
> "That's it! From my perspective as a Program Manager, nothing has changed. I don't need to do anything extra for compliance. The system automatically queues the beneficiaries for screening in the background."

**KEY POINT - Show on screen as text overlay:**
```
✅ Zero disruption for ERRs
✅ No extra steps
✅ Automatic ID extraction
✅ Background compliance check
```

---

### SCENE 3: Background Process Visualization (1 minute)

**[Navigate to: /err-portal/compliance]**

**Narrator:**
> "Now, let's see what happens behind the scenes. While the Program Manager moves on with their work, the compliance system has automatically extracted three beneficiaries from that F1 and added them to the screening queue."

**[Show compliance dashboard with new entries]**

**ACTION:** Point out the 3 new entries in the queue

**Narrator:**
> "The system identified ID documents in the F1 PDF, extracted names, ID numbers, and dates of birth, and checked if we've screened these people before. In this case, two of them have prior clearances from previous F1s, so they're automatically approved. Only one new person needs manual screening."

**[Filter to show "Pending" status]**

**Narrator:**
> "This pending beneficiary will be screened before payment is processed. Let me show you how that works..."

---

### SCENE 4: Compliance Officer Perspective (4-5 minutes)

**[Stay on: /err-portal/compliance]**

**Narrator:**
> "Now I'm switching to the Compliance Officer role. This is a new dashboard specifically for compliance screening."

**[Show dashboard overview]**

**ACTION:** Point out statistics cards

**Narrator:**
> "At a glance, I can see: 11 total beneficiaries, 3 pending screening, 5 cleared, 2 flagged for review, and 1 rejected. Let me work through a pending case."

**[Click on a Pending beneficiary - e.g., Fatima Hassan Ibrahim]**

**ACTION:** Click "View" button

**[Beneficiary detail modal opens]**

**Narrator:**
> "Here's Fatima Hassan Ibrahim, a Finance Officer for the Darfur Medical Supplies project. I can see her full information extracted from the ID document: name, ID number, date of birth, and the F1 project she's associated with."

**[Scroll through beneficiary information section]**

**Narrator:**
> "To screen her, I click 'Run OFAC Screening Check'."

**[Click "Run OFAC Screening Check" button]**

**[Wait 2 seconds for simulation]**

**Narrator:**
> "In production, this calls external screening APIs like WorldCheck or Dow Jones. For this demo, it's simulated. The system checks her name, ID number, and date of birth against OFAC and other sanctions lists."

**[Alert appears: "Screening complete!"]**

**Narrator:**
> "No match found. I'll add a note and mark her as cleared."

**[Type in notes field: "No OFAC match found. Cleared for payment."]**

**[Click "Clear" button (green)]**

**[Success confirmation]**

**Narrator:**
> "Perfect. This beneficiary is now cleared and the F1 can proceed to payment approval. All of this is logged: my name, timestamp, the screening result, and my notes."

**[Close modal, return to queue]**

**Narrator:**
> "Now let me show you a flagged case - this is where the human-in-the-loop is critical."

**[Filter by "Flagged" status]**

**[Click on Omar Abdullah Khalil]**

**Narrator:**
> "Omar Abdullah Khalil was flagged because the system found an 87% name similarity with someone on the OFAC list. But look at the details: different date of birth, different ID number. This is a false positive - a common name variation."

**[Show match details in the UI]**

**Narrator:**
> "As the compliance officer, I can see the match details, assess the risk, and make the call. In this case, it's clearly a different person. I'll mark it as cleared with justification."

**[Would add notes and clear, but we'll skip for time]**

**Narrator:**
> "And finally, let me show you a rejected case - the worst-case scenario."

**[Filter by "Rejected"]**

**[Click on Hassan Mohamed Al-Bashir]**

**Narrator:**
> "Hassan Mohamed Al-Bashir: exact name match, exact date of birth match, confirmed OFAC SDN list entry. This person is on the sanctions list. The system has blocked this F1 from payment approval until this is resolved."

**[Show the rejection details]**

**Narrator:**
> "The compliance officer has documented this, escalated to LoHub leadership, and the ERR will be notified to resubmit with a different beneficiary. Zero tolerance for sanctions violations."

---

### SCENE 5: F1 Review & Approval Integration (2-3 minutes)

**[Navigate to: /err-portal/f1-work-plans → ERR App Submissions tab]**

**Narrator:**
> "Now let's see how this integrates into the F1 approval workflow. I'm now in the role of a Finance Officer reviewing F1 submissions."

**[Show ERR App Submissions table]**

**ACTION:** Point out the new "Screening" column

**Narrator:**
> "Notice the new 'Screening' column. Each F1 now shows its compliance status at a glance. Green means all beneficiaries are cleared. Yellow means screening is in progress. Orange means there's a flagged case to review. Red means payment is blocked."

**[Point to different status badges]**

**Narrator:**
> "Let me open a flagged project to show you what the reviewer sees."

**[Click "View" on the Gezira project with flagged status]**

**[Project detail dialog opens]**

**Narrator:**
> "This is the standard F1 project detail view. But now there's a new tab: Screening."

**[Click on "Screening" tab]**

**[Screening tab shows]**

**Narrator:**
> "Here's the screening summary for this project. Three beneficiaries: two cleared, one flagged. I can see which person is flagged and why."

**[Show the beneficiary list]**

**Narrator:**
> "There's a warning banner telling me to review the compliance dashboard before approving. I can click here to go directly to the full screening details."

**[Point to "View Full Screening Details" button]**

**Narrator:**
> "As a Finance Officer, I have full visibility into the compliance status. If everything is cleared, I approve the F1 and proceed to payment. If there are flags, I check with the compliance officer first. If there's a rejection, I cannot approve - the button would be disabled."

**[Switch to Details tab, show the feedback/approval section]**

**ACTION:** Show that approval still works normally when cleared

**Narrator:**
> "For cleared projects, the approval process is exactly the same as before. No delays, no extra steps. The compliance check happened in the background and everything is green. I can approve and proceed to payment."

---

### SCENE 6: Summary & Benefits (1 minute)

**[Screen: Return to compliance dashboard or show both dashboards side by side]**

**Narrator:**
> "Let's recap what we've seen:"

**[Show bullet points on screen as text overlay]**

**1. Program Managers (ERRs):**
- ✅ No changes to F1 upload process
- ✅ No extra steps or forms
- ✅ Automatic ID extraction
- ✅ Zero disruption

**2. Compliance Officers:**
- ✅ Dedicated dashboard for screening
- ✅ Automatic queue from F1 uploads
- ✅ 90% auto-clearance through prior screenings
- ✅ Manual review for new/flagged cases
- ✅ Complete audit trail

**3. Finance Officers:**
- ✅ Clear visibility into screening status
- ✅ Integrated into existing F1 review
- ✅ No payment delays for cleared cases
- ✅ Automatic blocks for sanctions matches

**Narrator:**
> "This system enables us to process $2 million per month in aid payments with 100% OFAC compliance, zero sanctions violations, and no disruption to our 1-3 day turnaround time. It's privacy-first, with only minimal data extraction, full encryption, and complete audit trails for donor reporting."

**[Fade to closing screen]**

**Narrator:**
> "Thank you for watching. For questions or a live demo, please reach out to our team."

---

## 📝 Post-Recording Checklist

After recording, edit and add:
- [ ] Title slide at beginning (10 seconds)
- [ ] Text overlays for key points
- [ ] Highlight/zoom on important UI elements
- [ ] Smooth transitions between scenes
- [ ] Background music (optional, keep quiet)
- [ ] Captions/subtitles (recommended)
- [ ] Closing slide with contact info (10 seconds)

### Recommended Video Editing Tools
- **Free:** DaVinci Resolve, iMovie (Mac), Windows Video Editor
- **Paid:** Camtasia, Adobe Premiere
- **Quick:** Loom (edit in browser), Descript

---

## 🎯 Alternative: Step-by-Step Screenshots Guide

If video is not feasible, create a screenshot-based guide:

1. Take screenshots at each major step (use Cmd+Shift+4 on Mac)
2. Annotate with arrows and text (use Skitch, Snagit, or Preview)
3. Compile into PowerPoint or PDF
4. Add narration notes below each screenshot
5. Present live or share document

---

## 📊 Key Metrics to Emphasize

Throughout the demo, emphasize these numbers:

- **$2M/month** - Current payment volume
- **1-3 days** - F1-to-payment timeline (unchanged)
- **90%** - Auto-clearance rate (no manual work)
- **100%** - OFAC screening coverage
- **0** - Sanctions violations target
- **3 fields** - Minimal data extraction (name, ID, DOB)
- **10-12 weeks** - Implementation timeline

---

## 🎬 Quick 3-Minute Version (Elevator Pitch)

If time is limited, record a condensed version:

**1. Problem (30 sec):**
Show F1 upload → "No systematic screening = compliance risk"

**2. Solution Overview (30 sec):**
Show compliance dashboard → "Automated OFAC screening, integrated workflow"

**3. Key Feature: Queue (60 sec):**
Show pending case → Run screening → Mark cleared

**4. Key Feature: Integration (60 sec):**
Show F1 table with screening column → Open screening tab

**5. Close (30 sec):**
Show benefits → "100% compliance, zero disruption, 1-3 day timeline maintained"

---

## 💡 Pro Tips for Video Recording

### Before Recording:
- Write a script and rehearse
- Clear browser cache
- Close unnecessary tabs
- Set browser to 100% zoom
- Prepare mock data scenarios
- Have demo script open on second screen

### During Recording:
- Speak slowly and clearly
- Pause between scenes (easy to edit)
- Use cursor to point at elements
- Explain what you're doing before clicking
- If you make a mistake, pause and restart from that scene

### After Recording:
- Watch the full recording
- Note timestamps for scenes
- Add text overlays for key points
- Trim long pauses
- Add intro/outro slides
- Export in 1080p

### Narration Tips:
- Use conversational tone (not robotic)
- Emphasize benefits, not just features
- Use "we" and "you" (not "the system")
- Pause for effect after key points
- Smile while talking (improves voice tone)

---

## 📤 Sharing the Video

### For Internal Review:
- Upload to Google Drive / Dropbox / OneDrive
- Share link with team
- Request feedback

### For External Stakeholders:
- Upload to Loom (easiest)
- Upload to YouTube (unlisted)
- Embed in presentation
- Include in email with demo script

### File Size Tips:
- Aim for < 100MB if emailing
- Compress with HandBrake if needed
- Or share via link instead of attachment

---

## 🆘 Troubleshooting Common Issues

**Issue: UI not loading correctly**
- Clear browser cache and refresh
- Restart dev server: `npm run dev`
- Check for console errors (F12)

**Issue: Mock data not showing**
- Verify you're on prototype branch
- Check mockData.ts file exists
- Refresh page

**Issue: Audio quality poor**
- Use external microphone or headset
- Record in quiet room
- Adjust microphone sensitivity

**Issue: Video file too large**
- Reduce resolution to 720p
- Lower frame rate to 24-30 fps
- Compress after recording

---

## 📧 Video Script Template (Copy-Paste)

Use this script for voice-over:

```
[INTRO]
Hello! Today I'll demonstrate our new compliance screening feature from two perspectives: a Program Manager uploading an F1, and a Finance Officer reviewing and approving payments.

[SCENE 1: PROGRAM MANAGER]
First, the Program Manager experience. As an ERR Program Manager, I'm submitting an F1 work plan. The process is unchanged - select state, emergency room, upload F1 with ID documents, review OCR extraction, and confirm. That's it. Behind the scenes, the system automatically extracts beneficiary identities and queues them for compliance screening.

[SCENE 2: BACKGROUND]
While the Program Manager continues their work, the system has detected three beneficiaries from the ID documents. Two have prior clearances - automatic approval. One is new and needs manual screening.

[SCENE 3: COMPLIANCE OFFICER]
Now as a Compliance Officer, I see a dedicated dashboard. Three pending, five cleared, two flagged, one rejected. Let me screen a pending case. I click view, see the beneficiary details, run OFAC screening - no match found - mark as cleared with notes. Done. This is now documented in the audit trail.

For a flagged case, I see a potential match but different details - a false positive. I can clear it with justification. For a rejected case, we have an exact OFAC match - payment is blocked, escalation sent, ERR will be notified.

[SCENE 4: FINANCE OFFICER]
Now as a Finance Officer reviewing F1s, I see a new screening column. Green means cleared, yellow means pending, orange means flagged, red means blocked. Opening a project, there's a new screening tab showing all beneficiaries and their status. Full visibility. If cleared, I approve as normal. If flagged or rejected, I check with compliance first.

[CLOSE]
To summarize: Zero disruption for ERRs, automated screening, 90% auto-clearance, full audit trail, 100% OFAC compliance, and we maintain our 1-3 day timeline. Thank you for watching.
```

---

**Need help recording? Let me know and I can:**
1. Create a more detailed shot-by-shot storyboard
2. Generate narration text for each screen
3. Help troubleshoot recording issues
4. Review your recorded video and provide feedback
