# PBTRKR Supabase Migration Plan — Review Draft

**Prepared:** 2026-10-13  
**Status:** Local pre-cutover implementation is in progress behind a disabled feature flag. No production SQL, imports, policy changes, or deployment have been executed.

## Scope and authorization

The user's direct request is to migrate the normal tracker application away from its slow Apps Script data path while preserving behavior. The later request authorizes proceeding with implementation while preserving existing data and functionality. Production execution and frontend cutover remain separate from local implementation.

This plan is updated using the seven inventory exports now present in the repository. Code and SQL artifacts are prepared locally, but production database execution, security-policy replacement, Auth role provisioning, imports, and frontend cutover remain gated on source backup reconciliation and external account setup.

## Discrepancies and missing evidence

The seven CSV exports provide columns/defaults, listed constraints/indexes, RLS state/policies, table row counts, and representative stage samples. Staging row counts match the earlier reported counts. The exports do not establish that stage counts match the live Google Sheet export: no backup confirmation or per-sheet live source counts were supplied.

Genuine blockers remain before production cutover:

1. **Missing existing-table columns:** the column export has no column definitions for `rating_history` or `visitors`, although constraints/index/policy/count exports refer to them. Do not target these tables in migrated writes until their columns are supplied; use separate app-owned rating storage meanwhile.
2. **Auth provisioning:** Supabase Auth editor/admin claims are now the chosen write model. A Supabase admin must provision the first `pbtrkr_admin` and approved editor accounts before protected writes can be exercised.
3. **Source fidelity and backup:** no confirmation of a live `.xlsx`/CSV backup or source row-count reconciliation was provided. Sets samples include ambiguous values such as `4-Nov` and `11-Aug`; preserve all 408 staged rows but do not infer canonical scores from these strings.

Telegram activity is not established by the 729 log rows. The Apps Script source contains a token and hard-coded access code; rotate them if active and never move these credentials to browser code.

## Evidence reviewed

- Current repository files: `app.js`, `index.html`, `style.css`, `API`, `share/app.js`, and Clinics SQL/source.
- The Apps Script implementation is present locally as `API`.
- The inventory row-count export confirms: Rankings 26, Sorted Rankings 26, Schedule 189, Sets 408, History 316, SharedResults 74, Telegram_Log 729. These match the earlier reported counts, but are not reconciled to the live sheet export.
- Existing client uses the existing `window.supabaseClient` for `players`, `history`, `device_whitelist`, `rating_history`, `match_rating_logs`, and `visitors`; project URL and the public anon key are initialized in `index.html`.
- `app.js` still calls Apps Script for reads and writes, including sets, schedule, shared results, history, player reads, and `revertDay`. `share/app.js` also has a separate Apps Script endpoint.
- Inventory exports now cover schema, constraints, indexes, RLS policies/states, row counts, and stage samples. They do not report a live workbook/CSV backup or per-sheet live source counts.
- Apps Script source contains a Telegram bot token and a hard-coded access code. They are not repeated in this plan. Treat those credentials as exposed and rotate them if active.

## Table-by-table disposition

