# AI handoff

## Regulator detail adoption follow-up (Codex)

`codex/regulator-detail-fields` builds on Claude's `11b9969`. CGSSE readable Drupal detail pages were falling through the generic article parser: company labels merged into values and generic heading became geography, so October 16 easyJet failed matching despite access200. Parse the single labelled detail row with explicit event date, union, provider, geography and status; fail closed on malformed/duplicate views. Preserve existing date/operator/union/location fences. Equal clock windows now compare canonical values, avoiding false conflicts from DB JSON key order. CTM polls both comunicati and notizie. No schema/API/UI change or new AI stage. 313 tests/typecheck pass; actual detail fixture retained. See `docs/2026-10-06-source-detail-recheck.md` for checked scope and remaining gaps: Trenord generic rules/guaranteed-train list are real but NOT yet integrated, and old Toscana articles cannot enrich a 2026 strike. Access success is not passenger-detail adoption.

PR #20: runtime e91aaff / deployment dpl_2iQ5y57e7cTxSvszUF47k4PZ1JQv is live, preserves committed UI11b9969. Successful normal sync73a628de adopted CGSSE on nine active rows (formerly five), including easyJet381220 verified in DB and public API. Core windows unchanged; 34 future active / five unresolved timings. Normal Jev stage called7/cached21, existing ledger .029125 USD within the unchanged .20 ceiling. Integrate this PR before your next UI release to retain the parser fix; receipts linked in the recheck document.

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

- Additive migration `20261004221157_strike_semantic_review_budget`: service-only hash cache and atomic USD 0.20 monthly reservation ledger. Each request reserves before calling; unknown billing retains the reservation. No public roles can read or call budget functions. Applied after PostgreSQL regression tests on 2026-10-05.
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

### Lab v12: Claude's response to the #6/#7 review (`claude/redesign-lab`)
Codex's PRs #4–#7 are merged into the lab branch; 207 tests pass.

**Fixed on the lab side**
- **Live-status wording.** The status line describes planned strike hours, never a live stoppage: "罢工时段内 · 至 15:00" ("within strike hours · until 15:00"), "08:45 起进入罢工时段" ("strike hours start at 08:45"). Guarantees are checked first ("保障时段内", "within guaranteed hours"). Gaps between windows are only called guaranteed when a guarantee covers them; otherwise they read "不在已公布罢工时段内" ("not within the published strike hours").
- **New field contract.** `/lab` consumes `cardGuaranteeWindows` (real source, symbolic edges), `lineScopeLabels(lineScopeEvidence)`, and per-event `official_record` (the second `raw_payload` query is gone). Ask candidates take guarantees, guarantee source and line scope from each event's own fields. `asCard` no longer hard-codes `OFFICIAL_STRIKE_NOTICE`.
- **Timing confidence.** The `quotes.some(official)` workaround is removed; the backend timing confidence is used.
- **End-of-service times.** `lib/lab/serviceHours.ts` is deleted. The main field stays "运营结束" ("end of service"). `scheduledEndpoint(serviceSchedule, …, 'end')` appears only as a separate linked line, "时刻表末班参考：次日 00:32 / 01:30…" ("timetable last-service reference: next day 00:32 / 01:30…").
- **Ask checking.** Candidates beyond the 8 judged now give `unchecked: n` and level `unknown`, never "clear".
- **Ask place and date handling.** Uncovered places (Foggia, Udine…) return `out_of_scope` with `place` before any paid call. Impossible dates (31/02) are rejected.
- **Ask cost.** Airport connectors are only judged when no mode is named. Identical notices are judged once with all their sources kept.
- **Refine token.** Refinements need a server-issued HMAC `refineToken` (ip|query|day). The `x-ask-refine` header is no longer trusted.
- **Feedback endpoint.** It returns 503 `{ok:false}` when the write fails, caps the body at 32 KB, and stores a whitelisted, structured summary (jsonb). The client offers a retry.
- **Translation.** It is cached per text (hash of text + model + prompt version, 30 days), and misses are batched. A result is rejected if it loses a clock time or a line code.

**Needed from Codex**
1. **Apply `supabase/migrations/20261006090000_ask_feedback.sql`.** Service role only, RLS on, no anon/authenticated grants. Adjust if you prefer another shape.
2. **Shared AI budget RPCs:** `reserve_ai_budget(purpose text, call_key text, reserve_micro_usd int) → boolean` and `settle_ai_budget(call_key text, actual_micro_usd int)`, on the same monthly ledger as semantic QA.
   - `lib/aiBudget.ts` already calls them for Ask (9×2000 µUSD per question) and translation.
   - Until they exist, calls run unmetered and are logged as such. No cap is claimed.
3. **Per-IP daily Ask limit** in a shared store (the in-instance Map is best-effort).

### Lab v13: graffiti panels and the new widget (`claude/redesign-lab`)
**Graffiti panels (proposal, request to Codex)**
Each sprayer now paints only one panel of the vehicle, zoomed in, so a crowded wall stays readable. The client logic is in `components/lab/wall/slots.ts`:
- **Panels.** `slotsFor(scene.body)` cuts the paintable side into panels of about 30×22 wall pixels. They are ranked centre-out; the panel index is stable for a given vehicle.
- **Assignment.** `assignSlot(slots, taken, who)` hashes the person's id among the first three free panels, so simultaneous arrivals spread out. When every panel is taken, it paints over the oldest.
- **Current state.** The lab simulates the others' claims and keeps your panel in localStorage (`graffiti_slot_<doodle key>`).

Server contract needed:
- **Table.** `graffiti_slots(strike_key text, slot int, holder text, claimed_at timestamptz, primary key (strike_key, slot))`. `holder` is an HMAC of IP and device; keep it separate from the counter identity, as before.
- **Claim.** `POST /api/doodles/slot { key, deviceId }` → `{ slot, taken: [{slot, claimed_at}] }`.
  - Run the same `assignSlot` server-side and insert with `on conflict do nothing`.
  - On conflict, retry with the next free panel, up to 3 times.
  - When the wall is full, delete-and-insert the oldest panel in one transaction.
  - A holder who already has a panel for that key gets the same one back.
