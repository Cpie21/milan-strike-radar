# AI handoff

Shared state between Claude and Codex. Keep it short: decisions, contracts and open cross-module issues. History belongs in commits, PRs and `docs/archive/`.

## Working model

- Each agent works in its own git worktree, never in the other's folder. A branch alone does not isolate uncommitted files.
  - Codex: `codex/<task>` · Claude: `claude/<task>`
- Integration target: `main`, currently behind the production backend. `codex/strike-evidence-handoff` holds the committed backend release plus audit proofs and collaboration docs. Check open PRs and merge bases before starting; do not assume the shared `codex/英语功能测试` checkout contains only one agent's work.
- Commit only files you changed (no `git add -A` in a shared folder). Never commit or overwrite the other agent's unmerged work.
- Hand off through PRs: UX goal, chosen approach, key files, API/schema impact, unfinished parts, what to review.
- Deploy only committed code. Preview deployments are free to use; production (`theitalystrike.com`) needs the user's approval.
- Database migrations ship in the PR that needs them. Before applying one to the shared Supabase project, note it below under "Schema changes" — both agents read the same production data.

## Architecture (stable decisions)

- Data flow: MIT official list + status search → `lib/strikeSync.ts` → `strikes` table → `lib/strikeQuery.ts` (`readCityStrikes`, refuses to serve when the last sync is unhealthy) → `components/utils.ts` `aggregateStrikes` (one card per city/date/mode; aviation and railway also separate scope and affected airline, raw announcements kept in `strike_events`) → pages, `/api/strikes` (widget), `/api/calendar` (ICS).
- Identity: a strike row is keyed by `source_key` (hash of the MIT announcement, timing excluded) + date + region + category. Revisions overwrite; rows not seen any more become `STALE`.
- Timing evidence: `timing_evidence` holds windows with symbolic endpoints (`end_of_service`), sources and confidence. Never invent a full day or midnight; unknown stays unknown.
- Cities: `lib/cities.ts` is the only registry (20 cities); routes are `/[region]`, Milan is `/`.
- Time: strike dates and clock times are Rome local. Claude's Ask branch adds `lib/romeDate.ts`; preserve those helpers when integrating its client changes.
- Sync health: `strike_sync_runs`; `/api/sync-status` is the monitoring endpoint.

## Frontend / API evidence contract (Codex)

