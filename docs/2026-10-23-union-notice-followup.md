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

The existing allowlisted HTML/PDF fetcher follows current dated announcements and their proclamation/arrangement attachments, including links without a `.pdf` suffix. It retains addresses of discovered unresolved union notices and retries them after they leave the index. Previously, only adopted official evidence received this reread behavior. Deferred/failed links retain attempt ages for subsequent cycles; byte/page/time/document limits remain unchanged.

Only explicit, dated transport clauses can supply hours. Union publishing affiliation never bypasses declaring-union checks. Mode, date, local geography and operator fences remain required. Nationwide adoption requires an explicit broad sector clause and nationwide declaration; local operator clauses do not fill national umbrella hours. Contractor, security, infrastructure, cargo, assemblies, protected service windows, exclusions and unrelated years cannot donate ordinary railway interruption hours.

Priority: dated operator operating notice, regulator/MIT explicit hours, union sector detail, reported sources. Lower-priority timing disagreements remain in the conflict evidence. A valid sector clarification can promote only its matching pending mode; an undifferentiated workday remains pending.

No UI, database migration, AI model, translation, AI budget or scheduler change. Persisted evidence fields retain their shape. The sync response adds `verification.acquisition.unionDocuments`; discovery arrays can now contain union sources. Nominal schedule remains daily `0 5 * * *` UTC; runtime start may be later.

## Validation

- 355 tests passed, including five new scenario suites for actual proclamation facts, later sector clarification, local/national and union separation, source priority, and unresolved-article/attachment follow-up. Future hours in these tests are synthetic, not November 20 facts.
- TypeScript, focused ESLint and production build passed.
- A real, read-only CGIL discovery run fetched 59 documents in the bounded run, including the original proclamation and FILT indexes; all ten CGIL candidates retained empty windows and `UNCERTAIN`. This proves successful acquisition without usable clocks, not universal absence of published instructions.

Production receipts will be appended after the committed release and normal synchronization.
