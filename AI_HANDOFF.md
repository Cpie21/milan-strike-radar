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
- Production runtime commit: `5319bc3`, deployment `dpl_eUZaNxcvEuH5T1WbCTW76QfHVzNQ`; geography/review audit in `docs/archive/2026-10-v1.7-geography-and-review-audit.md` (PR #3). Earlier semantic QA audit is v1.6 (PR #2). Scope/method/passenger-impact/geography facts use the existing JSON column; the v1.6 budget/cache migration is described below.

## Natural-language query (Claude, branch `claude/ai-ask`)

- `POST /api/ask` streams NDJSON stage events, then `{type:"final", result}`. Types live in `lib/ask/pipeline.ts`.
- Rules (`lib/ask/parseQuery.ts`) own dates, times, cities, line codes. Jev (`typesafe/jev-1.13` via OpenRouter, `lib/ask/jev.ts`) owns intent, semantic modes and per-strike relevance. Code owns overlap and impact. Jev failure degrades to rules and says so.
- Reads strikes only through `readCityStrikes` + `aggregateStrikes`; changes to `strike_events` or `timing_evidence` shape affect it.
- Env: `OPENROUTER_API_KEY` (Vercel: Preview only so far). Rate limit is in-memory per instance — needs a shared store before production.

## Semantic QA integration (Codex, `codex/strike-semantic-qa`)

- Additive migration `20261004215721_strike_semantic_review_budget`: service-only hash cache and atomic USD 0.20 monthly reservation ledger. Each request reserves before calling; unknown billing retains the reservation. No public roles can read or call budget functions. Applied after PostgreSQL regression tests on 2026-10-05.
- Jev reviews compact official fields vs parser output, not dates/time arithmetic or user prose. Corrections require independently supported official candidates; high-confidence unsupported mismatches stay flagged; low-confidence disagreements remain INCONCLUSIVE and never replace official data. Same unchanged input uses a 24-hour cache; at most 30 paid calls per sync with a 55-second QA deadline; no retry storms.
- Current production cron remains daily; no paid plan upgrade or hourly Jev loop. This ceiling covers semantic QA only; Claude must route future public Ask calls through the shared budget before claiming a site-wide AI cap. Existing Ask client is not deployed by this branch. Current semantic-v5 production QA yielded 11 AGREES/15 INCONCLUSIVE across 26 announcements; do not advertise these as all AI-validated facts. The persisted queue is currently empty; cached rereads of all 26 results made no paid calls. October ledger remains USD 0.004267 after those rereads.
- Railway scope subtypes and MIXED_AIRPORT_SERVICES are additive API values. Frontend/Ask must not treat security/infrastructure hours as confirmed train cancellations.

## Geography and review follow-up (Codex)

- `RAIL_GENERAL` uses the same explicit FERROVIARIO section as time parsing; separate APPALTI FERROVIARI / freight clauses remain in `fields.railSections` and cannot downgrade that event to support-only.
- `fields.officialGeography` preserves MIT raw region/province/relevance; `supportedCityProjection` is a subset for this site's 20-city routes, not an exclusivity claim. `locationStatus` distinguishes unsupported official cities from unknown locations. These are additive existing-JSON/API fields; no schema migration.
- `/api/ask` integration must carry officialGeography/projection through responses and may not say only Bologna from a supported-city projection. Foggia/Udine remain outside the UI registry; declared province remains known. Checked Claude's current `lib/ask/pipeline.ts`: candidate loading still omits scopeType, passengerImpact and geography/projection. Ask code stays on Claude's branch; this release does not claim that Ask has been fixed.
- Semantic review >=0.80 concerns enter NEEDS_REVIEW (or FLAGGED for high-confidence conflicts), independently of low subtype confidence. >=0.97 corrections still require explicit official evidence; model uncertainty alone cannot alter facts. `npm run review:queue` reads the service-only persisted queue without paid calls, uses the latest result per source and current review version.

## Schema changes

- 2026-10-04 (Codex): `20261004134223_sync_reconciliation_and_feedback`, `20261004142222_external_strike_timing` — applied to production.

## Current ownership

- Codex: sync, enrichment, timing evidence, data APIs; worktree `/Users/tristan/.codex/worktrees/strike-card-coverage/milan-strike-radar`, branch `codex/strike-geography-review`.
- Claude: frontend redesign (exploration under `/lab`, then the city page), natural-language query UI.
- Shared hot file: `components/StrikeDashboard.tsx` — the redesign will replace most of it. Codex, prefer data-layer changes over edits there until the redesign lands.

## Open cross-module issues

- `main` is behind the committed production backend; review `codex/strike-evidence-handoff` before integrating it. PR body is prepared in `docs/archive/2026-10-backend-handoff-pr.md`; Git HTTPS authentication is now available; the backend base branch has been pushed for PR review.
- Latest backend production build is committed (`5319bc3`), excluding Claude's Ask feature. Claude's worktree is currently `claude/redesign-lab` at `e8cb37a`; its Ask commit `df13f07` is based on the preceding `e4ed9d7` backend commit. Preserve its Rome-date and dashboard changes during integration. Collaboration docs originated in Claude's `361f3ed` and were cherry-picked, then updated here. User explicitly assigned frontend redesign to Claude; Codex should focus on backend logic/data accuracy and pass new evidence fields through this contract.
- Evidence coverage remains incomplete: 6 future active supported-city records have operator official matches, 5 have reported supplements, 24 are MIT-only (35 source records including cargo, not cards). Firenze/Pisa 14 October TPL still has unknown clock times; some official sites block fetches. Never describe these as all officially verified.
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
