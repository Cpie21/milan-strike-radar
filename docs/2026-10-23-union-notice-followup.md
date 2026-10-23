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

- All364 tests passed, including the relay-candidate security scenario. Coverage includes actual proclamation facts, later sector clarification, local/national and union separation, source priority, unresolved-article/attachment follow-up across three successive cycles, bounded primary-outage diagnostics and request-time health. Future hours in these tests are synthetic, not November 20 facts.
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


Frankfurt, Paris and Virginia read-only diagnostics all timed out for both native IPv4 endpoints. IPv4 and those region changes did not fix the outage. The temporary function-region overrides and GitHub diagnostic workflow have been removed; production is back on its existing Frankfurt configuration. There is no extra cron or paid multi-region replication.

Union articles with a dated headline now reject hours belonging to another date mentioned in the body; a retrospective reference cannot donate hours to a different strike.

## Network root-cause evidence

Switching providers was insufficient because it kept testing international egress. The authenticated `/api/admin/source-access?network=1` diagnostic now separates DNS, TCP, TLS and HTTP, with fixed HEAD-only targets, no caller URL, no response bodies/cookies, no database/model calls and 12-second bounds. Production runtime e5b07a3 is READY at `dpl_2C5EULSPVbYVqnkvjAonoCVquaPG`; default region remains fra1.

The actual local and production measurements, plus independent Globalping tests, are retained in [the sanitized network receipt](audits/2026-10-23-source-network.json):

| Sample | DNS | TCP / HTTP result |
| --- | --- | --- |
| Local Italy | 2.42.233.179 | TLS verified, HTTP 200 in 190 ms |
| Vercel Frankfurt | Same address | TCP never connects; HTTPS, TLS1.2-only and HTTP-port80 checks time out |
| Akamai Milan | Same address | HTTP 200 in 137 ms |
| Akamai Frankfurt, same ASN63949 | Same address | TCP connection timeout after 15 s |
| XeniaGroup Piacenza, datacenter | Same address | HTTP 200 in 246 ms |
| Germany non-datacenter-tagged probe | Same address | TCP connection timeout |
| US Buffalo | Same address | TCP connection timeout |

The same German/US probes completed TCP/TLS to CGIL (HTTP200/403), so general Internet access works. Vercel also completes CGIL TCP/TLS/HTTP200. The Ministry home page is a separate control: both local and Vercel reach TCP but reject its incomplete certificate chain; this is NOT the strike subdomain's TCP timeout and certificate validation stays enabled.

This strongly points to geographic ingress filtering or an international routing issue at/near the MIT service. It is not a parser problem, a wrong DNS address, a requirement for JavaScript, a missing session cookie, or a blanket ban on every cloud provider. Exact firewall policy, location of packet drops and policy-change time cannot be established without owner-side network/firewall logs. Do not state that MIT officially announced geoblocking.

Additional observed failures: private Supabase/Deno15-second requests, GitHub Linux/native macOS/browser runners, Jina's no-cache public reader, and Google Apps Script all timed out. Google was authorized by the owner and its bounded run logged upcoming14,428ms/history14,525ms failures. None is wired as a successful fallback. `ops/google-mit-source` retains only the reproducible diagnostic; there is no Google schedule or database credential.

Past errors must remain separate: production logs contain successful daily runs from October9 through October23 morning; the latter is `7d80409d-ff1f-4dbc-880e-c4056bdc9421` at05:10UTC, fetched65/upserted56. Current connection failures do not explain every historic omission. The original November20 CGIL omission was transport applicability/parser coverage while source synchronization was working.

## Current data recovery and remaining work

Latest real manual recovery `69170711-de9b-45c5-ade5-a30ef641ad44` fetched71/upserted67 with zero model calls; it is explicitly a workstation recovery, not a healthy cloud-scheduler receipt. It leaves48 active future business rows. The independent live MIT-to-DB and DB-to-MIT audit found29 official announcement identities,23 modeled passenger announcements,3 explicit passenger exclusions,3 outside-product declarations, and zero unexplained gaps/field mismatches/orphans. All20 city APIs, calendars and pages returned200. Health remains PARTIAL:19 unresolved timings and34 warnings, not100% verified operational detail.

`ops/cloudflare-mit-source` is now deployed in the owner's authorized account,
using the Milan placement hint. Real upcoming/history requests both returned
200 in 327/322ms at18:22UTC. The first deployment exposed a Workers API
compatibility issue (`redirect: error` is unsupported); `manual` plus HTTP-status
rejection fixes this while still refusing redirects. Both endpoints now require
a dedicated secret; no DB or cron credential is forwarded.

The optional Vercel fallback retains direct-first acquisition and at most three
attempts. It verifies the fixed source/method, exact all-state form and Rome
dates, request nonce, timestamp freshness, SHA256 and real table before adopting
HTML. Acquisition receipts are included in the protected sync response/log.
`/api/admin/source-access?relay=1` is a read-only protected Vercel-to-Worker check.
No schema, frontend, model, translation, budget ceiling or daily schedule change.

All366 tests, TypeScript and focused ESLint pass. End-to-end Vercel sync and
production database validation are pending the deployment of this integration;
a successful Worker probe alone is not that proof.
