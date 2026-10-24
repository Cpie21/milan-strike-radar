# Dated union proclamation follow-up

The November 20 CGIL notice still does not establish operational clock hours. The separate CUB/SGB railway action has explicit MIT hours: November 20 21:00 through November 21 20:00. They must not share hours just because they share a date.

## Public-source investigation

Checked on October 23, 2026:

- [CGIL's original proclamation](https://www.cgil.it/strumenti/scioperi-e-vertenze/cgil-proclamazione-sciopero-generale-per-il-giorno-20-novembre-2026-x0ylgq91) and its current strike index return HTTP 200 to Node. The text declares a workday, indispensable services under sector rules, and later sector-specific participation instructions. No numeric operational transport window or annex link was present. A search-tool 403 did not mean the production fetcher could not read it.
- [FP CGIL Brianza's republication](https://www.fpcgilbrianza.it/news_dettaglio.php?i_n=2455) independently contains the same operative qualification.
- [CGIL Modena](https://www.cgilmodena.it/20-novembre-2026-cgil-proclama-lo-sciopero-generale/) links back to the original proclamation. Its general 24-hour wording does not establish every transport sector's clock hours.
- FILT's current home and national-strikes page are publicly readable; no matching November 20 sector hours were extracted. Searches of ATM, Trenord, Trenitalia and ENAC did not locate dated CGIL operating instructions. These search negatives are not proof that no document can exist anywhere.
- Utilitalia circular 2806 references the formal proclamation, but its attachment redirects to a login page. It was not read or used as timing evidence. CGSSE search access can still time out; existing bounded regulator-detail acquisition remains in place.

## Backend change

`lib/unionStrikeSources.ts` registers verified CGIL/FILT and SGB indexes. `noticeRootsForRecord` selects them from the actual declaring union, so the normal daily sync and persistent follow-up diagnostics include them. This is a registry extension, not coverage of every Italian union. Future unions need verified entries rather than guessed URLs.

The existing allowlisted HTML/PDF fetcher follows current dated announcements and their proclamation/arrangement attachments, including links without a `.pdf` suffix. It retains addresses of discovered unresolved official notices and retries them after they leave the index. Previously, only adopted official evidence received this reread behavior. Deferred/failed links retain attempt ages for subsequent cycles; byte/page/time/document limits remain unchanged.

Only explicit, dated transport clauses can supply hours. Union publishing affiliation never bypasses declaring-union checks. Mode, date, local geography and operator fences remain required. Nationwide adoption requires an explicit broad sector clause and nationwide declaration; local operator clauses do not fill national umbrella hours. Contractor, security, infrastructure, cargo, assemblies, protected service windows, exclusions and unrelated years cannot donate ordinary railway interruption hours.

Priority: dated operator operating notice, regulator/MIT explicit hours, union sector detail, reported sources. Lower-priority timing disagreements remain in the conflict evidence. A valid sector clarification can promote only its matching pending mode; an undifferentiated workday remains pending.

No UI layout, database migration, AI model, translation, AI budget or scheduler change. Persisted evidence fields retain their shape. The sync response adds `verification.acquisition.unionDocuments`; discovery arrays can now contain union sources. Nominal schedule remains daily `0 5 * * *` UTC; runtime start may be later.

## Validation

- 359 tests passed, including nine new scenario suites for actual proclamation facts, later sector clarification, local/national and union separation, source priority, and unresolved-article/attachment follow-up across three successive cycles and bounded primary-outage diagnostics. Future hours in these tests are synthetic, not November 20 facts.
- TypeScript, focused ESLint and production build passed.
- A real, read-only CGIL discovery run fetched 59 documents in the bounded run, including the original proclamation and FILT indexes; all ten CGIL candidates retained empty windows and `UNCERTAIN`. This proves successful acquisition without usable clocks, not universal absence of published instructions.

## Recovery and health-cache correction

The first cloud verification runs (`2d8b6adc-c61f-4524-a5c6-beb703a33af0` and `089017f9-c9a9-408d-a96b-0922038e1056`) failed during primary MIT fetch before any data writes. Both only recorded `fetch failed`; primary errors now preserve the fixed endpoint and safe transport cause code after the same three bounded attempts.

An explicit local recovery ran the committed route 0888149 against real current MIT pages and the production database. Run `ee25bbd9-ab28-4375-8020-ea666b9506ba` succeeded, fetched71/upserted67, with no model calls. Only Next cache invalidation was unavailable outside the server. This was manual recovery, not proof of cloud scheduler recovery.

Inspection proved `.next/cache/fetch-cache` still contained the failed11:19 run after the13:24 recovery. `readCityStrikes` now establishes request-time rendering with `connection()` before the SDK can catch Next dynamic control flow, then uses `serverDatabase({fresh:true})` with `cache:no-store` for health GETs. Health cannot be frozen into a prerender/build response. Pages that read live health render at request time; the explicit ten-minute row cache remains. No layout or public record shape changes. This matches the existing intention that health is checked outside the row cache.

Final cloud deployment/synchronization receipts follow below.


## Primary cloud connection fallback

The next cloud run (`c2f82ea8-73f9-4a93-b7d9-14d465d09241`) isolated the failing endpoint: MIT `/mit2/public/scioperi/ricerca`, `UND_ERR_CONNECT_TIMEOUT` after three attempts. Local Node could read both MIT endpoints. `lib/mitTransport.ts` now uses one IPv4 native HTTPS connection on the second attempt after a connection error. It preserves the official host/path, full POST date/state filters, certificate verification and the original three-attempt/time bounds. HTTP refusals and TLS validation are not bypassed; no proxy, credential forwarding or alternate facts are used. Native bodies have a2MB bound.

The authenticated source-access diagnostic now includes fixed MIT upcoming/history IPv4 checks and validates that each response is an actual parseable table. It remains read-only and never calls a model or writes the database. Tests cover form preservation, correct TLS/family options, three-attempt exhaustion and invalid targets. Local real IPv4 requests read27 upcoming/44 historical announcements.


Frankfurt read-only diagnostics also timed out for both native IPv4 endpoints, so IPv4 alone is not recorded as a successful fix. Region-specific egress is being verified by configuring only the sync and authenticated diagnostic functions in Paris (`cdg1`); the application's default remains Frankfurt. This is one region per function, not paid multi-region replication. Final runtime checks below determine whether this route works.

Union articles with a dated headline now reject hours belonging to another date mentioned in the body; a retrospective reference cannot donate hours to a different strike.
