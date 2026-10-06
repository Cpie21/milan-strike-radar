# Production data and automatic refresh audit — 6 October 2026

The independently extracted MIT upcoming table contained 29 announcements at audit time. Every supported announcement was reviewed against its raw dates, unions, workforce, sector, administrative geography, timing and exclusions. All 33 active future DB records (21 announcement identities) trace back to that external table. No new explicit strike-fact error was found. Four record projections have unresolved operational timing; two have known official cities outside the supported registry. Seven announcements concern unsupported freight/maritime/highway modes; another explicitly excludes all supported transport modes. This is not a claim of 100% worldwide transport coverage.

`verification/2026-10-06-full-data-audit-before.json` contains the complete external-to-DB and DB-to-external matrix, not a random sample. `scripts/audit-official-snapshot.cjs` deliberately uses a separately reviewed truth matrix instead of the runtime parser. It requires updating its reviewed facts before use on a later date.

## Changes made following the refresh audit

- Daily/weekly cache bucket arguments force the first read in a new interval to await fresh GTFS/network/schedule/profile data. Next cache revalidation alone can return a previous result while refreshing in the background.
- GEST alias renewal verifies the current municipal T1 description AND both directions' terminal identities in the same GTFS archive. It follows publisher dates/route IDs without a fixed year ceiling. Changed endpoints, missing evidence, duplicate targets or expired evidence do not renew the alias. Raw GTFS membership remains available separately.
- Guarantee sources discover current PDF editions from ATM, ATAC and Arriva Bergamo official indexes. Exact operator/document identity is required; parking and Lecco guides are excluded. Rules must still match before renewing their 30-day review window. A changed/unverifiable rule becomes unknown. ATM now uses its 2026 charter; Arriva's index points to its April 2026 charter, not the older pinned September URL.
- ATAC currently redirects automated clients to an unrelated anti-bot host. This is rejected. Its last manually checked notice remains usable only within the existing bounded review window; it cannot be perpetually renewed by repeatedly fetching an old announcement. The new 2026 charter does not visibly state the expected strike bands in the text inspected. We do not fabricate current proof.
- Malformed official rows reject the snapshot before reconciliation. A legitimate empty strike table still succeeds; an error page or unrelated table cannot silently retire current records.
- Optional enrichment is bounded/deferred to leave time to write the authoritative snapshot and close the sync log. Missing enrichment is recorded explicitly. This improves robustness, not a guarantee that the platform can never terminate execution.
- Translation is restricted to the exact free DeepL endpoint, with redirects disabled and a per-run translation deadline. Original wording survives outages/configuration mistakes. No Gemini or new model stage was added.
- `/api/sync-status` adds `data_quality` (`UNAVAILABLE`, `PARTIAL`, `NO_RECORDED_ISSUES`) and per-run `warning_count`. Success does not mean every secondary source succeeded. Raw warning contents are not exposed publicly. `NO_RECORDED_ISSUES` is not a guarantee of completeness.

## Refresh coverage and boundaries

| Data | Automatic trigger | Failure behavior |
| --- | --- | --- |
| MIT upcoming + status search, changes/cancellations | Existing daily `0 5 * * *` UTC job | Three bounded source retries; reject incomplete snapshot, preserve previous DB, fail log/health |
| Operator strike detail discovery | Same daily job; no source result cache | Record discovery failures, retain evidence-based unknowns; optional stages may defer to next sync |
| Route catalogs, route ownership, dated schedules | Same job when needed; daily cache key rotation | No expired/current-date-independent timetable claim; partial/unavailable evidence remains explicit |
| Fixed operator guarantee documents | Same job, weekly cache key rotation | Discover registered current editions; verify known rule; stop applying after expiry/change |
| GEST canonical line alias | Current catalog/schedule load, normally daily | Official public description + same-archive endpoints required for renewal |
| Semantic QA | Changed content hash / existing cache and bounded monthly budget | No unmetered calls; uncertainty does not override explicit official facts |
| Rome real-time service alerts | Current-day `/api/line-impact` requests; 60-second result cache | Check feed/alert age on every response; stale/absent alerts never imply normal operation |
| City/API responses | Sync invalidates strike tags/paths; existing 10-minute cache | New requests receive refreshed data; an already mounted browser tab is not itself a backend poll |

Database logs confirm successful scheduled executions at approximately 05:10 UTC on October 4, 5 and 6. The configured time is 05:00 UTC with the hosting plan's execution window; this is approximately 07:00 in summer / 06:00 in winter in Rome. This is DAILY, not hourly. There is no platform automatic retry of a failed cron invocation; the next daily sync retries sources. Health detects a missing success after 26 hours and a stuck running lease after six minutes. No external push alert recipient or independent uptime service is configured.

No claim is made that every city/operator supplies GTFS, real-time alerts, per-line cancellations, or a current official strike notice. Railway security/infrastructure/support, cargo and unsupported geography remain distinct. Planned final service times are not confirmed last operating trips during a strike. External 403s, timeouts, changed page formats and genuinely unpublished information remain operational boundaries.

## Validation

289 integrated tests passed, including nine new refresh/renewal/failure/free-translation tests. TypeScript, focused lint and production build passed. Fresh official GEST archive + municipal description returned VERIFIED; live ATM/GTT/Trenitalia/Arriva/Air Campania documents matched their registered rules. ATAC failure is recorded, not claimed as verified. Post-release production receipts are stored alongside this report.
