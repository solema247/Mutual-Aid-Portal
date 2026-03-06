# FCDO Evaluation Indicators – Status and ETA

This document tracks the Evaluation Indicator Plan from the **FCDO Sudan Digital Systems – Milestone 1 & 2 Progress Report**. It is updated to support completion of pending items and February/March deliverables.

---

## Indicator summary

| # | Target outcome | Type | Measurement / target | Baseline | Current status | Owner / ETA |
|---|----------------|------|----------------------|----------|----------------|-------------|
| 1 | Efficient Localization Hub internal systems for grant management, HR, finance, and communications | Yes/No | Selection and onboarding to an internal Lohub financial system | No | Paused – additional scoping and needs assessment | TBC |
| 2 | More time for the Localization Hub to spend on analysis and storytelling, instead of organizing files and data | % + User feedback | % of F1s uploaded in MAP vs. Google Drive: 90%; Survey 4/5 | 0% | 100% since WK4 19/01; **Survey to be distributed Feb ETA 27/02** (Google Forms) | Survey: Feb 27/02 |
| 3 | Clear, easy-to-understand data and tools supporting local planning and resource allocation | Yes/No + User feedback | Dashboards and project management tools integrated into Lohub planning; Survey 4/5 | No | Yes; **Survey to be distributed Feb ETA 27/02** (Google Forms) | Survey: Feb 27/02 |
| 4 | Improved user experience for frontline volunteers submitting work plans and reporting | User feedback | Survey question for ERR volunteers before and after: 4/5 | TBC | **Survey to be distributed Feb ETA 27/02** (Google Forms) | Survey: Feb 27/02 |
| 5 | Stronger communications and visibility for frontline volunteers participating in F-System | Yes/No + User feedback | Dashboard and project management tools visible for frontline volunteers; Survey 4/5 | No | Yes; **Survey to be distributed Feb ETA 27/02** (Google Forms) | Survey: Feb 27/02 |
| 6 | Enhanced tracking of grants, funding flows, priorities, and needs across ERRs | Yes/No + % | Connected MAP, App, Database, P2H tools; % F1s in MAP vs. Drive: 90% | Partial / 0% | Yes / 100% since WK4 19/01; **F1-by-state metrics** in MAP dashboard | Metrics: Done in MAP |
| 7 | Reduced disbursement/transfer lag time between LoHub and Base ERR | Time | Time between disbursement between Lohub and Base ERR | TBC | TBC | TBC |
| 8 | Improved local development capability to enhance and maintain the system | Time | Sessions spent with Lohub tech team: 20+ hours | 20 hours | 20 hours | Complete |
| 9 | Improved coordination with international and national NGOs and agencies through connected systems | Yes/No | Integration of MAP with external systems (live integration or information sharing) | Partial | Partial; **ETA March** | March 2026 |
| 10 | Mapping of needs, resources, and support to ERRs | Yes/No | Views on needs, resources visible on MAP | No | **No** – confirm scope with P2H for Milestone 3 | Scope with P2H |
| 11 | Increased digital literacy and system ownership among ERR and LoHub teams through ongoing onboarding and training | User feedback | Survey question for Lohub before and after: 4/5 | TBC | **Survey to be distributed Feb ETA 27/02** (Google Forms) | Survey: Feb 27/02 |

---

## Pending actions

- **Indicators #2, #3, #4, #5, #6, #11 – Surveys:** Use Google Forms; distribute by Feb 27/02 (or as agreed). Links are listed in [SURVEYS.md](SURVEYS.md) and in the portal Surveys section.
- **Indicator #6 – F1 metrics:** F1 uploads by state and OCR acceptance % are available in the MAP dashboard (F1 uploads by state widget + OCR acceptance card).
- **Indicator #9:** Track integration deliverables for March; no change to this status doc unless a dedicated integration checklist is added.
- **Indicator #10:** Confirm with P2H which “needs/resources” views are in scope for Milestone 3; implement or document in MAP once scope is agreed.

---

## Technical notes

- **F1 OCR accuracy:** The dashboard card and API use `err_projects.ocr_edited_fields_count`. Run the migration [sql/add_ocr_edited_fields_count.sql](../sql/add_ocr_edited_fields_count.sql) in Supabase if the column is not yet present. To backfill work plan **date** for previously uploaded F1s, run [sql/backfill_f1_date_from_created_at.sql](../sql/backfill_f1_date_from_created_at.sql) once. To include legacy portal F1s in the OCR % (treat as accepted with no edits), run [sql/backfill_ocr_edited_fields_count_for_legacy.sql](../sql/backfill_ocr_edited_fields_count_for_legacy.sql) once.

---

## References

- **FCDO Sudan Digital Systems – Milestone 1 & 2 Progress Report** (docs folder)
- **11Nov25 Gisa Group (FCDO Sudan Digital Systems)** – Annex 1 Scope of Work, Feb/March deliverables