| Table/source | Current evidence | Proposed disposition | Gate before mapping |
|---|---|---|---|
| `players` | `id uuid` PK/default `gen_random_uuid()`, `name text NOT NULL`, `DUPR numeric`; 26 rows; public CRUD policies | Preserve all rows. Legacy Rankings cannot map fully here; use a separate tracker profile/stat table or approved additive fields. Do not replay historical sets over the ranking snapshot. | Trusted write authorization and source snapshot reconciliation |
| `history` | `id bigint` PK with no default shown, `Date date NOT NULL`, nullable `Player`, `WinPct text`, `PointsAvg text`, `player_name text`; 4 rows; public CRUD | Preserve existing rows. Legacy History is conceptually similar but requires an additive canonical/archive table or approved extension and explicit ID generation/idempotency. | Confirm ID generation and trusted write authorization |
| `rating_history` | 744 rows; PK `id`, unique `(player_name,event_name)`, FK `event_id` to `events`; columns missing from the schema CSV; public CRUD | Preserve as current rating history; do not import legacy History or recalculate ratings into it. Use new app-owned rating storage until its column definitions are supplied. | Missing column definitions; preserve existing data |
| `match_rating_logs` | 18 columns; 744 rows; public CRUD | Preserve and keep existing rating workflow intact; not the legacy match store. | RPC design must retain current rating behavior |
| `device_whitelist` | `device_id text` PK, `timestamp timestamptz`; 10 rows; public CRUD | Preserve rows and intended lock behavior. Current policies permit anyone to add/update/delete whitelist entries, a real security weakness. | Trusted owner/editor authorization |
| `visitors` | 856 rows; clinic event FK and partial clinic/time index; columns missing from the schema CSV; permissive and restrictive policies coexist | Preserve; do not change visitor behavior or policies. Clinics is out of scope. | Missing column definitions; no visitor changes planned |
| `clinic_events` and Clinics tables | `clinic_events` has 2 rows and admin/public-read policies | Preserve unchanged. | None |
| `events` | `id uuid`, `name text`, `event_date date`, `created_at timestamp`; 0 rows; referenced by rating_history FK | Not a schedule, set, or shared-result table. Do not repurpose. | None |
| `legacy_*_stage` | Exact all-text nullable `c1`... widths shown in inventory; counts match prior report | Preserve exactly; do not recreate, clear, or overwrite. Treat as raw evidence. | Reconcile to live source export |
| `legacy_*_archive` | Not in supplied table list | Add only new archive objects if needed; preserve all raw columns and stage rows. | No stage overwrite; verify before creation |
| New schedule/set/shared-result tables | Not present in production inventory | Create separate purpose-built canonical tables; retain raw source row linkage/payload. Never use `events` by name alone. | Secure trusted write path; resolve source score fidelity |
| Telegram log/config | Stage log has 729 rows; Config not staged | Keep logs restricted; Config secrets stay offline/server-side. Keep active command processing server-side only. | Confirm Telegram remains active; rotate active exposed credentials |

## Proposed implementation architecture (for approval)

1. Preserve the current Supabase client and public anon key. Never place a service-role key, database password, OneSignal REST key, or Telegram token in browser code.
2. Use Supabase Auth magic-link sign-in for edits, with `app_metadata.role` set to `pbtrkr_editor` or `pbtrkr_admin`; require the current device ID to exist in `device_whitelist`. Only admins can manage whitelist entries. Replace the hard-coded access-code and anonymous self-whitelisting paths.
3. Add a focused data-access layer in `app.js` using the existing client, with adapters for the response shapes consumed by UI code.
4. Keep Clinics pages, policies, visitor data, and `clinic_admin` behavior unchanged.
5. Migrate reads first, then ordinary writes, then transactional score saves and day revert. New app-owned RPCs must atomically maintain totals, score/rating logs, history, shared results, and revert state.
6. Use `date` values for calendar days and explicit `America/New_York` handling; preserve source date and score cell strings exactly. Do not parse date-only values through timezone-shifting conversions.
7. Preserve ambiguous scores without recalculation; classify them as unresolved. Initialize player totals from Rankings and import sets for historical display without replaying them.
8. Keep the old Apps Script deployment available for controlled rollback until QA and a stable period are complete. Avoid dual writes.

## Confirmed staging-column correspondence from samples

These are source-column correspondences only. They are not production targets, type conversions, or permission to transform or import data. Keep the original stage tables and raw text intact.