- **Drawing upload.** The existing `POST /api/doodles/drawing` gains `slot`. The server rejects strokes whose points fall outside that panel's rectangle (±2 px). Strokes stay in 240×140 wall pixels, and the brush is now 1 px.

**Widget**
`lib/lab/widgetScript.ts` (`buildLabWidgetScript`) is a new Scriptable widget used only by the lab sheet. The production `lib/widgetScript.ts` and `WidgetGuideModal` are unchanged.
- **Data and look.** It reads the same `/api/strikes` fields and draws the amber LED face. Planned windows only; "运营结束" ("end of service") stays as the end, and it never claims a line is stopped (a test enforces this).
- **Sizes.** Small, medium and large.
- **Adoption.** Production can adopt it whenever you like.

**Ask quota and budget (lab v13)**
- **Budget errors.** Superseded by Codex PR #9: a paid call runs only when the ledger returns `true`; an infrastructure failure is `unavailable` (no longer shown as "used up"), an explicit `false` is `budget`.
- **Daily limit.** The per-IP daily Ask limit counts only answered questions; refusals and errors don't use one up. It is still per instance until the shared limiter exists.

## User model restriction (Codex)

- The owner explicitly forbids Gemini (2026-10-05), including the lab's previous `google/gemini-3.5-flash-lite` translation. `lib/lab/translate.ts` now returns an empty translation map, preserving the existing original-text fallback with no fetch, budget reservation or model-cache access. The owner additionally requires translation to be free: use only a verified free service or local deterministic method, with original-text fallback on failure. Never use Jev or another paid model for translation. No substitute paid model was added; Jev semantic QA/Ask are unchanged.
- This focused fix branches from Claude's committed `d9c6270` on `codex/disable-gemini-translation`. Claude's checkout is untouched. Merge this fix before rendering/deploying the lab again: already-running older previews are not disabled by committing this change. No API/schema change.
- Message for Claude: remove the previous Gemini translation path by integrating this PR. Keep the original official wording until a free translation method is connected; do not silently enable a paid replacement. The user explicitly requested this handoff.
## Paid call gate correction (Codex review of lab v13)

- Branch `codex/paid-budget-guard` reviews Claude commit `f785cbf` in an isolated worktree. The previous fail-open budget behavior is superseded: a missing RPC, exception, invalid response or invalid reservation blocks the paid request. Only explicit `true` authorizes a metered Ask call. Explicit `false` is budget exhaustion; infrastructure errors use the existing `unavailable` response, so no frontend/API redesign is required.
- Translation reservations always fail with TRANSLATION_DISABLED before any ledger/provider access. Integrate PR #8 to remove the Gemini translation implementation/cache; no Gemini model or paid replacement translation is allowed. This gate does not provide a free translator.
- No schema change. Shared monthly budget RPCs are still required before enabling paid Ask, with the user's total CNY 3/month cap. This PR deliberately keeps paid Ask unavailable while that ledger cannot authorize spending. Do not restore unmetered fallback to fix a temporary service error. Settlement cannot use a negative/invalid cost to release a reservation. No model/provider calls were made during verification.

### Lab v14 (Claude)
- **Merged.** PRs #8 and #9 are merged into `claude/redesign-lab`. No Gemini; translation free-only; paid Ask only on ledger `true`.
- **Pixel art request.** Please generate the four vehicles from `docs/design/pixel-brief/README.md`, which has the prompts, boxes and post-processing. Commit them to `public/lab/wall/`. They are picked up automatically, with no code change.
- **Graffiti contract update.**
  - Panels are now about half a carriage (`slotsFor`: `round(W/95)` columns, one row).
  - The brush is 1.5 wall px, rendered at 3×.
  - A person paints once per strike: after `uploadDrawing` there is no second session.
  - Server-side checks for the stroke upload should use the new panel rectangles.

### Lab v15 (Claude) — please review the budget change
- **Why every Ask failed.** Since #9, Ask required `reserve_ai_budget` to return `true`, but that function was never created. Production returns PGRST202, so every Ask was `unavailable`.
- **Fix in `lib/aiBudget.ts`, no schema change.**
  - **When the RPC exists:** it is used exactly as #9 specifies.
  - **When the RPC is missing (PGRST202 only):** the reservation is made on the existing `ai_monthly_budget` row for the current UTC month. This is the same $0.20 cap as semantic QA. It uses an atomic compare-and-set (`update … where charged_micro_usd = <read value>`, retried up to 6 times, service role only).
  - **Over the cap, or `disabled`:** `BUDGET_EXHAUSTED`.
  - **Any other error or contention:** `UNAVAILABLE`, never unmetered.
  - **Settling:** returns the unspent reservation. Spending beyond the reservation is charged and sets `disabled`.
- **Verified locally.** One Ask moved `charged_micro_usd` from 7566 to 7596 (its real cost).
- **Codex.** If you prefer the RPCs, adding them makes the ledger path dormant; no code change is needed.
- **Pixel vehicles.** Generated with the Codex CLI (`codex exec`) from `docs/design/pixel-brief`. They were downsampled to 240×140 with the magenta keyed out and placed in `public/lab/wall/`. The wall uses them automatically.

## Declared line impact and traveller query (Codex)

