/**
 * Static FAQ document injected into the bot's system prompt.
 * Add/edit entries here to improve the bot's coverage of portal questions.
 */
export const PORTAL_FAQ = `
# Mutual Aid Sudan – ERR Portal FAQ

## About the Portal
The ERR (Emergency Response Room) Portal is used by the Mutual Aid Sudan network to coordinate
humanitarian aid distribution across Sudan. It tracks work plans, fund disbursement, financial
reporting, and programme results for Emergency Response Rooms (ERRs) operating in different states.

## Grant Lifecycle & Forms
- **F1 (Work Plan)**: ERRs submit an F1 work plan to request funding. It describes planned activities,
  target beneficiaries, and estimated costs. Status: pending → approved.
- **F2 (Fund Approval/MOU)**: Once an F1 is approved, an MOU is signed and funds are committed.
  The F2 step tracks the fund allocation and transfer date.
- **F3 (MOU)**: The signed Memorandum of Understanding between the partner and Mutual Aid Sudan.
- **F4 (Financial Report)**: After funds are transferred, ERRs must submit an F4 expense report
  within 32 days of the transfer date. It lists all expenditures with receipts.
- **F5 (Programme Report)**: The F5 captures programme outcomes — how many individuals and families
  were reached, what activities were completed, and any lessons learned.

## Statuses
- **Waiting**: Report has not been submitted yet.
- **Under Review / In Review**: Report submitted and being reviewed by the programme team.
- **Partial**: Some F4 reports submitted but not all expenses accounted for.
- **Completed**: Report reviewed and accepted.
- **Overdue**: Project is past the 32-day reporting deadline and F4 or F5 has not been completed.

## Funding Statuses
- **Allocated**: Funds have been earmarked for the ERR but not yet committed/transferred.
- **Committed**: MOU signed and funds committed for disbursement.

## Data Sources
- **Portal projects**: ERRs that submitted work plans through this portal (source = mutual_aid_portal).
- **Historical projects**: ERR activities imported from the legacy tracking spreadsheet
  (activities_raw_import table). These predate the portal.

## Key Metrics
- **Plan (USD)**: Total planned expenditure from approved work plans.
- **Actual (USD)**: Total expenditure reported in accepted F4 financial reports.
- **Burn rate**: Actual ÷ Plan — percentage of planned budget spent.
- **Variance**: Plan minus Actual.
- **Individuals reached**: Total from F5 programme reach reports.
- **Families (households) reached**: Total from F5 programme reach reports.

## Overdue Policy
A project is considered overdue if the transfer date is more than 32 days in the past and
both F4 and F5 have not been completed.

## Cycles & Grant Calls
Grant calls are funding rounds issued by donors (e.g. FCDO, USAID). ERRs apply for grants
within a grant call. A grant serial ID tracks the individual grant award.

## States
The portal covers ERRs across multiple Sudanese states including:
Khartoum, Al Jazirah, Sennar, Gadaref, Kassala, White Nile, Blue Nile, River Nile,
Northern State, Red Sea, Al Qadarif, South Kordofan, North Kordofan, West Kordofan,
South Darfur, North Darfur, West Darfur, Central Darfur, East Darfur.

## How to Submit Reports
- Log in at the ERR Portal URL provided by your programme coordinator.
- Navigate to your project under the ERR Portal section.
- Use the F4 tab to upload your financial report (PDF or image).
- Use the F5 tab to fill in programme reach data.
- All uploads are processed automatically using OCR.

## Common Issues
- **"My F4 was uploaded but shows Waiting"**: Processing can take a few minutes. Refresh the page.
  If it still shows Waiting after 10 minutes, contact your programme coordinator.
- **"Exchange rate for SDG"**: The exchange rate is set at the grant level. Contact the finance team
  if you believe the rate applied is incorrect.
- **"I can't see my project"**: Your account may not have access to the correct state or ERR.
  Contact your programme coordinator to check your permissions.
- **"Overdue flag on my project"**: Submit your F4 and F5 as soon as possible. Contact the
  programme team if there are extenuating circumstances.

## Contacts
For technical issues with the portal, contact your programme coordinator or the Mutual Aid Sudan
operations team. For financial queries, contact the finance team directly.
`.trim()
