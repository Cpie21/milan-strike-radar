# GEST public T1 and publisher T1.3 identity

## Verified problem and evidence

The October 10 GEST notice correctly names T1/T2. Exact GTFS matching resolved only T2, leaving routeValidation PARTIAL and an empty routeIds array for public T1. This was an identity/membership gap, not incorrect strike timing.

Reviewed on 2026-10-06:
- Operator strike notice: https://www.gestramvia.it/10-ottobre-sciopero-aziendale-di-24-ore-indetto-da-cobas/ — public T1/T2, guarantees 06:30–09:30 and 17:00–20:00.
- Municipal tram project: https://www.firenzetramvia.it/linee/t1 — T1 Leonardo is the continuous Villa Costanza–Careggi service (historic line 1 + 3.1).
- Current Regione Toscana GEST feed: https://dati.toscana.it/dataset/8bb8f8fe-fe7d-41d0-90dc-49f2456180d1/resource/1f62d551-65f4-49f8-9a99-e19b02077be3/download/gest.gtfs — T1.3/type 0/id 1606821564 and T2/type 0/id 1272089682, calendar August 10–December 30. Verified T1.3 trips in both directions between Villa Costanza and Careggi - Ospedale; short workings also terminate at Unita/De Andre. Small reviewed catalogue fixture includes source, hash, checkedAt and calendar; IDs are fetched dynamically, never hardcoded into logic.

## Bounded implementation

Shared canonicalLineAlias resolver requires GEST_FIRENZE, GTFS_GEST, exact registered source, BUS product category with GTFS tram type 0, exact short/long publisher name, one unambiguous target, and both publisher validity and reviewed August 10–December 30, 2026 interval. No other T1 variant, operator, feed, mode, coexisting T1 or expired interval is inferred. Changed route IDs are discovered from the current feed. A coexisting exact public T1 retains exact matching; the alias is disabled.

The same mapping supplies notice route validation, public potential-line membership and dated timetable line selection/exclusions. Raw routeMembership and timetable labels remain T1.3 for traceability. Public display and strike notice remain T1. Timetable availability/strike-day operation and source failures keep their existing separate semantics. Mapping expiry requires a new evidence review; no paid inference can extend it.

Additive JSON/API only: lineScope.routeAliases, lineImpact.declaredScope.value.routeAliases and potentialLines[].routeAliases carry official/catalog name, dynamic routeId, operator/feed, source/catalogSource, dates and verification date. ScheduleIndex gains optional feedId and route longName so matching cannot guess feed identity. Schedule parsed-cache version bumped for old results without these fields. No database schema migration, frontend work, Ask changes, new polling task/model or translation cost.

## Verification

280 integrated tests pass (including Claude current frontend/Ask suites), with 9 new source/date/operator/mode/ambiguity/exclusion/membership/timetable cases. Type checking, focused lint and build passed. Production runtime 985e773 is READY; normal sync, actual database scope=VERIFIED, selected T1/T2 APIs, 20-city checks and 88 line checks passed. Claude current production UI is retained (base 44fc534); /lab returns 200. Receipts: docs/verification/2026-10-gest-alias-*.json.