- Source facts persist in existing `strikes.timing_evidence.fields`: `location`, `scopeType`, `affectedLines`, `affectedAirports`, `affectedOperators`, `timing`, `exclusions`, `guaranteedServiceWindow`. Facts have `value`, `confidence`, `source`, optional `url`/`excerpt`. Unknown and conflicting facts must remain distinguishable.
- Aggregated `/api/strikes` and `aggregateStrikes` retain `strike_events`, source evidence and symbolic windows, and expose `scopeType`, `guaranteeSource`, `guaranteedServiceWindow`, `lineScope`, `field_evidence`. Keep these when changing cards or `/api/ask`; do not assume `AIRPORT` means whole-airport disruption.
- Aviation scopes: `AIRPORT`, `AIRLINE`, `AIRLINE_CREW`, `GROUND_HANDLING`, `MIXED_AIRPORT_SERVICES`, `CARGO`, `NATIONAL_AVIATION`, `UNKNOWN`. Cargo stays in source history but is excluded from passenger city cards.
- Never widen unknown geography, airports, operators or lines. `UNKNOWN` lines must not render as all lines. A national airline strike does not imply every airport is disrupted. Explicit airport geography overrides coarse MIT national tags.
- Guarantees distinguish `OFFICIAL_STRIKE_NOTICE`, `STANDARD_RULE`, `OPERATOR_RULE`, `UNKNOWN`. No city-based default or inferred complement guarantees. Protected flights / minimum service do not mean every departure runs normally.
- Keep source links and timing differences in the existing bottom source area; retain the timeline and semantic service-start/service-end endpoints. Do not change the affected-user counter.
- Concrete operator notice detail can supersede coarse MIT timing, while preserving both sources and differences. Reported detail remains labelled as reported; blocked or unmatched sites are not official verification.
- Production runtime commit: `b52dcee`, deployment `dpl_CyDwKWhRmP6KkMeta5f1o8gDLMr5`; operator-notice and evidence-card audit in `docs/archive/2026-10-v1.9-operator-notice-coverage.md` (PR #5). Prior operator/transit audit is v1.8 (PR #4). Earlier geography/review audit is v1.7 (PR #3), semantic QA v1.6 (PR #2). Scope/method/passenger-impact/geography facts use the existing JSON column; the v1.6 budget/cache migration is described below.

## Natural-language query (Claude, branch `claude/ai-ask`)

- `POST /api/ask` streams NDJSON stage events, then `{type:"final", result}`. Types live in `lib/ask/pipeline.ts`.
- Rules (`lib/ask/parseQuery.ts`) own dates, times, cities, line codes. Jev (`typesafe/jev-1.13` via OpenRouter, `lib/ask/jev.ts`) owns intent, semantic modes and per-strike relevance. Code owns overlap and impact. Jev failure degrades to rules and says so.
- Reads strikes only through `readCityStrikes` + `aggregateStrikes`; changes to `strike_events` or `timing_evidence` shape affect it.
- Env: `OPENROUTER_API_KEY` (Vercel: Preview only so far). Rate limit is in-memory per instance — needs a shared store before production.

## Semantic QA integration (Codex, `codex/strike-semantic-qa`)

- Additive migration `20261004215721_strike_semantic_review_budget`: service-only hash cache and atomic USD 0.20 monthly reservation ledger. Each request reserves before calling; unknown billing retains the reservation. No public roles can read or call budget functions. Applied after PostgreSQL regression tests on 2026-10-05.
- Jev reviews compact official fields vs parser output, not dates/time arithmetic or user prose. Corrections require independently supported official candidates; high-confidence unsupported mismatches stay flagged; low-confidence disagreements remain INCONCLUSIVE and never replace official data. Same unchanged input uses a 24-hour cache; at most 30 paid calls per sync with a 55-second QA deadline; no retry storms.
- Current production cron remains daily; no paid plan upgrade or hourly Jev loop. This ceiling covers semantic QA only; Claude must route future public Ask calls through the shared budget before claiming a site-wide AI cap. Existing Ask client is not deployed by this branch. Current semantic-v5 production QA retains 11 AGREES/15 INCONCLUSIVE across 26 announcements; do not advertise these as all AI-validated facts. The v1.9 sync reviewed four changed inputs and reused 22 cache entries. The persisted queue is empty. October ledger is USD 0.006420 as of the v1.9 production audit; this release increment was USD 0.000298, unchanged rereads add no cost.
- Railway scope subtypes and MIXED_AIRPORT_SERVICES are additive API values. Frontend/Ask must not treat security/infrastructure hours as confirmed train cancellations.

## Geography and review follow-up (Codex)

- `RAIL_GENERAL` uses the same explicit FERROVIARIO section as time parsing; separate APPALTI FERROVIARI / freight clauses remain in `fields.railSections` and cannot downgrade that event to support-only.
- `fields.officialGeography` preserves MIT raw region/province/relevance; `supportedCityProjection` is a subset for this site's 20-city routes, not an exclusivity claim. `locationStatus` distinguishes unsupported official cities from unknown locations. These are additive existing-JSON/API fields; no schema migration.
- `/api/ask` integration must carry officialGeography/projection through responses and may not say only Bologna from a supported-city projection. Foggia/Udine remain outside the UI registry; declared province remains known. Claude's `2bfb955` now carries scopeType, passengerImpact and geography into Ask candidates; that work remains on Claude's branch and is not part of this production backend.
- Semantic review >=0.80 concerns enter NEEDS_REVIEW (or FLAGGED for high-confidence conflicts), independently of low subtype confidence. >=0.97 corrections still require explicit official evidence; model uncertainty alone cannot alter facts. `npm run review:queue` reads the service-only persisted queue without paid calls, uses the latest result per source and current review version.

## Operator rules / line scope / live advisories (Codex)

- Pipeline adds transit enrichment after matched official timing, before Jev. No schema migration: all facts remain in timing_evidence.fields. No additional paid AI pipeline or cron frequency increase.
- Six independently sourced profiles: ATM Milano, daytime ATAC, GTT urban/suburban, explicitly regional Trenitalia, named Bergamo Trasporti consortia for Arriva, AIR Campania bus services. Event-specific guarantees win; unknown operators, conflicts and rail security/infrastructure/support do not acquire defaults. Validity dates are our REVIEW_WINDOW, not invented legal effective dates. Reverify documents weekly; unavailable profiles fall back only until their recorded review expiry.
- New fields: guaranteePolicy (operator/mode/service/source/validFrom/validTo/checkedAt/qualification), guaranteeEvidenceWindows (symbolic service start), guaranteedTrains (currently UNKNOWN unless an actual dated list is verified). Existing numeric guarantee_windows cannot represent service start; consumers must use symbolic evidence for the full bands and retain the rule qualifier.
- lineScope: ALL_OPERATOR_LINES / SPECIFIC_LINES / ALL_EXCEPT / UNKNOWN. lineScopeEvidence contains operatorIds, networkNames, affectedLineNames, excludedLineNames, affectedRouteIds, excludedRouteIds, gtfsFeedId, routeValidation. legacyLineScope retains the previous summary. Event facts/provenance remain in strike_events/field_evidence. Claude must extend the old ALL_LINES enum and show named operator scope, not all city transport. IDs are namespaced by feedId.
- GTFS validates identities only: agency, mode, validity and exact matching; no promised operation from schedules. Milan metro uses matching M1..M5 IDs plus numeric short names and metro mode. Parsed catalog cache is 24 hours; only fetch for named lines/exceptions. Range fetch selects small CSV members; non-Range publishers use one bounded archive.
- GET /api/service-alerts?region=ROMA is a separate live official advisories endpoint, cached 60 seconds; no minute-by-minute background job. Keep timestamps, causes, active periods and stop/trip/route/agency selectors. Only fresh active STRIKE-caused disruption confirms strike impact. Missing/old feeds return 503; no alert never means normal operation. It does not rewrite planned strikes.
- Frontend redesign remains Claude's responsibility. The old production card now uses the shared evidence helper for line scope and symbolic guarantees (v1.9); /lab/Ask must integrate the same interpretation. Keep source links in the existing source area; counter unchanged. Regional rail guarantee bands mean minimum service, not every train; no fabricated train-number list.
- Production v1.8 sync `cee25515-3d3e-4754-9d9e-47414f206cec` succeeded: 76 fetched / 57 upserted, five OPERATOR_RULE rows (four ATM announcements and one Arriva Bergamo) also have explicit ALL_OPERATOR_LINES scopes. Nine indirect railway rows retain UNKNOWN guarantees. Live Rome advisories work; Rome static GTFS still timed out and is not claimed verified. No named-line catalogue was needed by current production notices. Audit found and fixed the GTT charter clock separator format; final source refresh has no GTT verification warning.

## Schema changes

- 2026-10-04 (Codex): `20261004134223_sync_reconciliation_and_feedback`, `20261004142222_external_strike_timing` — applied to production.

## Current ownership

- Codex: sync, enrichment, timing evidence, data APIs; worktree `/Users/tristan/.codex/worktrees/strike-card-coverage/milan-strike-radar`, branch `codex/claude-contract-review`.
- Claude: frontend redesign (exploration under `/lab`, then the city page), natural-language query UI.
- Shared hot file: `components/StrikeDashboard.tsx` — the redesign will replace most of it. Codex, prefer data-layer changes over edits there until the redesign lands.

## Open cross-module issues

- `main` is behind the committed production backend; review `codex/strike-evidence-handoff` before integrating it. PR body is prepared in `docs/archive/2026-10-backend-handoff-pr.md`; Git HTTPS authentication is now available; the backend base branch has been pushed for PR review.
- Latest backend production build is committed (`b52dcee`), excluding Claude's Ask feature. Claude's worktree was checked at `claude/redesign-lab` / `7ceb87c`; it merged the prior geography backend (`836c4d0`) and integrated its evidence into Ask (`2bfb955`). Preserve its Rome-date, Ask and dashboard changes during integration; the transit contract is integrated into the old production card by v1.9, but still needs /lab/Ask consumption. Collaboration docs originated in Claude's `361f3ed` and were cherry-picked, then updated here. User explicitly assigned frontend redesign to Claude; Codex should focus on backend logic/data accuracy and pass new evidence fields through this contract.
- Evidence coverage remains incomplete: 7 future active supported-city records have operator official matches, 3 have reported supplements, 27 are MIT-only (37 supported-city source records including cargo, not cards). Firenze/Pisa 14 October TPL still has unknown clock times; some official sites block fetches. Never describe these as all officially verified.
- `/api/ask` rate limiting and Jev calibration on real questions are unverified.

## Claude → Codex requests (lab v5, `claude/redesign-lab`)

### Graffiti drawing upload
The lab now lets affected users draw on the vehicle after "我受影响了". The frontend is done; persistence is stubbed to localStorage in `components/lab/graffitiStore.ts` (`uploadDrawing`).

Proposed contract (Codex to confirm or adjust):
- `POST /api/doodles/drawing`
  - Body: `{ key, region, date, category, deviceId, strokes: [{ c: '#RRGGBB', w: 4|8|14, p: number[] }] }`. `key` is the same as the existing doodle key; `p` holds flat x,y pairs in stage units, 360×150, rounded to 0.5.
  - Server validates the colour against the palette, `w` against the allowed sizes, at most 80 strokes and at most 4000 points, and one drawing per `deviceId` per key, upserted.
  - Rate-limited.
- `GET /api/doodles/drawing?key=…`
  - Returns that device's own drawing.
  - Returns up to N **approved** drawings by others.

Free drawings must not be shown to other users without moderation: a review queue, or an approval flag that defaults to false. Until then the UI only shows the user's own drawing plus the generated tags.

### Aggregate timing confidence
- `aggregateStrikes` sets `timing_evidence.confidence = 'reported'` whenever *any* source is reported, even when an operator-official source with the same hours exists (example: Milano 2026-10-09, ATM official plus Virgilio).
- The lab works around this by letting an official quote outrank it.
- Consider "official if any official source agrees". Report `reported` only when no official source exists.

### Evidence read in the lab
- `/lab` reads `strikes.raw_payload` by event id, for the card-specific MIT register entry: unions, provider, rilevanza, modalita and proclamationDate.
- If `readCityStrikes` or `strike_events` carried a trimmed `official_record` instead, the lab could drop its second query.

### Lab v6 additions (Claude)
**Translations**
- `/lab` translates Italian source text, and backend labels stored in Chinese (provider, scope), using `google/gemini-3.5-flash-lite` via OpenRouter.
- Each batch is cached for 7 days with `unstable_cache`. Code: `lib/lab/translate.ts`.
- Preferred long-term: the sync pipeline stores `zh`/`en` beside each excerpt or label once, under the shared AI budget, and the page stops calling the model.

**Ask limits**
- `/api/ask` now has a per-IP daily cap of 12 new questions; refinements are sent with the header `x-ask-refine: 1` and don't count.
- The UI allows 5 a day per device.
- Both counters are per instance or per device. A hard limit needs a shared store; route this through the shared AI budget.

**OpenRouter balance**
- On 2026-10-05 the key could afford only about 15k tokens per request (402 error on max_tokens 65536).
- Ask, translation and semantic QA will all start failing when the balance runs out. The owner has been told.

### Lab v8 (Claude)
- `three` was added for a 3D wall and removed again in v10. `package.json` and `package-lock.json` are back to the v7 dependency set.

### Lab v10 requests (Claude)
**1. `ask_feedback` table.**
`app/api/ask/feedback/route.ts` inserts good/bad ratings for Ask answers into this table, to build an evaluation set. Until the table exists, rows are only logged. Proposed migration (service-role writes only; no public read):
```sql
create table public.ask_feedback (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  rating text not null check (rating in ('good','bad')),
  reason text check (reason in ('misread','wrong','missing','irrelevant','other')),
  query text not null,
  city text,
  answer jsonb,   -- route currently sends a JSON string; switch to jsonb insert when the table lands
  trace jsonb,
  client text
);
alter table public.ask_feedback enable row level security;
```

**2. Graffiti colours by IP.**
Each sprayer should get one palette colour, chosen server-side by an HMAC of the IP. The palette is in `components/lab/graffitiStore.ts` (`PALETTE`). The lab currently derives the colour from the device. The drawing-upload contract above still applies; strokes are now in 240×140 wall pixels.

**3. End-of-service clock times.**
`lib/lab/serviceHours.ts` maps (city, mode) to a sourced last-service time. Only Milan metro has one so far: about 00:30, from ATM's M4 page. If the sync can capture operator end-of-service times with sources, the card will show them.

**4. Ask understanding fix (in `lib/ask/pipeline.ts`, Claude's file).**
A named mode or line now blocks model-added modes. Results are filtered to the named modes with relevance ≥ 0.5, and identical union notices are deduplicated. Deduplicating before Jev judging would also save calls.

## Operator notice coverage follow-up (Codex)

- EAV's verified DTF (railway) / DTA (bus) meanings take precedence over coarse TPL→BUS classification. Only an EAV-bound department match applies. DTF travelling staff is RAIL_CREW/DIRECT_SERVICE; exact lines and guarantees remain UNKNOWN until a dated notice confirms them. serviceClassification stores the operator definition source, separately from this strike's MIT facts. Category corrections soft-retire the old projection through the existing complete-snapshot reconciliation.
- GEST discovery starts at its news index. Divi article content, visible Italian publication dates and guarantee-bearing headings are parsed; union/date scope is retained. Grievance/historic line examples after MOTIVAZIONI do not become affected routes. T1/T2 names are preserved in lineScope and legacy affected_lines; no GTFS IDs are invented.
- AIR_CAMPANIA is a sixth sourced bus guarantee profile. Complete rules: 06–08, 13–15, 17–19; funicular/indirect support excluded. fields.guaranteeDuringStrike stores the independently computed intersection with known strike windows, or UNKNOWN when timing is missing. The complete policy is retained. Rules are OPERATOR_RULE, not same-day notice confirmation.
- Production StrikeCard consumes lineScopeEvidence and guaranteeEvidenceWindows with a shared lib/strikeCardEvidence helper. Symbolic protected edges use a green striped continuation and service-start/end labels, never fabricated midnight. Qualified rule source links stay in the existing bottom source area. This is a narrow compatibility fix, not Claude's redesign; counter unchanged.
- Claude's /lab branch advanced from c82d0fd to 7ceb87c during this work; those committed LabStrikeCard/3D changes and the untracked .vercelignore remain untouched. Integrate the helper and new evidence contract there; its prior ALL_LINES/legacy guarantee consumer needs updating. No schema migration, added AI role or cron frequency change.

- v1.9 production sync `ebc41bfe-9651-4ebc-b14f-3db9db18297c`: 76 fetched / 58 upserted / 1 retired, 6 profile rows. EAV old BUS is STALE; GEST official T1/T2 and two guarantees are stored; AIR strike intersection is 13–15. 166 regressions plus live 20-city / 20-case audit pass. Runtime b52dcee; proof in docs/verification/2026-10-v1.9-*. No migration or added AI role.

## Claude contract review / backend follow-up

- Review: `docs/archive/2026-10-claude-backend-contract-review.md`. Claude advanced from 7ceb87c plus ongoing uncommitted files to committed v10 88be100; v10 handoff/changes were rechecked; do not overwrite those files. Its handoff's older production/ledger values are stale. This follow-up backend PR is not deployed; live runtime remains b52dcee.
- Aggregate timing confidence now uses each event's adopted timing evidence, not presence of a media link. Only identical adopted hours get shared official support; distinct reported hours, unknown timing and conflicts retain their status. Remove the /lab `quotes.some(official)` workaround: an official geography/guarantee quote does not authenticate timing.
- Additive read-only API: each `strike_events[i].official_record` contains MIT unions/workforce/sector/relevance/region/province/area/mode/proclaimed/url/windows or null. readCityStrikes trims raw_payload server-side in its existing query; raw_payload is never returned. Replace /lab's second per-ID registry query. Original record.windows uses only original MIT parsed clocks, never operator-enriched e.windows; symbolic/unknown text stays in mode. Preserve Tutte; invalid proclamation dates are null. No schema migration or new paid calls.
- Before publishing /lab/Ask: use structured line scope, symbolic guarantee evidence and actual guarantee source/type; Ask currently labels every nonempty guarantee OFFICIAL_STRIKE_NOTICE. Plans must say possible impact, not confirmed stoppage/restart. Protected hours must affect status copy, not only the chart. A M4 approximate timetable cannot replace the all-network service-end endpoint.
- All OpenRouter callers, including Ask and translation, must reserve/settle against the shared budget before claiming a site-wide cap. Current wrappers bypass it; client refinement headers and instance Maps are not hard limits. Keep rule/original-text fallback. Do not solve this by adding unbudgeted sync translations.
- Ask must expose truncated/unreviewed candidates and unsupported named cities instead of answering clear for them. New ask_feedback route needs its migration/shared limit and truthful storage failures; current production Data API has no ask_feedback table (PGRST205). Graffiti upload remains a separate moderated API/schema task; localStorage is not server persistence. Counter remains unchanged.

- Claude v10 (88be100) supplies proposed ask_feedback SQL but no migration yet, changes graffiti stage to 240×140, and requests IP-based colours. Keep IP hashing separate from device/strike identity and do not assume one IP is one traveller; review shared-network and roaming behaviour before implementation. three was removed in v10; preserve its current package set.

## Scheduled service endpoint contract (Codex, service-end-evidence)

- Additive `timing_evidence.fields.serviceSchedule` and aggregate `serviceSchedule`, no SQL migration. This is a **scheduled passenger reference**, not the strike's numeric official end or actual operation. Fields include date/operator/category/source/hash/checkedAt, per-route clocks and distinct `lastDeparture`/`lastArrival`; clocks retain next-day `dayOffset`.
- Existing cron applies the optional projection **after** semantic reconciliation, with bounded streaming and a daily parsed cache. No new job or AI spend. Failed/expired/partial scope never supplies a whole-card endpoint; all 20 cities × four modes have explicit coverage state. Seven official GTFS sources configured; 13 cities still lack a verified timetable adapter. Airport, unverified rail/office/support and named subnetworks cannot borrow a city default.
- Claude v10 `88be100` M4 approximately 00:30 fallback is not proof of every Milan metro line's end. Replace `lib/lab/serviceHours.ts` with the new evidence/helper when integrating. `scheduledEndpoint` checks date/mode/completeness/48h freshness; `cardTimingLabels` preserves fixed official clocks and labels substituted symbolic endpoints **scheduled reference**. Put source links in the existing bottom source area. Do not use these times for guaranteed running, actual resumption, Ask certainty or calendar end.
- Milan Oct 9 official timetable: latest departure next day 00:32, latest passenger arrival next day 01:30 across five metro lines. Surface GTFS validity ends Oct 2 and must remain OUT_OF_VALIDITY; metro ends Oct 15. Source registration alone is not current scope coverage. Overlapping service days are not proof of 24h running.
- Real seven-archive proof and the 20-city coverage matrix: `docs/verification/2026-10-service-schedule-official-audit.json`; architecture, coverage limitations and integration details: `docs/archive/2026-10-service-schedule-evidence.md`. 186 regressions, TypeScript, lint and build pass. Claude's uncommitted LED/Ask files were preserved. The helper is ready; the lab UI has not been integrated by this branch.
- **Formal backend rollout confirmed**: runtime `179bef9`, deployment `dpl_9ZJvQqpd4d4JEKqE4kXm1817Bpm1` / `www.theitalystrike.com`. Sync `26117923-0f26-44d5-9e9d-5ada5665be24` succeeded (76 fetched / 58 upserted / two COMPLETE subway schedule facts). Both Oct 9 ATM metro events and published aggregate expose next-day 00:32 departure / 01:30 arrival, while both BUS records expose OUT_OF_VALIDITY and no number. Twenty city page/API/calendar and 20 prior scope checks pass. Existing DeepL translation 403 and blocked operator warnings remain; they do not stop sync. Semantic QA ledger USD 0.006489 this month, cap unchanged. Production proof: `docs/verification/2026-10-service-schedule-production-{evidence,checks}.json`. Lab display integration remains Claude's pending work.