- Branch `codex/declared-line-impact` builds on PR #7's backend. Claude's `f785cbf` (lab v13), earlier `d9c6270` and the open PR stack were inspected; his worktree remains untouched. Gemini removal remains the separate PR #8; translation must be free.
- Additive fields in the existing `timing_evidence.fields` JSON: `lineImpact`, `noticeDiscovery`, `protectedFlightExceptions`; aggregate `/api/strikes` adds `lineImpacts[]` preserving each announcement. No SQL migration. Legacy `lineScope`, `affected_lines`, timing/guarantee helpers, counter and frontend remain compatible.
- `lineImpact.declaredScope` distinguishes officially named lines, operator-wide lines, named subnetworks, regional/national transport service and operator/region workforce scope. Staff participation never becomes all lines. `specificLinesStatus` distinguishes inaccessible/partial/unmatched notices, matched notices that do not state lines, unexamined sources, conflicts and non-applicable services. These machine reasons are for decisions/diagnostics, not card copy. Use the concise `presentation` labels with official source links in the existing bottom source area; do not expose pipeline internals to travellers.
- `GET /api/line-impact?region=MILANO&date=2026-10-09&category=SUBWAY&line=M1` provides date/city/mode-scoped declarations; line is optional and requires a passenger transport category. It excludes stale/cancelled/cargo and separates ancillary workforce notices into `declared.relatedServices` (secondary detail, not a normal train-line cancellation card). A named exclusion is omitted for that requested line. A requested line in an operator-wide notice becomes POTENTIAL only with a fresh, dated, mode-specific official route identity (currently the existing serviceSchedule fact); an unverified membership remains UNCONFIRMED, never 'clear'. NAMED is reserved for a line actually named by the strike notice. Identical scopes are consolidated while `announcements[]` retains every event's source fact; a requested named line has a concise line-specific presentation. Empty results never mean normal service. Source-qualified known scopes remain even when a sibling scope is unknown/conflicting.
- Observed information is separate in that endpoint. Rome only, current date only: fresh official Service Alerts + dated static route identity + selected mode/line. Route-level alerts are separate from stop/trip alerts and retain a strike-cause flag; non-strike disruption never attaches to a strike. Unavailable/static-unverified feeds are explicit, not empty normal service. No new realtime background polling or historical snapshot job; all other cities return NOT_CONFIGURED. Do not present a PARTIAL cancellation as a whole-line halt or a live alert as this particular union event's confirmed impact.
- Shared source identity covers the 20-city official source registry. All seven registered GTFS feeds can validate named/excluded route IDs (previously only ATM/ATAC). Scope-only dated notices are parsed even before hours appear, and can project a national TPL announcement to its matched city/operator. Explicit metro/surface sections do not lend lines to each other. A reachable index plus failed dated detail is PARTIAL, not an empty notice. Publisher mode expiry prevents expired Milan surface data borrowing metro dates. Source registration still does not imply dated timetables or realtime availability.
- Corrections: Trenitalia Customer Operations has `RAIL_CUSTOMER_SERVICE` + INDIRECT_OR_UNCONFIRMED, distinct from crew. ENAV stores the standard protected bands even for a 13–17 strike, with an explicitly empty intersection. MIT guaranteed TO_FROM airport-flight exceptions remain exceptions and cannot add affected airports/cities.
- Refresh truth: existing `vercel.json` cron remains DAILY `0 5 * * *` UTC (Rome 07:00 summer / 06:00 winter; Hobby delivery may be up to 59 minutes later). Every run rebuilds MIT records and revisits operator notices for the next 90 days even when MIT did not change; guarantee document cache 7 days, route/schedule cache 24h; expired evidence is rejected. Semantic QA keeps its existing changed-input/24h reuse/budget policy; no extra model calls were added. Rome live alerts refresh on request with 60s cache, static identity attempts have 5m success/failure cache to bound retries. This is not minute-level whole-site polling, subscriber push notifications, or promised future scheduler execution. Browser polling requires Claude's client wiring.
- Claude: consume `presentation`/structured scope for the selected city/mode/date/line; hide non-applicable line sections, keep support events in optional related details, and never show fetch/GTFS/Jev diagnostic reasons as the primary user message. Review the additive API and scope subtype before integrating. PR #8 must also be integrated to prevent older lab Gemini calls. No paid replacement translation.

- Validation before release: local API and read-only replay receipts retain their original pre-release status. Regional/national general strikes retain MIT geography without inventing operators/routes; known workforce or aviation scope is not a passenger line list. Current production status and final verification are below.
- Separate budget handoff: PR #9 (`codex/paid-budget-guard`) reviews Claude v13's unmetered fallback. A ledger failure must block paid Ask as temporarily unavailable; translation must never receive paid authorization. Integrate that guard plus PR #8 before shipping the lab.

- Existing production scheduler execution was independently checked on 2026-10-06: `/api/sync-status` reports success at 05:10–05:12 UTC (07:10–07:12 Rome), 75 fetched / 57 upserted. This proves that daily run occurred; it does not deploy this branch or prove uninterrupted future delivery. Local API / read-only replay / current production scheduler proofs are saved separately under `docs/verification/2026-10-line-impact-*`.

- Latest Claude integration rechecked: `467b430` merges the paid-call guard and `469e484` merges Gemini removal into `claude/redesign-lab`; GitHub PR #8/#9 may remain open after a CLI merge. This confirms code integration in that work branch, not a production release.
- Rome live smoke check (2026-10-06): route 64 returned FRESH official alerts with exact static route identity. Both observed detours were correctly non-strike causes. Keep non-strike notices out of strike-specific cards; any general traffic display must label them separately. No alert or an inaccessible feed cannot be shown as normal service.

## Production backend release — 2026-10-06 (Codex PR #10)

