# System Architecture

This diagram shows the high-level structure of the Sudan Mutual Aid Portal.

```mermaid
flowchart TB

%% ===== Partner Portal (compact) =====
subgraph Partner_Portal["Partner Portal (/partner-portal)"]
  direction TB
  PP_Grants["partner-portal/grants/page.tsx"]
  PP_Forecast["forecast/page.tsx"]
  PP_ViewAll["forecast/components/ViewForecasts.tsx"]
  PP_ViewOwn["forecast/components/ViewOwnForecasts.tsx"]
  PP_Grants --> PP_Forecast --> PP_ViewAll --> PP_ViewOwn
end

%% ===== ERR Portal (ordered & compact) =====
subgraph ERR_Portal["ERR Portal (/err-portal) — ordered"]
  direction TB
  E1["Grant Management\nerr-portal/grant-management/page.tsx\nAPIs: /api/fsystem/grant-serials, /api/fsystem/state-allocations/committed"]
  E2["F1 Workplan Uploads\nerr-portal/f1-work-plans/page.tsx\nAPI: /api/fsystem/process"]
  E3["F2 Approvals\nerr-portal/f2-approvals/page.tsx\nAPIs: /api/fsystem/workplans/preview, /api/fsystem/workplans/commit"]
  E4["F3 (TBD)"]
  E5["F4 (TBD)"]
  E6["F5 (TBD)"]
  E7["Project Management\nerr-portal/project-management/page.tsx"]
  E8["Dashboards\nerr-portal/dashboard/page.tsx\ni18n: i18n/locales/en/dashboard.json, i18n/locales/ar/dashboard.json"]
  E9["Room Management\nerr-portal/room-management/page.tsx\nAPI: /api/rooms/active, /api/rooms/pending"]
  E10["User Management\nerr-portal/user-management/page.tsx\nAPI: /api/users"]
  E1 --> E2 --> E3 --> E4 --> E5 --> E6 --> E7 --> E8 --> E9 --> E10
end

%% ===== Core Infrastructure (compact) =====
subgraph Core["Core Infrastructure"]
  direction TB
  C1["Auth & Middleware:\nlib/auth.ts, middleware.ts, login.tsx,\nchange-password.tsx, /api/auth/callback/route.ts"]
  C2["DB Client & Types:\nlib/supabaseClient.ts, lib/database.types.ts"]
  C3["i18n setup:\ni18n/, locales en, ar"]
  C4["UI Foundation:\ncomponents/ui, components/layout, components/providers"]
  C1 --> C2 --> C3 --> C4
end

%% ===== External Services =====
subgraph Services["External Services"]
  direction TB
  SB[(Supabase / DB · Auth · Storage)]
  GV[Google Vision OCR]
  OA[OpenAI Extraction]
end

%% ===== Flows =====
Partner_Portal --> Core
ERR_Portal --> Core
Core --> SB
E2 --> GV --> OA --> E2

