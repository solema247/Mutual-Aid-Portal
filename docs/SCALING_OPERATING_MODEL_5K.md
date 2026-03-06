# Scaling the Mutual Aid Portal: Operating Model for 5K+ Users

**Context.** The portal was piloted with a ~$130K grant for approximately 30 users. It has since advanced in design, usability, integration with external donor forecasts, and security. This one-pager defines what is required—technologically and operationally—to **host and manage** the portal at 5K+ users as an **ongoing operating model**, not a milestone-based delivery plan.

---

## 1. Technology Requirements

**Infrastructure & reliability**  
- **Supabase:** Production tier (Pro or above) for 5K+ auth MAU, higher DB connections, and storage. Use connection pooling (Supabase Pooler) so serverless API routes do not exhaust connections.  
- **Vercel:** Plan (Pro/Enterprise as needed) for stable serverless execution, longer function timeouts for heavy jobs (e.g. F4/F5 parse, fsystem process, sync), and reliable cron execution (Sheets/Airtable sync).  
- **Monitoring & alerts:** Uptime, error rates, and latency for the app and critical APIs; alerts on auth failures, sync failures, DB connection/slow-query issues, and third-party quota errors.

**Auth & API**  
- **Auth:** Retain cookie-gated session checks in middleware to avoid Supabase auth rate limits. Monitor auth MAU and rate limits; plan for SSO/SAML only if required by large donor or partner orgs.  
- **API:** Apply rate limiting on login and on high-cost routes (e.g. document parse, sync endpoints) to protect Supabase, Google Vision, and OpenAI. Cache read-heavy, non-personalized endpoints (e.g. states, options) where appropriate.

**Data, storage & integrations**  
- **Database:** Index and tune RLS and list queries (users, cycles, allocations); monitor slow queries and connection usage. Backups and point-in-time recovery aligned with data governance.  
- **Storage:** Supabase Storage for F1–F5 and MOU uploads—define quotas, retention, and abuse controls (size, type, rate).  
- **Sync & crons:** Sheets and Airtable sync (e.g. every 5 min)—define scope and failure handling at scale; use existing sync logging for ops. Enforce quotas and cost controls on Google Vision and OpenAI.

---

## 2. Process & Operating Model

**User lifecycle**  
- **Onboarding:** Clear process for inviting and approving 5K+ users (bulk invite, self-serve vs admin approval) using existing roles (superadmin, admin, state_err, base_err, partner) and user-management flows.  
- **Access & offboarding:** Documented steps for role changes, state visibility, and suspension/revocation so access remains correct and auditable.

**Support & operations**  
- **Support tiers:** L1 (how-to, access requests) and L2 (incidents, bugs, integrations). Defined channel (e.g. ticketing or designated inbox) and target response times.  
- **Runbooks:** Use existing scripts (sync status, Supabase config checks) and document when to escalate. On-call or designated owner for production incidents.

**Governance & compliance**  
- **Secrets & env:** All production config in Vercel/Supabase; no credentials in repo.  
- **Availability:** Target (e.g. 99.5%+) and planned maintenance windows communicated to members.

---

## 3. Cost Budget (Annual)

| Category | Description | Annual cost (USD) |
|----------|-------------|-------------------|
| **Personnel** | | |
| Developers | 2 × full-time (portal development, integrations, security) | *[Insert total; e.g. 2 × salary]* |
| Technical support | 3 × full-time (L1/L2 support, onboarding, runbooks) | *[Insert total; e.g. 3 × salary]* |
| **Software & services** | | |
| Supabase | Pro (or higher) for DB, auth, storage | *[Insert; e.g. ~$25–100/mo]* |
| Vercel | Pro/Team for app hosting and crons | *[Insert; e.g. ~$20–100/mo]* |
| Google Cloud | Vision API, Sheets API, minimal compute | *[Insert; e.g. ~$50–200/mo]* |
| OpenAI | Extraction and support use | *[Insert; e.g. ~$50–150/mo]* |
| Monitoring / tooling | Uptime, errors, optional APM | *[Insert; e.g. ~$0–50/mo]* |
| **Subtotal software** | | *[Insert annual software total]* |
| **Total (personnel + software)** | | *[Insert grand total]* |

*Replace placeholders with your actual salary bands and vendor quotes. Salaries will dominate; software costs are typically a small fraction of personnel at this scale.*

---

## 4. Summary

To host and manage the portal for 5K+ users in a sustainable way: (1) move Supabase and Vercel to production tiers and add pooling, monitoring, and rate limiting; (2) run support and access lifecycle as a defined operating model with clear roles and runbooks; (3) fund 2 developers and 3 technical support staff plus production software costs. This one-pager should sit alongside your original pilot grant documentation in the docs section for funders and operators.
