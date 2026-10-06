# Source acquisition and per-record follow-up audit

This corrects the earlier conclusion that Trenord, Brescia, Venice and easyJet were persistently inaccessible. On October 6, changing only the truthful request identity from `ItalyStrike/1.0 (+https://www.theitalystrike.com)` to `ItalyStrike/1.0` returned real public HTML for Trenord/Brescia/easyJet. Venice's old `/it_it/news.html` then exposed a separate 404: its current index is `/it_it/news`. easyJet's former Italian help URL is obsolete (500); the current English help-centre page contains its actual public Sitecore information cards. No browser identity spoofing, CAPTCHA solving, TLS bypass, paid proxy, new model or hidden API key.

## Acquisition changes

- Central truthful User-Agent for normal notices, verified CGSSE TLS, Toscana's public API and the protected diagnostic. Current Brescia news and Trenord news indexes replace/extend narrow entries.
- easyJet: read only the actual public `__JSS_STATE__` page identity and `PaginatedCardList.Cards` Title/Description/Date. Isolate each card, preserve publication date; ignore analytics labels and airport/menu datasets. Reject unknown/duplicate schemas. English event dates and explicit clock ranges are understood; protection bands cannot become disruption times. Accessible cards are not proof a particular strike has a published notice.
- Foggia/ATAF, Udine/Arriva and Start Romagna receive real official news roots despite having no supported UI city projection. Matching requires exact operator/publisher, event date, union or explicit operator-day scope, and official geography. Multi-basin events cannot borrow one basin's hours as a whole-event answer.
- ATAC still redirects to a real human-verification service. Roma Servizi per la Mobilità's accessible current infomobility/comunication indexes provide another official channel. Municipal office/taxi announcements cannot masquerade as ATAC: actual ATAC mention remains required. No CAPTCHA bypass.

## Every run checks again

The configured production cron is DAILY (`0 5 * * *` UTC), not hourly. Each successful primary snapshot reconciles identities, changes and cancellations. Notice discovery does not depend on the MIT content changing or on Jev being called. Upcoming records outside the 90-day supplement horizon remain in the primary snapshot and enter notice discovery when their date approaches. Cancelled upcoming records still receive primary status reconciliation.

Previously matched official article addresses are read from the existing database and fetched again after leaving the news index. Only addresses are reused; old facts are never silently copied. Discovery has separate bounded index/detail/archive/attachment/regulator time and request quotas. Persisted first-discovery and last-attempt timestamps prioritize deferred old candidates over newcomers. A daily rotating tie-breaker removes fixed ordering. Deferred/failed candidates are eligible on the next run; a malformed publisher payload affects that publisher, not the entire primary write.

Additive JSON in `timing_evidence.fields.followUp` records DAILY primary/notice plans and supplement eligibility date, including PRIMARY_ONLY, WAITING_FOR_HORIZON, PRIMARY_STATUS_ONLY and HISTORICAL. `noticeDiscovery.sources` adds firstDiscoveredAt/lastAttemptedAt. A plan is NOT a claim of successful verification. Existing MATCHED/FAILED/DEFERRED receipts remain distinct. No schema migration and no frontend changes.

Other refresh paths remain: route catalogs and timetable caches rotate daily; guarantee documents rotate weekly and require re-verification before extending their 30-day evidence validity; GEST aliases renew only against current official identity and timetable terminal evidence. Rome live feeds remain request-driven, not a promise of nationwide real-time operation. Publisher schema/rule changes can require maintenance; failed or expired evidence becomes unknown. Websites do not guarantee future publication or access.

## Verification scope

Local live acquisition, real easyJet cards and an independent reviewed MIT truth matrix cover all 34 currently active future records /30 official announcements in both directions. Five operational timings remain unresolved: Start Romagna October 9, Toscana TPL October 14 (two projections), December 4 national BUS and AIRPORT. Unknown is retained, not converted to guessed hours or all lines. Confirmed line candidates remain potential impact, not proof the service actually stops. Existing source discrepancies stay traceable.

309 regression tests, TypeScript and focused lint pass before frontend integration. Deployment, production acquisition, primary snapshot, per-record follow-up receipts, public APIs and shared budget are verified below after release. This is an exhaustive current core-fact audit, not a claim of mathematical 100% accuracy of every external fact or all future announcements.

## Final live result

Runtime **6527caa**, deployment **dpl_4LZrBk5HwTpNWE6Q6rpUy6aDu8s9**, is READY on www.theitalystrike.com in Frankfurt. Claude's e461797 (including d1480f9 UI/widget work and PR #17 merge) is retained. PR #18 carries the bounded runtime compatibility check and final receipts. No uncommitted UI is deployed. 311 tests pass, typecheck/focused lint and actual production build pass; diagnostic anonymous access returns401.

Final authorized normal sync **bc73223d-3eb5-4529-8edd-f7031000b16a**: success,75 primary rows/59 upserts,110 supplement documents attempted,7 CGSSE and1 Toscana acquisitions. Final full reviewed official audit:30 announcements,34 active records,34 reverse traces,5 future unknown timings. All34 have fresh DAILY primary follow-up plans.25 have registered operator/authority notice follow-up;9 are PRIMARY_ONLY (security/support, cargo and general rail/aviation without an identified operator), still refreshed via MIT and regulator discovery rather than an invented operator identity. Current high-confidence line/guarantee/catalog facts have provenance; candidate lines never claim actual operation confirmed.

All65 public city pages/strike APIs/calendars, GEST T1/T2 requests, root and lab pass after final sync. Daily scheduled runtime evidence for October4/5/6 is retained in the fact receipt; this release's manual sync does not pretend tomorrow's cron has already executed. Health reports PARTIAL rather than mislabelling unknowns and source discrepancies as fully verified.

Production acquisition is restored for **Trenord and easyJet** as well as the earlier CGSSE/Toscana/CTM recovery. **Brescia and Venice still return403** in both tested European cloud regions, including one bounded request with the actual Node runtime default identity. Local readability alone is not a fix for cloud production. The Paris candidate was not promoted to the public custom domain; production remains Frankfurt. ATAC continues to challenge its direct site, with accessible official municipal news as a supplement. No paid proxy or CAPTCHA bypass is added. These failures remain explicit and retryable; cached historical news cannot replace current evidence. Public interfaces or an operator-approved allowlist remain possible additional access channels, but neither is claimed verified here.

The final repeated sync made **zero new semantic calls** (28 cache hits). October's existing shared ledger is **.028443 USD**, disabled=false; the existing .20 cap remains. No new paid stage or model was introduced. Raw identity/source/date/cancellation correctness is exhaustively checked for the current product set, but missing detail is still missing: this is not a claim of100% verification of unknown passenger impact or all future external data.

Receipts: `docs/verification/2026-10-06-source-followup-{facts,records,http,sync,sources,region-comparison,request-comparison,deployment}.json`.