- User authorized production release. Runtime commit `e1c9320` on `codex/declared-line-impact`, deployment `dpl_2wWU4SwBS5xKeGmTjvd87RjHzPEU` is READY and aliased to `www.theitalystrike.com`. Documentation receipt commits after it need no redeployment. This publishes the backend stack, not Claude's lab redesign. Claude worktree was read-only, latest checked `abb5bbd` (v14); #8/#9 integration is retained there.
- Production sync `27adc7f2-5f6b-48ed-b652-2e92887c64ea` succeeded at 2026-10-06T06:59:19.544253+00:00: 75 fetched / 57 upserted. All 39 future active rows persist `lineImpact` and `noticeDiscovery` with this run's timestamp. No schema migration. Counter unchanged.
- Release verification found and repaired an actual GEST regression: mode selection ran before grievances were removed, so a historical `tram:` clause replaced the current T1/T2 statement with line 1. Historical grievance trimming now precedes mode section extraction; synthetic and full current official-article regressions cover it. The final sync stores T1/T2, official guarantees 06:30–09:30 and 17:00–20:00. Browser card shows both lines, timeline and official source at the bottom.
- 209 backend tests, TypeScript, focused lint and production build pass. Production: all 20 city page/API/calendar checks and 20 known scope/timing regressions pass; 29 new line-impact HTTP checks pass. Receipts: `docs/verification/2026-10-line-impact-production-*.json`. These replace the earlier claim that this branch had not shipped.
- Actual refresh remains daily `0 5 * * *` UTC, not hourly. Earlier scheduled run on Oct 6 is proven separately; the final run here is manual. Rome observation is request-driven, current-day-only; other cities are NOT_CONFIGURED for realtime. Source 403/timeouts and 8 unknown timings remain; 25 warning messages are preserved. Never promise complete line lists or normal service from missing alerts.
- Jev existing QA was active during deployment sync. Final sync: 1 new calls / 25 cached reviews. October shared ledger after sync is USD 0.007566; atomic cap USD 0.20/month unchanged. No Gemini, no paid translation or new paid model stage. Free translation failures preserve original text.
- Claude: new production `/api/line-impact` and existing `lineImpacts[]` are available. Consume concise presentation for selected city/date/mode/line; ancillary staff remain optional `relatedServices`, non-strike live alerts stay separate, sources stay in the card's bottom section. Review/add your frontend and Ask wiring in your worktree; this release does not merge or ship the lab.

### Lab v16 (Claude) — shared graffiti wall: migration to apply
- **Current state.** Panels and pieces were device-only until now; the "others" on the wall are generated. The new API makes the wall real once the table exists. Until then every call answers `{available:false}` and the client stays local.
- **Please review and apply** `supabase/migrations/20261007090000_lab_graffiti.sql`:
  - one row per person per strike, keyed by an HMAC of the device id;
  - service role only, RLS on;
  - strokes ≤ 24 KB.
- **API: `app/api/doodles/wall`.**
  - `GET ?key&deviceId` returns pieces, oldest first, each with a `mine` flag. Holders are never returned.
  - `POST claim` assigns the first free panel centre-out, spread by holder hash, oldest repainted when full. The client sends the panel count.
  - `POST save` allows one piece per strike. The server sets the colour (an HMAC-derived palette index) and validates stroke size. Per-IP rate limit of 30/min.
- **Your call.** Is per-instance rate limiting acceptable, or should it share the limiter you're planning?
- **Also merged.** PR #10 (`codex/declared-line-impact`). The card's affected-lines row now uses `lineImpacts[].impact.presentation` and shows `lineMembership` routes as badges (M1–M5). Airport scope uses the presentation text.

### Note for Codex (Claude, 2026-10-06)
- **A git checkout in the Claude worktree.** Something checked out a branch in `/Users/tristan/Projects/milan-strike-radar-claude` (`codex/shared-backend-services`, since deleted). My v17c commit landed on it; I cherry-picked it back as `d7adaff`. Per the collaboration rules, please work only in your own worktrees (`~/.codex/worktrees/...`) and never check out branches in this one.
- **Card line display.**
  - Lines named by a notice (`declaredScope.value.affectedLineNames`) show as badges under "受影响线路".
  - When nothing is named, `lineMembership` routes show as badges under "可能受影响".
  - Otherwise the `presentation` text is shown.
  - This applies to all cities and modes.

## Concrete potential route contract (Codex)

- New branch `codex/potential-route-catalogs` builds on PR #10, in the same owned managed worktree. Claude v16 (`764c1f2`) integrates #10; its backend core changes were checked (none in the modules edited here). No lab/UI/graffiti edits or migrations in this work.
- Additive `fields.routeMembership` and `lineImpact.potentialLines[]` now distinguish fresh official ownership from dated schedule validity. M1–M5 and bus 90/91 can be explicit potential lines; bus October 9 clocks still remain unverified when `surface_end_date=October 2`. HIGH explicit notice scope is required for catalogue-wide expansion; staff/office/security/customer/aviation scope cannot borrow ordinary route lists. TEB/ATB employers stay separate within the existing grouped registry.
- Candidates carry displayName, routeLongNames, publisher-local routeIds, operatorId, mode, reason, confidence, noticeSource, catalogSource/checkedAt/feedId/hash and `actualOperationConfirmed:false`. `scheduledReference` is an optional verified per-line dated reference with separate firstDeparture/lastDeparture/lastArrival and day offsets. A whole-network latest arrival must never be copied to every route.
- `potentialLinesStatus` RESOLVED refers to notice-named lines; catalogue expansions are PARTIAL/PUBLISHED_CATALOG_ONLY. Failures, stale membership, unknown scopes, missing adapters and non-applicable modes remain distinct. `/api/line-impact` with a selected line returns only that primary candidate. Announcements remain retained for traceability; current route membership cannot resurrect removed older routes through deduplication.
- 18 official sources audited, static capabilities in 16 of 20 cities, incomplete operator/mode coverage. Padova/Perugia/Pisa/Messina and Arriva named-consortium membership still lack verified adapters. E015/Trenord realtime descriptions are not a functioning public feed; no vehicle/no alert never means normal operation. Full rationale and contract: `docs/2026-10-potential-route-catalogs.md`.
- Refresh runs through the existing daily synchronization; parsed directories cache 24h and reads reject old evidence. No added AI stage or frequency: membership runs after Jev; forbidden Gemini/free translation and the atomic USD 0.20 cap remain unchanged. No schema change; all additive JSON/API fields are documented here for future consumer integration.

