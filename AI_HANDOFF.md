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

- Data flow: MIT official list + status search → `lib/strikeSync.ts` → `strikes` table → `lib/strikeQuery.ts` (`readCityStrikes`, refuses to serve when the last sync is unhealthy) → `components/utils.ts` `aggregateStrikes` (one card per city/date/mode; aviation also separates scope and affected airline, raw announcements kept in `strike_events`) → pages, `/api/strikes` (widget), `/api/calendar` (ICS).
- Identity: a strike row is keyed by `source_key` (hash of the MIT announcement, timing excluded) + date + region + category. Revisions overwrite; rows not seen any more become `STALE`.
- Timing evidence: `timing_evidence` holds windows with symbolic endpoints (`end_of_service`), sources and confidence. Never invent a full day or midnight; unknown stays unknown.
- Cities: `lib/cities.ts` is the only registry (20 cities); routes are `/[region]`, Milan is `/`.
- Time: strike dates and clock times are Rome local. Claude's Ask branch adds `lib/romeDate.ts`; preserve those helpers when integrating its client changes.
- Sync health: `strike_sync_runs`; `/api/sync-status` is the monitoring endpoint.

## Frontend / API evidence contract (Codex)

- Source facts persist in existing `strikes.timing_evidence.fields`: `location`, `scopeType`, `affectedLines`, `affectedAirports`, `affectedOperators`, `timing`, `exclusions`, `guaranteedServiceWindow`. Facts have `value`, `confidence`, `source`, optional `url`/`excerpt`. Unknown and conflicting facts must remain distinguishable.
- Aggregated `/api/strikes` and `aggregateStrikes` retain `strike_events`, source evidence and symbolic windows, and expose `scopeType`, `guaranteeSource`, `guaranteedServiceWindow`, `lineScope`, `field_evidence`. Keep these when changing cards or `/api/ask`; do not assume `AIRPORT` means whole-airport disruption.
- Aviation scopes: `AIRPORT`, `AIRLINE`, `AIRLINE_CREW`, `GROUND_HANDLING`, `CARGO`, `NATIONAL_AVIATION`, `UNKNOWN`. Cargo stays in source history but is excluded from passenger city cards.
- Never widen unknown geography, airports, operators or lines. `UNKNOWN` lines must not render as all lines. A national airline strike does not imply every airport is disrupted. Explicit airport geography overrides coarse MIT national tags.
- Guarantees distinguish `OFFICIAL_STRIKE_NOTICE`, `STANDARD_RULE`, `OPERATOR_RULE`, `UNKNOWN`. No city-based default or inferred complement guarantees. Protected flights / minimum service do not mean every departure runs normally.
- Keep source links and timing differences in the existing bottom source area; retain the timeline and semantic service-start/service-end endpoints. Do not change the affected-user counter.
- Concrete operator notice detail can supersede coarse MIT timing, while preserving both sources and differences. Reported detail remains labelled as reported; blocked or unmatched sites are not official verification.
- Production runtime commit: `e4ed9d7`, deployment `dpl_xuxQPWLuviwdQA3zRmjspotyGYuz`. Audit proofs are in `docs/archive/2026-10-v1.5-evidence-audit.md` and `docs/verification/2026-10-v1.5-*`. New fact fields use the existing JSON column; this release needs no additional schema migration.

## Natural-language query (Claude, branch `claude/ai-ask`)

- `POST /api/ask` streams NDJSON stage events, then `{type:"final", result}`. Types live in `lib/ask/pipeline.ts`.
- Rules (`lib/ask/parseQuery.ts`) own dates, times, cities, line codes. Jev (`typesafe/jev-1.13` via OpenRouter, `lib/ask/jev.ts`) owns intent, semantic modes and per-strike relevance. Code owns overlap and impact. Jev failure degrades to rules and says so.
- Reads strikes only through `readCityStrikes` + `aggregateStrikes`; changes to `strike_events` or `timing_evidence` shape affect it.
- Env: `OPENROUTER_API_KEY` (Vercel: Preview only so far). Rate limit is in-memory per instance — needs a shared store before production.

## Schema changes

- 2026-10-04 (Codex): `20261004134223_sync_reconciliation_and_feedback`, `20261004142222_external_strike_timing` — applied to production.

## Current ownership

- Codex: sync, enrichment, timing evidence, data APIs; worktree `/Users/tristan/.codex/worktrees/strike-card-coverage/milan-strike-radar`, branch `codex/strike-evidence-handoff`.
- Claude: frontend redesign (exploration under `/lab`, then the city page), natural-language query UI.
- Shared hot file: `components/StrikeDashboard.tsx` — the redesign will replace most of it. Codex, prefer data-layer changes over edits there until the redesign lands.

## Open cross-module issues

- `main` is far behind `codex/英语功能测试`; merge it back and make `main` the trunk.
- Latest backend production build is committed (`e4ed9d7`), excluding Claude's Ask feature. Claude's `df13f07` is based on that backend commit; preserve its Rome-date and dashboard changes during integration. Collaboration docs originated in Claude's `361f3ed` and were cherry-picked, then updated here.
- Evidence coverage remains incomplete: 2 future active supported-city records have operator official matches, 9 have reported supplements, 20 are MIT-only (31 source records including cargo, not cards). Firenze/Pisa 14 October TPL still has unknown clock times; some official sites block fetches. Never describe these as all officially verified.
- `/api/ask` rate limiting and Jev calibration on real questions are unverified.