| Staging table | Sample-based source correspondence | Preservation/validation notes |
|---|---|---|
| `legacy_rankings_stage` | `c1` Player, `c2` Rating, `c3` Notes, `c4` Wins, `c5` P.E., `c6` Games, `c7` Win Avg., `c8` Point Avg., `c9` Phone # | Samples show display-case names, blank Notes, percent strings such as `56%`, and phone values represented as text. Preserve exact values and leading zeros if present. |
| `legacy_sorted_rankings_stage` | `c1` Player, `c2` Rating, `c3` Notes, `c4` Wins, `c5` P.E., `c6` Games, `c7` Win Avg., `c8` Point Avg. | This is a second snapshot/view with values and precision that differ from Rankings (e.g. 55.90% vs 56%); archive it separately and do not merge or calculate over Rankings. |
| `legacy_schedule_stage` | `c1` Date, `c2` Day #, `c3`-`c6` Player1-Player4, `c7`-`c11` extras/status candidates | Samples show date-only `M/D/YYYY` strings and lower-case names. Earlier sheet definition says status columns are H-K, which implies blank `c7` and statuses in `c8`-`c11`; samples here show extras null. Confirm live headers/column positions and retain incomplete rows. |
| `legacy_sets_stage` | `c1` Date, `c2` Set #, `c3` Team A, `c4` Team B, `c5`-`c7` Games 1-3, `c8`-`c15` remaining/helper fields as represented | Samples include weekday-formatted date text, slash-separated teams, scores rendered as strings like `4-Nov` / `11-Aug` (likely spreadsheet formatting, not safely inferable as actual scores), helper labels in `c8`, summary values/names in later fields, blanks, and possible timestamp-only rows. Preserve every raw value; obtain raw CSV/XLSX displayed and underlying values before parsing scores. |
| `legacy_history_stage` | `c1` Date, `c2` Player, `c3` WinPct, `c4` PointsAvg | Samples show date-only text, lowercase names, decimal win percentages and point averages. Preserve exact text and verify units against consumer expectations. |
| `legacy_shared_results_stage` | `c1` Timestamp, `c2` resultId, `c3` JSON | Samples show IDs and JSON arrays with `name`, `wins`, `points`, `change`; preserve IDs and exact JSON semantics. Uniqueness and JSON validity must be verified on all 74 reported rows, not inferred from samples. |
| `legacy_telegram_log_stage` | `c1` Timestamp, `c2` User, `c3` Message | Samples include RAW Telegram update payloads, errors, user/chat identifiers, and text. Treat contents as sensitive operational logs; do not expose to browser or copy credentials. |

Important discrepancy: stage samples for Sets render values such as `4-Nov` and `11-Aug`, which are ambiguous and do not match the example score form in the original brief. They may be spreadsheet date/format coercion in the export or actual displayed values. Do not normalize or import these as scores until the original live sheet/XLSX values and raw staging types are checked. The sample also shows c8 labels (`Points Earned`, `Wins`) and c9-c12 summary cells, so the earlier 14-column sample definition does not by itself establish that all source columns/helper data were captured.

## Verified staging schemas and counts

All stage columns are nullable `text`; no defaults, constraints, or stage indexes were returned. The schema widths are: history 4 columns; rankings 9; schedule 11; sets 15; shared results 3; sorted rankings 8; Telegram log 3. Counts from the inventory CSV:

| Stage table | Rows |
|---|---:|
| `legacy_rankings_stage` | 26 |
| `legacy_sorted_rankings_stage` | 26 |
| `legacy_schedule_stage` | 189 |
| `legacy_sets_stage` | 408 |
| `legacy_history_stage` | 316 |
| `legacy_shared_results_stage` | 74 |
| `legacy_telegram_log_stage` | 729 |

The source-field correspondences are recorded above. For Schedule, the source description says status is H-K, which would mean `c8`-`c11`; sample rows do not establish whether these fields are blank or omitted. For Sets, `c8`-`c15` contain helper/summary data and must stay preserved. The sample rows show ambiguous game strings, so use raw stage values until the original source cells are resolved.

## SQL implementation status

