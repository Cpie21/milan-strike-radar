# Shared backend service release

The production backend did not have Ask feedback or the wall API. Claude's preview had instance-local limits, non-idempotent ledger refunds and concurrent wall saves. This change imports only committed backend logic from b398242, keeps the current production UI and makes the invariants transactional in the existing Supabase project.

## Budget and Ask

Each Jev call reserves 2,000 micro-USD against the same atomic monthly ledger as semantic QA. The database cap is 200,000 micro-USD, not an environment override. Settlements remember the original UTC month and run once. Unknown/failed provider usage retains the reservation; a bill above reservation disables further paid calls. No Gemini or paid translation is added. Result.cost sums reported costs and is not the authoritative shared ledger.

Ask uses shared minute limits (8 per IP) and a Rome-day quota (12 answered or held questions). Holds last 90 seconds during processing; clarification continues for 20 minutes with at most three follow-ups. Refine tokens bind IP, original query and city. Failures/refusals release the slot, and duplicate completion cannot release an answered question. Dates outside the daily sync's today..90-day horizon are out_of_scope with a coverage object, not a claim that there are no strikes.

POST body streams are byte-bounded before JSON parsing; arbitrary transport modes, invalid calendar dates and malformed Jev distributions are rejected. Budget/rate infrastructure failure blocks paid calls. Deterministic fallback remains possible on provider failure, backed by retained reservations and the original official data.

## Feedback and wall

Feedback stores bounded replay fields, validates city/reason and returns not_stored on real failures. Its shared limit is 20/minute.

The wall keeps Claude's GET pieces / POST claim/save contract. Server-owned 240x140 v16 geometry permits 5px bleed; a client cannot choose arbitrary panel counts or draw outside its panel. Only existing active strikes can receive writes. Claims are serialized and protected for 10 minutes; completed/expired panels may be recycled while the original person's one-save entitlement remains consumed. Empty saves and concurrent overwrites are rejected. Reads return the latest 60 eligible saved pieces in chronological order, never the first 60 forever.

Saved drawings default approved=false. The owner can see the pending piece; others can see only approved pieces. Trusted administration must review/approve before public sharing, per AI_HANDOFF's existing requirement. There is no public approve endpoint or paid moderation. Anonymous device IDs are a convenience identity, not login/authentication.

## Migration and Claude integration

20261006080621_shared_backend_services replaces Claude's two *unapplied* ask_feedback/lab_graffiti proposals. Do not apply those old migrations after merging this PR. All new tables have RLS and service-only grants; all seven functions revoke PUBLIC/anon/authenticated execute and use SECURITY INVOKER with empty search_path.

Merge aiBudget.ts, Ask route and Ask jev.ts together: Claude's old .018 whole-question reservation is deliberately not supported by the per-call RPC. Its old CAS fallback must be removed. Tokens are issued only for clarification, and frontend cached/local daily counters must follow server outcomes. Wall claims may return wall_busy; saves return approvalPending. Canvas changes require coordinated geometry changes.

No schema of strikes or existing data APIs changes. No affected-user counter, lab UI, generated vehicle assets, cron frequency, hosting plan or paid translation changes. Existing lineImpact and concrete potential routes remain deployed.

## Verification

Local PostgreSQL tests cover duplicate/cross-month settlements, shared cap with semantic QA, budget-unavailable/provider-call blocking, multibyte/chunked body limits, shared quotas, refinement abuse, panel claims/recycling, duplicate saves and private table/function access. Full regressions, type check, lint and production build are required before release. Production receipts record the alias, permission checks, API responses, stored feedback/wall results and actual shared ledger separately.
