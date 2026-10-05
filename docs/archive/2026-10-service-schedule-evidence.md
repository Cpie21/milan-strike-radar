# Scheduled service endpoints and Claude integration

The current Claude v10 lab (`88be100`) uses M4's approximately 00:30 operating-hours page as the fallback for every Milan subway card. That page concerns M4; it cannot establish all metro lines' final service. Its source link also appears under the main time, rather than the established bottom source area. Claude's current uncommitted LED/Ask changes were inspected and preserved.

The backend now derives a separate **scheduled passenger service** fact. It does not replace the official strike window, declare actual disruption, predict a guaranteed last departure, or determine a resumption time.

## Data path

MIT + matched operator strike notice → existing guarantees / route scope → existing semantic QA → bounded official GTFS schedule projection → existing JSON upsert → existing cached city query / card aggregation.

`timing_evidence.fields.serviceSchedule` is additive JSON, with no migration. Aggregation exposes `serviceSchedule`; it requires complete evidence for every active announcement. A cancelled or unknown announcement cannot supply the endpoint. Missing coverage cannot inherit one other announcement's endpoint.

The fact contains service date, operator, mode, source, checkedAt, whole-file hash, per-route times, first departure, final origin departure, and final passenger arrival. A clock has `clock`, `dayOffset`, and service-day `seconds`. For example, 25:30 is `01:30` with offset 1. The final arrival is the end-of-service reference; `lastDeparture` is a different fact. Train, airport, office/security/support or unverified network scope cannot borrow another operator's timetable.

The adapter validates agency/timezone, calendars, date additions/removals, exact route identities and mode, exclusions, published validity, missing times and frequency-based services. Milan's `surface_end_date` and `mm_end_date` are separate validity limits. Identical calendar exceptions are deduplicated; conflicting exceptions fail. Corrupt ZIP/CRC, oversized members, changed or unapproved sources and deadlines fail safely. Stop times are streamed; shapes and stop coordinates are not inflated. Parsed small projections are cached for 24h; failures do not become successful evidence. Enrichment has a 60s overall admission budget and 45s per-source deadline. It never stops MIT ingestion.

Whole-operator scopes with overlapping consecutive service days are labelled `OVERLAPPING_SERVICE_DAYS`. They retain per-route references but have no definitive network endpoint; this is **not** a claim of continuous 24h service. Partial sources retain useful route facts but cannot supply a whole-card end. The source registry has all 20 cities × four modes explicitly represented; a configured source is not proof of a complete current timetable.

## Official file audit, 2026-10-05

Seven official archives were downloaded and actually parsed: Milan, Rome, GEST Firenze, AMTAB Bari, AMT Genova, CTM Cagliari, AMTS Catania. Source URLs, hashes, validity, per-date/mode results and the full 20-city coverage matrix are in `docs/verification/2026-10-service-schedule-official-audit.json`.

- Milan subway, Oct 9: five lines; latest scheduled origin departure next day 00:32; latest scheduled passenger arrival next day 01:30. This is a plan, not the strike's officially announced numeric ending.
- Milan surface service Oct 9: publisher's surface validity ends Oct 2 → **OUT_OF_VALIDITY**, no numeric endpoint. Metro validity ends Oct 15, so Oct 16 metro cannot reuse Oct 9's result either.
- GEST, Oct 10: two scheduled routes; last origin departure 23:56, last arrival next day 00:36. On other dates, overlapping service days can block a whole-network end.
- Rome / Bari include overlapping overnight service days; a single last-network time is withheld, with route-level references preserved.
- Genova includes incomplete/frequency-based scope; source parsing succeeds but a broad finite endpoint is withheld. Its date range ends Oct 12.
- The 13 other supported cities still have **NO_VERIFIED_FEED**, rather than a fabricated city-level default. EAV, Arriva Bergamo, regional/national rail and flight-specific schedules remain further source-integration work. There is no claim that every city/mode now has a number.

## Claude handoff

Use `serviceSchedule` from aggregation, or `fields.serviceSchedule.value` on an individual record. `scheduledEndpoint` validates date, mode, completeness and 48h freshness. `cardTimingLabels` can replace only symbolic display endpoints with numeric **scheduled reference** labels, retaining fixed official clocks. Keep `dayOffset` in the UI. Do not reduce offset-1 times to today's midnight or alter the calendar event's factual end.

Replace the city-only `lib/lab/serviceHours.ts` fallback. Do not use the new endpoint in `statusLine`, Ask's confirmed impact calculation, green guarantees, calendar export or logic promising restored service. Planned service is separate from declared strike scope and observed real-time impact; absent vehicles never prove cancellation or normal operation.

Keep the schedule source and its meaning in the card's **existing bottom source area**. Distinguish “last planned departure” from “last planned arrival / end of service”. Symbolic guarantees remain in `guaranteeEvidenceWindows`; unknown and indirect events remain unknown. The helper is available, but Claude's lab files were not changed or deployed by this work.

No new AI calls, AI extraction or recurring job were added. Existing Jev input hash is unchanged by timetable evidence; the cost budget and the affected-user counter are unchanged.

## Validation

186 regressions passed (15 new schedule regressions), including real source failure, missing route, missing final arrival, frequency services, cancellation, partial aggregation, next-day clocks, operator/mode separation, calendar exception, source expiry, corrupt archives and all 80 city/mode coverage entries. TypeScript, focused lint and production build passed. Live official-file parsing is separate evidence from production rollout; rollout status belongs in AI_HANDOFF and the PR.