The core migration creates additive canonical tables and Auth/device RPCs. It intentionally leaves existing policies and grants on `players`, `history`, `events`, `match_rating_logs`, `rating_history`, and `device_whitelist` unchanged so the current flag-off app's direct legacy rating writes continue to work. A separate manual post-cutover script discovers in-scope policies from `pg_policies` and revokes legacy direct writes only after the new app is live and the change is explicitly approved. Neither script touches Clinics policies.

The local package uses additive `pbtrkr_*` tables for tracker stats/profile fields, schedules, sets, shared results, daily history, and rating events, plus restricted raw Rankings and all-stage-row archives. It leaves Clinics objects and existing data intact. Draft RPCs validate `auth.uid()`, `app_metadata.role` (`pbtrkr_editor` or `pbtrkr_admin`), and a device-to-Auth binding. They use transaction locks, reject negative totals, preserve extra games, and make writes idempotent. New public reads are column-limited for player records (phone is returned only by a device-checked editor RPC), while direct writes to new tables are disabled. The core migration checks required source columns before mutation but does not alter existing-table policies/grants. The separate manual lockdown discovers policy names and must be staged and approved independently. Do not touch the uninspected `rating_history` or `visitors` columns; the app-owned rating event table holds new deltas.

### Policy and Permission Inventory