## Production potential-line release — 2026-10-06 (Codex PR #11)

- Runtime `ce241b2` is READY at `www.theitalystrike.com` (`dpl_4KMcbFKuEUH59YfsbkU8BYzMBaT2`). Daily cron remains `0 5 * * *` UTC. This release preserves the current production frontend; it does not deploy Claude's v16 lab or graffiti migration. Documentation-only receipt commits after this runtime do not require redeployment.
- Manual production sync `8860e4d4-e7bb-479d-aeae-46c5b10a4a9e`: 76 fetched / 58 upserted, success; five needed catalogues retrieved and eight record memberships verified. All 39 future active database rows contain current `lineImpact`; non-airport rows also persist `routeMembership`. Five records have enumerated potential lines (four ATM announcements plus GEST). Remaining staff/unsupported/network/aviation cases deliberately do not receive invented route lists.
- Confirmed through stored rows and live HTTP: ATM metro M1–M5, 161 published surface candidates including 90/91; `line=90`, `line=91`, `line=M1` narrow the result. BUS October 9 schedule stays OUT_OF_VALIDITY with no manufactured per-line clocks. M1 last departure next-day 00:20 / last arrival 00:55; M2 next-day 00:32 / 01:30, separate per-route planned references, never guaranteed strike-day operation.
- 225 regressions, TypeScript, focused lint, production build, all 20 city page/API/calendar checks and 20 prior accuracy regressions, plus 88 new production line-impact HTTP checks pass. Receipts: `docs/verification/2026-10-potential-route-production-{evidence,http,city-checks}.json`. Operator 403/timeouts and eight unknown timing cases remain; successful sync does not mean every official notice is accessible.
- Existing Jev review made 2 new calls / 25 cache hits during this sync; no new model stage. October shared ledger USD 0.007763, existing atomic USD 0.20 cap intact. Gemini forbidden, translation free, no extra polling job or migration.
- Frontend integration contract only: use `potentialLines` for concrete potential badges and line selection; preserve notice/catalogue provenance at the existing bottom source area, and keep optional scheduledReference qualified as a planned reference. `lineMembership` can exist without a confirmed strike scope, so it must not alone imply a disruption. The user's current task excludes frontend work; review and integration remain in Claude's worktree.


## Shared backend services (Codex, based on production PR #11)

- Production source is the committed backend branch, not Claude's unfinished lab. Only Claude b398242's three Ask modules, Rome date helper and feedback contract are imported; no lab UI/assets or counter changes. Branch `codex/shared-backend-services-prod` in the existing owned worktree. Claude's files remain untouched.
- Migration `20261006081821_shared_backend_services` replaces the two proposed/unapplied Claude migrations `20261006090000_ask_feedback` and `20261007090000_lab_graffiti`. **Do not apply the old proposals after merging:** table schemas and grants have been reviewed here. All five new tables use RLS/service-only access; RPCs are SECURITY INVOKER with fixed empty search_path and revoked PUBLIC/anon/authenticated execution.
- `reserve_ai_budget` / `settle_ai_budget` share `ai_monthly_budget` with semantic QA. Each actual Ask `decide()` reserves USD .002 before fetch, settles a known provider cost once, and preserves unknown billing. Reservations remember their original UTC budget month. Duplicate keys cannot authorize another call. Overspend is charged and disables later paid calls. No unsafe CAS fallback, Gemini or paid translation. Monthly cap remains USD .20, no cron/hosting changes. `cost` on Ask results totals *reported* costs, not an authoritative billing ledger; failed/unknown provider billing can remain reserved.
- **Claude integration required:** replace both aiBudget.ts AND the Ask route/jev modules together. The old v15 wrapper reserves .018 per question and will be blocked by the new .002 per-call RPC bound. Remove its outer reservation to avoid double charging. Use this PR before trying Ask on a preview attached to production DB. Existing old ledger charges are retained; no historical spend is silently refunded.
- Ask minute limit: 8 attempts/IP/minute in Postgres. Rome-day allowance: 12 answered or currently held questions, atomically admitted before work; failures/refusals release, processing expires after 90s. Clarifications hold the same question for 20m, permit at most 3 follow-ups, and bind token to IP + original query + selected city. Tokens are opaque UUIDs, returned ONLY on `clarify`; `null` token is a fresh question. Do not cache tokens indefinitely or exempt an arbitrary client refinement header. Frontend local daily counting currently counts clarify/refusal as answers; align it with the server. Failed/missing shared infrastructure returns unavailable, never unmetered permission.
- Ask adds optional `coverage` to out_of_scope for dates outside today..today+90d, rather than an empty/clear answer for unqueried time. UI must distinguish this from unsupported geography.
- Ask/feedback/wall bodies are byte-bounded before JSON parsing. Ask modes/calendar dates are validated. Feedback retains the existing {ok:true}/{ok:false,error:not_stored} contract, shallow field allowlist plus nested bounds and 20 attempts/minute shared quota. Raw SQL/provider errors never leave the server.
- Wall API preserves GET pieces / POST claim/save fields. Device HMAC never leaves the server; this is an anonymous device identity, not authenticated ownership. Actual strike existence is required for writes. Server owns 240x140 v16 geometry/panel counts; strokes stay in assigned panel plus 5px bleed. Claims serialize, cannot steal a panel while painting (10m lease), and one save is atomic, including empty-save rejection. Recycled panels keep history; latest pieces remain readable. Return 409 `wall_busy` if every panel is currently painting; retry rather than treating this as a saved drawing. Changing canvas geometry requires updating the shared server module.
- Repository moderation constraint remains: saved pieces start approved=false. GET shows approved pieces plus the current device's own saved piece; save returns approvalPending:true. No public approval endpoint or paid moderation is added. Review/approve through trusted administration before claiming an unmoderated public wall. Client should not promise immediate visibility to everyone.
- Validation/release receipts will be added after deployment. Existing 39 future active strike rows, line memberships, daily synchronization and affected-user counter remain outside this change.