- Core migration: does not drop or create policies on existing `players`, `history`, `events`, `match_rating_logs`, `rating_history`, or `device_whitelist`; does not revoke their grants. If `device_whitelist.timestamp` is absent, it adds that nullable-data-preserving column with a default. New `pbtrkr_*` tables get public read policies, but direct writes are not granted; `pbtrkr_player_stats` has column-limited reads excluding `phone`. Sensitive raw tables are revoked from anon/authenticated. Tracker RPCs are executable by authenticated users only and enforce Auth role plus device-to-user binding.
- Manual `pbtrkr_lockdown_after_cutover.sql`: after a separate explicit approval, it drops all direct policies on `device_whitelist` and revokes all its direct table privileges from `PUBLIC`, `anon`, and `authenticated`; access remains through security-definer authorization RPCs. On `players`, `history`, `events`, `match_rating_logs`, and `rating_history`, it drops catalog-discovered `ALL`/write policies and revokes `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, and `TRIGGER` from those roles. It leaves existing explicit `SELECT` policies and grants intact and aborts unless RLS and a SELECT policy are present. It never references Clinics tables.
- Compatibility impact: the flag-off legacy score path still directly updates `players`, `rating_history`, and `match_rating_logs`. Running the manual lockdown before the new frontend is live would break that path. Do not combine it with the additive core step or run it before post-cutover QA.

The frontend service is included in `pbtrkr-data.js`, loaded from both `index.html` and `share/index.html`. The feature flag is deliberately `false` in both documents. `app.js` and `share/app.js` dispatch through the new service only when explicitly enabled; the old Apps Script fallback remains for rollback. The editor lock now uses Supabase Auth app metadata plus database whitelist checks, and it no longer allows anonymous device self-whitelisting. Ambiguous score strings render as literal unresolved values and score saves reject attempts to change them. The new notification Edge Function stores OneSignal credentials as server-side environment secrets. No runtime cutover is enabled.

The seven CSVs include table counts and schemas for the listed public tables; no failed query is evident in the exports. Capture a fresh inventory immediately before cutover to detect drift.

## Cutover and rollback outline

1. Confirm and retain a dated live Google Sheets copy (`.xlsx` plus one CSV per non-secret sheet); securely retain Config separately. Record export time and source row counts. Confirmation is currently missing.
2. Use supplied inventory as baseline and capture a fresh inventory immediately before cutover.
3. Reconcile stage counts to the live export, including incomplete schedule rows and timestamp-only sets; preserve every stage row. Current counts match the earlier staging report but are not tied to live-source counts.
4. Resolve source score fidelity for values represented as `4-Nov`, `11-Aug`, etc. Do not infer canonical scores.
5. Establish trusted write authorization, then review additive schema/RPC SQL, grants, totals authority, Telegram disposition, and manual QA checklist.
6. Apply additive core schema/RPC SQL only after isolated staging validation and approval. It leaves existing policy/grant behavior intact while the feature flag is off.
7. After external and staging gates pass and production cutover is explicitly approved, deploy the app with the flag enabled while the old Apps Script deployment remains available. Run page/write QA and compare rankings/totals.
8. Only after the new app is live and its RPC writes are verified, review and explicitly approve the separate manual policy lockdown. It revokes legacy direct writes and direct whitelist access; existing explicit SELECT policies/grants remain and Clinics are untouched.
9. Rollback: restore the prior frontend and, only if required, the reviewed pre-cutover PBTRKR policy/grant snapshot. Export post-cutover Supabase writes before reconciliation; do not import old Sheets over newer data.
10. Retire the old endpoint only after a stable period and explicit verification that no user-facing path depends on it.

## Remaining endpoint/action inventory from local source

`app.js` still contains `API_URL`, `callAPI`, and `fetch(API_URL...)` intentionally for the rollback path while the feature flag is false. With the flag true, `pbtrkr-data.js` maps the live actions: `getTodaySets`, `getUserTrend`, `getHistory`, `getSchedule`, `lastUpdated`, `getPlayers`, `saveSetFull`, `sendSaveNotification`, `updateSchedule`, `addPlayer`, `ensureWeekInitialized`, `getRankings`, `getPreviousHistoryEntry`, `saveSharedResult`, `getSharedResult`, `revertDay`, `getAllSets`, `updateSchedulePartial`, `saveFullScheduleDay`, and `updatePlayerStatus`. `getAllData` is provided as a compatibility composite. `saveHistory` is intentionally a no-op adapter because daily history is written transactionally by `completeDay`. Re-search these after app QA.

`share/app.js` still contains its separate Apps Script URL and fallback `callAPI` path. When enabled it uses the same `pbtrkr-data.js` service for historical sets/trend/share behavior. `index.html` and `share/index.html` load the existing Supabase client and service. `style.css` received only the unresolved legacy score style; no general styling changes were made.

Non-app `fetch` calls found include IP-context lookups in the main app and standalone Clinics pages; these are not Apps Script data paths and should remain unchanged unless separately directed. Telegram Apps Script automation is separate from browser data access and needs a secure server-side plan only if it remains actively used.

### Access and notification findings

The prior app compared a hard-coded access code and anonymously inserted the current device. Local code now requests a Supabase Auth magic link, verifies `app_metadata.role`, then calls a database RPC that also requires a device bound to that Auth user. An admin-only RPC binds devices. Core schema SQL leaves existing policies/grants untouched; the separate gated lockdown file contains the later policy/privilege changes and has not been executed.

The checked-in Apps Script `API` has no Telegram command handler. Telegram log rows exist in staging; the source snippet also included a Telegram credential. Active Telegram workflows are not evidenced by the checked-in `API`; confirm whether the separate script is deployed before disabling it, and rotate the exposed token if active. The local `API` does contain OneSignal functions: `sendSaveNotification` is called after score saves, and `sendTomorrowReminders` exists (whether its scheduled trigger is active is unknown). Keep OneSignal server-side and configure its REST key as a server-side secret if migrating notifications.

## Current Audit and Execution Record (2026-10-13)

This section supersedes earlier draft status notes above. The migration is **not complete** and is not approved for cutover.

### Dependency Checklist

- [x] `app.js` contains the main Apps Script URL and a disabled-flag fallback. When Supabase mode is enabled it now fails closed if the service is missing, surfaces service errors, caches successful reads, and invalidates cached reads after writes.
- [x] `share/app.js` contains a separate Apps Script URL and disabled-flag fallback. Supabase mode now fails closed; share analytics fetches trend and historical sets in parallel.
- [x] `API` is the legacy Apps Script backend. `doGet` and helper functions depend on `SpreadsheetApp`, `ContentService`, `Utilities`, `LockService`, `PropertiesService`, `UrlFetchApp`, and sheets including `Meta`, `Schedule`, `Sets`, `Rankings`, `History`, and `SharedResults`. It remains present for rollback; it is not the intended live Supabase path.
- [x] Legacy `API` contains OneSignal calls and a reminder function whose trigger status is unknown. The Supplied Telegram script is not in this repository; pasted credentials must be rotated if still active and must not be checked into browser code.
- [x] `PBTRKR_USE_SUPABASE_DATA` remains `false` in `index.html` and `share/index.html`; Apps Script is therefore still the current runtime source until gated cutover.
- [x] `GEMINI.md` still describes Google Apps Script/Sheets as the backend. It is historical guidance, not evidence of a second active client path.
- [x] No `.xls`, `.xlsx`, or `.ods` workbook is present in the workspace. The seven `Supabase Snippet ...csv` files are schema/policy/index/count/stage-sample exports, not workbook backups.
- [x] Main-app visitor logging writes directly to the existing Supabase `visitors` table; Clinics and visitor behavior are out of migration scope and were not edited. IP-context fetches are third-party lookups, not Apps Script data dependencies.
- [x] Clinics pages, SQL, visitor rows, and `clinic_admin` behavior were not changed.

### Action and Data Mapping

The Supabase service covers `getAllData`, `getTodaySets`, `getUserTrend`/`getRankings`, `getSchedule`, `lastUpdated`, `getPlayers`, `getAllSets`, `getHistory`, `getPreviousHistoryEntry`, `saveSetFull`, `ensureWeekInitialized`, schedule edits/statuses, `addPlayer`, player phone/order/status edits, shared-result save/read, day completion, revert, and score-save notification. `saveHistory` is intentionally represented by the atomic day-completion RPC. `sendTomorrowReminders` still needs external scheduling/configuration verification. Legacy score strings stay raw and unresolved; clients reject attempts to alter them.

Direct legacy `players`, `history`, `rating_history`, and `match_rating_logs` writes are not part of Supabase-mode score saves; rating changes now go through the app-owned transactional RPC. `visitors` remains unchanged. No Apps Script write fallback is reachable when the flag is true.

### Counts and Reconciliation

The supplied Supabase exports report these staged source counts: Rankings 26; Sorted Rankings 26; Schedule 189; Sets 408; History 316; SharedResults 74; Telegram_Log 729. Total staged rows: **1,768**. Existing exported Supabase counts include `players` 26, `history` 4, `events` 0, `match_rating_logs` 744, `rating_history` 744, `device_whitelist` 10, `visitors` 856, and `clinic_events` 2.

These are verified export counts, **not** live Google Sheets source counts or imported canonical destination counts. The new `pbtrkr_*` objects are absent from the inventory export and no migration/import has run. There is no verified source-to-destination reconciliation. The migration now archives every row from all seven staging tables in `pbtrkr_legacy_source_rows` and aborts unless raw per-table archive counts equal stage counts; typed views may omit unparseable rows, but raw payloads remain preserved. No ambiguous score such as `4-Nov` or `11-Aug` is inferred.

The supplied `rating_history` and `visitors` column inventory remains incomplete; the new migration deliberately does not touch their columns or rows. A fresh full schema/policy/count export is still required before cutover. Exact source `.xlsx`/CSV backup and per-sheet live counts remain missing.

### Local Changes and Verification

- The core SQL draft has table/column preflight checks, Auth-user-bound device authorization, raw stage-row archival, tolerant raw JSON/numeric parsing, source-order-preserving imports, schedule promotion of imported rows, score/rating RPC logic, completion locking, null-payload validation, result-ID payload checks, and reconciliation assertions. It does not change existing-table policies/grants. `supabase/manual/pbtrkr_lockdown_after_cutover.sql` separately removes legacy PBTRKR write policies/privileges and direct whitelist access after cutover; it has guards and never targets Clinics.
- `supabase/tests/pbtrkr_core_staging.sql` adds isolated database checks for Auth/device binding, actual `authenticated` grants, direct-write/phone-read denial, schedule writes, score replacement/clearing/retries, late-failure rollback, rating changes, completion, shared-link persistence/conflicts, and revert. It is Dashboard-SQL-Editor compatible and requires three existing disposable staging Auth users.
- `supabase/tests/pbtrkr_import_reconciliation.sql` provides raw-stage/archive and typed-destination counts plus existing PBTRKR/Clinics baseline row counts. Run it after each migration pass and compare outputs.
- `supabase/tests/pbtrkr_lockdown_staging.sql` checks the separate lockdown's grants/policies and reports Clinics counts/policies; run only in isolated staging after the manual lockdown script.
- Node service tests: **16 passed**. Repository-wide `node --check` passed for every `.js` file; VS Code diagnostics reported no errors in changed JavaScript, test, SQL migration, and SQL staging-test files.
- The SQL integration test was **not run**. This environment has no `psql`, Docker, Supabase CLI/configuration, staging URL, or database connector/session. `npm`/`npx` exist, but a local Supabase stack would still require Docker, and remote tooling would require authenticated access to a separate staging project. Editor diagnostics are not PostgreSQL validation.
- The stage-sample export contains only five sample rows per stage table, not complete data. Counts show all seven tables were populated when the inventory was captured, but the current remote tables have not been queried in this session.
- No browser load benchmark, staging latency measurement, or before/after production measurement is available. The local performance changes are parallel initial reads, parallel share analytics reads, and successful-read caching with mutation invalidation. Feature flag remains disabled, so impact is unmeasured.
- No production SQL, policy changes, data writes/imports, deployment, or Apps Script retirement occurred.

### Remaining Gates and Cutover Steps

1. Obtain a dated Google Sheets `.xlsx` plus CSV exports for every non-secret source sheet; verify all live row counts against the seven staging tables. Keep Config credentials out of the export and repository.
2. Resolve only ambiguous score cells from underlying source evidence; until then keep their raw strings unresolved and do not edit them.
3. Create an isolated Supabase staging project/database with a fresh full inventory. Provision three disposable Auth users for the SQL test, then grant app metadata roles to the intended editor/admin accounts through a trusted admin path. Approve devices through `pbtrkr_authorize_device`.
4. Run the draft migration and staging suite only against that isolated database. Configure OneSignal Edge Function secrets and verify/replace the old reminder trigger. Complete desktop/mobile read/write/share/revert tests and compare all source/destination counts.
5. Before production, capture fresh schemas, policies, grants, counts, and data backups. Review the policy replacement diff. Obtain explicit approval before running production SQL or changing production policies. Deploy the frontend with the flag still off until all external and staging gates pass; then enable it in the reviewed deployment.
6. Keep the old Apps Script deployment and pre-cutover policy/grant export for rollback. On rollback, redeploy the prior frontend and restore only the reviewed pre-cutover PBTRKR policies/grants if required; preserve Supabase writes and export them before reconciliation. Do not reimport old Sheets over newer data.

### Staging Preparation (Not Yet Executed)

Use Supabase Dashboard SQL Editor in a distinct, isolated project/branch; no local package installation is needed for this route. Prefer a branch or restored project that includes the existing schema, Clinics baseline, and complete populated stage data. A branch is not sufficient until its `legacy_*_stage` counts match the inventory and its project reference is demonstrably distinct from production. If no data-preserving branch is available, restore a private database backup into a new staging project; do not seed from the five-row samples or rely on CSV if it would collapse NULL and empty-string distinctions. Confirm the staging project reference in Dashboard before pasting any SQL.

Before running SQL, export a dated source `.xlsx` plus a CSV for each non-secret Google Sheets tab. Record per-sheet source counts and preserve the original workbook privately. Export every staged table from the isolated branch/project in full, not just the sample export. Compare every source row and cell to its matching stage row, including duplicates, blanks, formulas/displayed values, timestamps, and raw JSON. Do not normalize ambiguous values or alter stage rows. Never upload the workbook, visitor/phone data, Config, access tokens, or database credentials to chat.

Create three disposable Auth users in staging only (admin, editor, other editor) and record their UUIDs. Replace the three UUID literals at the top of `supabase/tests/pbtrkr_core_staging.sql` with those staging user UUIDs. The test script simulates app-metadata role claims inside its rollback transaction and checks the authenticated database role. For actual browser QA, provision matching `app_metadata.role` values through the staging Auth admin path and sign in again to refresh JWTs; do not write roles from the anon client. Do not use production users or production device IDs as test fixtures.

The current `index.html` and `share/index.html` Supabase client configuration points at the existing project, and the feature flag remains false. Do not turn it on in those pages for staging QA. If browser QA is later approved, use a separate local-only staging configuration/checkout with that staging project's public URL and anon key; keep the service-role key and database password server-side and out of chat/repository. The SQL staging suite itself needs only the Dashboard SQL Editor and staging Auth UUIDs.

For score notifications in staging, configure `ONESIGNAL_APP_ID` and `ONESIGNAL_REST_API_KEY` under the isolated project's Edge Function secrets only. The existing Edge Function's `tomorrow-reminder` path still requires an authenticated editor user/device and has no verified scheduler-to-function authorization path; do not create a cron job or reuse a production/session/service-role token for it until a dedicated server-to-server authorization design is tested.

In the staging SQL Editor only: capture baseline row counts and policies for `players`, `history`, `events`, `match_rating_logs`, `rating_history`, `device_whitelist`, `visitors`, and Clinics; run the additive core migration twice with `supabase/tests/pbtrkr_import_reconciliation.sql` after each pass and compare outputs; then run `supabase/tests/pbtrkr_core_staging.sql` and confirm all fixture writes roll back. Verify that legacy policies/grants remain unchanged after the core pass. Separately apply `supabase/manual/pbtrkr_lockdown_after_cutover.sql` in staging, run `supabase/tests/pbtrkr_lockdown_staging.sql`, and rerun RPC behavior tests. Recheck baseline rows and Clinics policies/counts. Save the SQL Editor results privately for exact source/stage/destination reconciliation. Do not apply either SQL file to production without separate explicit approval.

The available exports omit the columns of `rating_history` and `visitors`. Core migration code does not alter either table's rows/columns or existing policies/grants; the optional post-cutover lockdown changes `rating_history` write policies/privileges but not its rows/columns. A full staging clone and fresh schema/policy/grant export are required to verify compatibility and Clinics preservation.

Production steps are intentionally gated and **must not be performed** until source backup/count reconciliation, fresh policy review, all staging tests, external Auth/device/notification setup, and explicit approval are complete. No database CLI is required: after approval, open Supabase Dashboard, verify the selected project reference is the intended production project, and run only `supabase/migrations/20261013_pbtrkr_core.sql` in its SQL Editor. That core file leaves existing-table policies/grants intact.

After the approved core migration and import, publish the reviewed frontend with `window.PBTRKR_USE_SUPABASE_DATA = true` in both pages while keeping the prior deployment available. Only after the new path is live and verified should you separately approve and run `supabase/manual/pbtrkr_lockdown_after_cutover.sql` in the production SQL Editor. No production SQL, policy change, or deployment has occurred. Never enable the flag before database/import/authorization staging gates pass, and never run the lockdown before the new app is live and the compatibility window is approved.