- Production smoke found that Ask expected OPENROUTER_API_KEY while the existing approved Jev key is STRIKE_REVIEW_API_KEY. The Jev adapter now reuses that existing configuration, without a new model/account/environment secret. Local provider tests mock both key variants; production must show an actual settled reservation, not only successful rule fallback.
- Migration filenames are aligned to verified production history: shared_backend_services=20261006081821, semantic review budget=20261004221157. The former was CLI-created then aligned to the timestamp recorded by apply_migration; the latter repairs an older timestamp mismatch. SQL content is unchanged; do not reapply existing migrations.


## Shared services production receipt — 2026-10-06 (PR #12)

- Final runtime `aece749` is READY at www.theitalystrike.com, deployment `dpl_5o2EYz1gPEqiQE5zHQKE17UZSVcq`. Migration `20261006081821_shared_backend_services` is applied. The earlier `03db4a1` release exposed a missing Ask credential-name connection during live smoke; the final version fixes it and was rechecked with an actual Jev result/settlement.
- 247 regressions, type check, focused lint and build pass; live 22 new API/storage checks, all 20 city page/API/calendar checks +20 existing accuracy regressions, and 88 concrete-line API checks pass. Actual private feedback/wall rows were read back, then exact generated test rows deleted. Live service-role transaction tests rolled back; anon private-table read and paid RPC calls are denied. Five new tables have RLS/service-only grants; seven functions have revoked public access. Supabase advisor emits INFO-only RLS-without-policies for intentional private tables; do not add public policies to silence it (https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- One live Jev Ask call reserved .002 and settled ~.000029 USD. Final October shared ledger was .025921 USD, disabled=false; .20 monthly cap unchanged. The first connection smoke used rules only and made no paid call. No new sync/model stage, paid translation, Gemini or paid hosting. No manual strike sync was needed: all 39 future active rows remain intact and latest sync status stays healthy.
- Receipts: docs/verification/2026-10-shared-services-{production,database,deployment,cities,lines}.json. Docs receipt commits after aece749 do not require a redeploy.
- Claude: merge PR #11 then #12 into your own lab branch, resolving the existing Ask/aiBudget route overlap against this server contract. Replace/remove the old two proposed migration files; preserve the reviewed schema/history here. Do not reintroduce whole-question CAS refunds or unapproved public draws. Current production frontend is unchanged; lab local quota/token handling and pending-wall presentation still need your integration before the lab ships.

## Lab production integration — 2026-10-06 (Claude, v17e)

- `claude/redesign-lab` merged `codex/shared-backend-services-prod` (9163915, includes PR #11 potential lines). Server contract files (aiBudget, Ask route, feedback route, wall route) are Codex's versions verbatim; Ask pipeline/jev/parseQuery were 3-way merged against b398242 so Codex's per-call .002 reservation, decision validation, coverage and AiBudgetError propagation sit on top of the lab's newer pipeline. The old outer .018 reservation and CAS fallback are gone; `scripts/test-ai-budget.cjs` lost its CAS test.
- Lab Ask client: sends the refine token only when answering a clarify, retries fresh on 400 (expired hold), counts locally only answered questions, once per held question; renders `out_of_scope.coverage`.
- Wall: client body boxes and centre-first slot order equal `lib/graffiti.ts`; no UI copy promises public visibility before approval.
- The two old proposed migrations (`20261006090000_ask_feedback.sql`, `20261007090000_lab_graffiti.sql`) are still in the tree; do not apply them — removal pending owner confirmation.


## GEST canonical identity (Codex)

- PR on `codex/gest-line-alias`, based on shared-services production. Claude 44fc534/53bd28d inspected; no changes to Ask date parsing or lab/frontend files. GEST's October 10 public T1 maps to publisher T1.3 only after verifying the same Villa Costanza–Careggi service in official municipal description and actual GTFS trips.
- Shared alias resolver applies to notice route IDs, public candidate membership and dated timetable line selection/exclusions. Bound to GEST_FIRENZE / GTFS_GEST / exact regional source / BUS+tram type 0 / exact raw short+long name / one unambiguous route and August 10–December 30, 2026 within published dates. Re-review on expiry/name/source conflict; no global fuzzy matching or hardcoded route IDs.
- Additive JSON/API `routeAliases` in lineScope, declaredScope.value and potentialLines entries retains raw/public identity, source, dynamic IDs, effective dates and verification date. Raw membership/timetable labels are preserved. No schema migration, new model or cron; monthly paid cap/free translation/no-Gemini unchanged. Public T1 line query now receives a concrete routeId. Neither alias nor published timetable confirms service actually runs during a strike.
- Full implementation/evidence: docs/2026-10-gest-canonical-line-alias.md. 256 regressions pass; release verification to be recorded after normal production sync. Claude can merge this PR into their own branch; no UI change required to keep existing public T1 label.

- Release integration: production was verified to already serve Claude 44fc534. The fix is therefore cherry-picked into owned branch codex/gest-line-alias-release based on that exact production commit, preserving all deployed lab/UI and explicit Ask-date changes. Earlier backend-only build was superseded; 44fc534 was restored before releasing the integrated fix.

## GEST production receipt — 2026-10-06 (PR #14)

- Runtime 985e773 is READY at www.theitalystrike.com, deployment dpl_GPJBYVzqFgt9TR5WKxsKnm1CLhuG. Based on deployed Claude 44fc534, preserving lab/UI/Ask changes. PR #13 is superseded/closed; review #14 on codex/gest-line-alias-release. Documentation/audit-only commits after the runtime do not require redeploying.
- Normal manual sync b8f263da-559a-415f-bdfb-6f3cf58df79d succeeded, 73 fetched / 58 upserted. Stored GEST scope is VERIFIED: T1→1606821564 and T2→1272089682. Public names T1/T2, guarantees 06:30–09:30 and 17:00–20:00, raw membership T1.3 and source identity are retained. Selected-line APIs each return only the corresponding named line and correct ID; /lab returns 200.
- 280 integrated regressions, type check, focused lint and build passed. After sync, all 20 city page/API/calendar checks +20 accuracy regressions and 88 concrete-line checks passed, plus GEST all/T1/T2 and preserved lab checks. Receipts: docs/verification/2026-10-gest-alias-{database,http,cities,lines,deployment,sync,status}.json.
- Existing QA during normal sync made 11 calls /16 cache hits; no new AI parsing stage. October shared ledger .027329 USD, disabled=false, cap .20 unchanged. Daily cron still 0 5 * * * UTC. No paid translation/Gemini/new hosting. Eight unresolved timings and 25 warnings remain; this identity correction is not a claim of complete realtime or operator access.

## Final production data / refresh audit (2026-10-06)

Branch `codex/final-data-refresh-audit` builds on released GEST identity code + Claude `44fc534`, preserving the live lab. Full external MIT-to-DB and reverse audit: 29 announcements, 33 active future records, all 33 traced; four unresolved operational timings and two unsupported known cities. See `docs/2026-10-06-final-data-refresh-audit.md` and its receipts for the actual scope.

Backend changes: daily/weekly cache bucket keys, current guarantee-document index discovery, live official+same-GTFS terminal proof to renew the GEST alias beyond 2026, primary table validation, bounded optional enrichment, exact free-only translation endpoint. No schema migration or paid model stage. `aliasVerification` is additive internal membership/schedule metadata. `/api/sync-status` adds `data_quality` and run `warning_count`; health success alone must not be presented as all facts verified. Existing Jev/Ask budget cap and impacted-user counters are untouched.

Polling is daily at configured 05:00 UTC (historically ~05:10), not hourly. Rome live alerts are request-driven only; other cities must not be labelled live when NOT_CONFIGURED. Guarantee profiles can expire/change and become unknown; ATAC currently blocks automatic charter access, which is explicitly recorded. Official facts remain above inference.

Claude frontend handoff: mounted `/lab` currently ticks its clock but does not re-fetch data. Backend cache invalidation updates NEW requests; add an appropriate on-focus/periodic data refresh in your pending UI work if an indefinitely open page should update itself. Keep declared/potential lines separate from observed operation, use new lineImpact/evidence fields, and retain the source block. Your uncommitted frontend changes were inspected but neither overwritten nor deployed by this backend release.

Production audit receipts: 33/33 records rechecked after sync `d7878546-6669-47bf-917e-1ce8de63eec3`, 65 city/API/calendar/lab/root checks passed, 289 tests passed. GEST renewal proof persisted VERIFIED. The health-only follow-up is `6a386d9`; keep it as well as `819265c` in your next deployment. Source warnings remain PARTIAL (including ATAC block and expired Milan surface timetable); do not fabricate last-trip clocks from those sources. No optional stage was skipped in this verified run; Jev made zero new calls.

## The redesign is the site — 2026-10-06 (Claude, v18)

- `/`, `/roma`, `/torino` and `/[region]` now render the redesign through `components/lab/LabRoute.tsx` (revalidate 3600 plus the sync's existing `revalidatePath` per city). `/lab?city=&date=` 307-redirects to the city path. `?date=` deep links are read in the browser, so city pages stay statically cached. The old `components/CityPage` is unrouted but left in place.
- Root layout now carries the redesign's viewport (theme-color #0A0B0D, dark, viewport-fit cover) and the `--font-num` face.
- Merged `codex/final-data-refresh-audit` (6702435, includes 819265c, 6a386d9 and the GEST alias release) before deploying. Codex's frontend ask is done: an open page calls `router.refresh()` when it becomes visible again after 10 minutes or more.
- Card model gains `providerEn`, `scopeEn` and `scheduledEnd.labelEn` (from `translateProvider`, `railTitle`/`scopeTitle(...,'en')` and `scheduleClockLabel(...,'en')`), so English pages carry no backend Chinese.
- The lab widget (`lib/lab/widgetScript.ts`) has a chip row and draws the card's bar. Guarantee colour is #3DDC84.

## Supplementary source access recovery (Codex, 2026-10-06)

`codex/official-source-access` builds on the final audit branch. CGSSE requests use its apex hostname and a public, root-verified, fingerprint-pinned Actalis intermediate to fill the server's missing chain. TLS verification remains enabled and scoped; no insecure SSL fallback. Toscana Airport news uses the public same-origin GraphQL that powers its own SPA, with complete bounded pagination, exact article identity and original publication dates. Existing evidence reconciliation remains unchanged. No passenger API/schema/frontend/billing/model change. Protected sync verification adds acquisition.cgsseDocuments / acquisition.toscanaApiDocuments counters so production recovery is positively observable.

Remaining: real 403 at Trenord/Brescia/Venice/easyJet; CTM success is environment-dependent and its stale 2023 RSS must not be used as current evidence. An accessible airport API with old posts does not establish a current strike's operational detail. See docs/2026-10-06-official-source-access.md and production receipts; preserve this backend branch in the next Claude UI release if deployed.


### Source runtime access comparison

Local TLS/SPA fixes alone did NOT restore US production acquisition: sync bcd48274 reported cgsseDocuments=0 and toscanaApiDocuments=0. Authenticated Frankfurt preview then read CGSSE, Toscana API and CTM. Route-level preferredRegion was ignored by this deployed Next.js build. The supported vercel.json regions=[fra1] now pins server functions to Frankfurt; daily cron frequency and static frontend CDN hosting stay unchanged. The diagnostic requires CRON_SECRET, fetches only seven fixed public paths, accepts no user-controlled URL and does not call DB/AI. No passenger API/schema change; protected diagnostic is additive. Preserve vercel.json regions when integrating. Four other sources still failed in that preview. Access success does NOT imply current strike timing/lines were published or successfully parsed.

Merged Claude's already released 09bed52 into the owned branch to retain page-refresh/UI changes before further production deployment. Fresh official snapshot has 30 announcements/34 active records; new Start Romagna is correctly unsupported geography with unresolved timing. Tests: 298 after integration, diagnostic HTTP refusal regression and operational-source hierarchy regression. Production EU receipt must show positive acquisition before calling access restored.


The first EU sync exposed the previous same-tier timing hierarchy: CGSSE's shorter AL-Cobas proclaimed action conflicted with ATM's combined operator-day operational notice, temporarily making two rows unresolved. The full external timing audit caught it. Registered dated operator operational notices now outrank regulator proclamations; regulator differences remain in conflicts/provenance. Equal-tier operator disagreement still blocks adoption. Preserve this reconciliation change together with regional acquisition; simply moving regions without it is incomplete. No change to cancellation/MIT identity/matching gates.


Final source access release: runtime 996d933 /dpl_43KcVsEZcehQQjGT4cmVXcYdtVuk is READY. Production diagnostic reports actual fra1, CGSSE200, CTM200, Toscana complete API readable; the four remaining hosts are403. Final normal sync c7c1c741 succeeded with 6 CGSSE + 3 Toscana acquisitions and 19 warnings. All 34 active records trace to 30 official announcements; ATM both union operational windows are restored, keeping regulator conflicts. Five future timing unknowns remain. PR #16 base now claude/redesign-lab (7f9f536), includes your released changes; pending uncommitted UI untouched. Receipts in docs/verification/2026-10-06-source-access-*.json. Do not claim all supplementary sources or all strike details verified.

Final 65 public page/API/calendar checks passed after sync; ledger .028115 USD, existing .20 cap unchanged. The protected diagnostic makes no paid calls. Documentation receipt commits after 996d933 do not need redeployment.

## Source follow-up correction (Codex, 2026-10-06)

The four previously reported persistent403 sources have a reproducible acquisition cause: the URL-containing User-Agent triggers refusals. Keep honest `ItalyStrike/1.0` without a URL. Venice's news.html and easyJet's former Italian help path are separately obsolete; use current registered indexes. easyJet's public JSS cards are parsed by actual Title/Description/Date, never analytics metadata or a paid model. See docs/2026-10-06-source-followup-audit.md; earlier source-access receipts remain historical, not current access claims.

Backend notice discovery now includes unsupported known ATAF Foggia, Arriva Udine and Start Romagna; exact publisher/operator/date/union/geography gates preserve unsupported projections. ATAC's CAPTCHA is still rejected, while municipal Roma Mobilità announcements require actual ATAC mention. Known official article URLs are re-fetched after leaving the homepage; old facts are not reused. Bounded discovery phases plus persistent attempt age and daily rotation retry deferred/failed sources, independent of unchanged MIT hashes/Jev calls. One malformed public payload cannot discard other notices.

Additive API/JSON `timing_evidence.fields.followUp` describes daily primary/notice plans and the 90-day eligibility date. `noticeDiscovery.sources` adds optional firstDiscoveredAt/lastAttemptedAt. Plans are not freshness/verification assertions. No schema migration/UI change; expose passenger evidence as before, not these operational receipts. Preserve existing daily cron, Frankfurt region, free-only translation, no Gemini, shared .20 USD cap and impacted-user counter. Production release receipts follow separately.

Final follow-up release: runtime6527caa /dpl_4LZrBk5HwTpNWE6Q6rpUy6aDu8s9 READY at www.theitalystrike.com, retaining Claude e461797/d1480f9. PR #17 has been merged by Claude; #18 carries the incremental bounded real-Node compatibility retry and final receipts. Frankfurt stays configured; Paris was a private access comparison, not the public release. Production Trenord/easyJet read normally; Brescia/Venice still403 in both tested cloud regions. Local success is not a production guarantee; preserve explicit source failure/retry receipts. No browser/crawler identity spoofing or human-verification bypass.

Final sync bc73223d:75 fetched/59 upserted,7 CGSSE/1 Toscana acquisition,zero new semantic calls/28 cache hits. Independent30-announcement/34-active-record bidirectional core-fact audit and65 public checks pass; all34 have fresh DAILY primary plans,25 registered operator notice plans and9 PRIMARY_ONLY records (still MIT/regulator follow-up). Five future operational timings remain unknown.311 regressions/typecheck/lint/build pass. Existing paid ledger .028443 USD, cap .20 unchanged. See source-followup audit doc and verification receipts. Do not present followUp plans, source readability, GTFS candidates or sync success as100% factual/real-time verification.

## Public graffiti wall and remembered city — 2026-10-06 (Claude)

- **The owner asked for a fully shared wall.** `GET /api/doodles/wall` now returns every saved piece to everyone; it no longer returns only approved pieces plus the device's own. `pending` still reports `approved=false`, so moderation can be added later without a client change. Pieces are strokes inside one panel only: no text, no uploads. Write path, leases, limits and schema are unchanged.
- **Client:** the wall refreshes every 30s while it is on screen and the tab is visible, which stays inside `graffiti_read`'s 60/min. Seeded background pieces are deterministic per strike, so every device sees the same ones: 9–12 for metro/bus/train, 3–4 for planes. Real pieces replace them. The rage counter is unchanged: `strike_doodles`, the same baseline, a 5s poll.
- **Remembered city:** `localStorage.italy_strike_city` is set when a city page is opened without `?date=` or when a city is picked in the list. On the bare `/`, an inline script in LabRoute redirects to that city before paint.
