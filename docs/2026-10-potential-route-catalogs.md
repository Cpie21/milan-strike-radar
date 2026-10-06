# Concrete potential lines without inventing disruptions

## Problem and result

The declared operator scope was useful but did not answer a traveller's question about line M1 or bus 90. New additive `lineImpact.potentialLines[]` joins a verified strike scope to a fresh official route directory. Each candidate has its displayed line name, optional itinerary names, publisher-local route IDs, operator, mode, scope reason, notice and directory sources, hash and check time. This is potential involvement, never confirmed cancellation.

The existing parser, guarantee rules, semantic QA and database reconciliation remain in place. No UI files, counter logic, SQL schema, translation provider or paid-call budget changes. Claude's v16 worktree was inspected read-only; it integrates PR #10 and has no changes to the core modules edited here. Its graffiti API and lab remain outside this release.

## Source and scope checks

1. Refresh MIT and dated official operator notices with the existing daily synchronization.
2. Preserve the official declared scope. Individually named lines stay individually named; `ALL_EXCEPT` retains exact exclusions including leading zeros. An unknown staff scope cannot become all operator lines just because a directory exists.
3. Load only the exact identified operator's official route directory, through an allowlisted bounded adapter. GTFS agencies/modes and HTML directory sections are validated. A city registry entry or employer office name is not route geography.
4. Intersect city, transport category, exact operator and explicitly mapped named networks. No Arriva-to-ATB substitution. In the grouped ATB/TEB registry, a TEB-only notice only receives T1, and an ATB-only notice cannot acquire TEB T1. EAV and Trenord regional publications use explicit route endpoint city names, conservatively omitting unknown intermediate coverage.
5. Expand only HIGH-confidence explicit `ALL_OPERATOR_LINES`, `ALL_EXCEPT` or verified named networks. An official specific-line notice remains useful without a matching directory, but has no invented route IDs. Regional general strikes, offices, security, customer operations and airport notices cannot inherit passenger line lists.
6. Keep catalogue ownership, dated planned service, and actual live observations separate.

`potentialLinesStatus=PARTIAL` for a catalogue expansion: current published lines do not prove an exhaustive event-day network. `RESOLVED` means individually named official notice lines, not normal operation or cancellation. `enumerationCoverage` identifies the distinction. Source failures/staleness replace previous membership during sync. Reads independently reject membership older than 48 hours. Re-fetching an archive whose published service expiry is over 30 days old cannot make it current; this is our conservative review policy, not an official legal validity rule.

## API and compatibility

- Existing `timing_evidence.fields.routeMembership` stores ownership evidence, independently of `serviceSchedule`.
- Existing `lineImpact` version 1 receives additive `potentialLines`, `potentialLinesStatus`, `enumerationCoverage`; previous fields remain available. Specific notice names are not fabricated into legacy `affected_lines` for catalogue-wide notices.
- `GET /api/line-impact?region=MILANO&date=2026-10-09&category=SUBWAY` can return M1–M5 as potential lines. `line=90` limits the candidate list and membership view to 90. Uncertain relevant events remain labelled unconfirmed, because missing evidence is not proof the requested line is unaffected.
- Every candidate includes `actualOperationConfirmed:false`. A `scheduledReference` is only a fresh, matching date/operator/mode/route's verified planned first departure, last departure and last arrival (including next-day offset). Never copy M2's 01:30 last arrival onto M1 or call a final arrival the last departure. Partial whole-network schedules can still donate a verified individual route, but frequency-based/incomplete route clocks cannot.
- Deduplication preserves each announcement's scope and chooses the freshest catalogue snapshot for identical declared scopes, rather than reintroducing old routes from older membership.

## Audit interpretation

The external review is right about exposing M1–M5, retaining potential vs actual status and adding official adapters. Its Milan bus timetable claim is incomplete: the GTFS global end date is October 19 but `surface_end_date` is October 2; metro validity does not validate October 9 bus trips. Fresh published membership can still supply route names (including 90/91), while dated BUS schedule status stays `OUT_OF_VALIDITY` and no numeric clock is manufactured.

ATM E015 and Trenord realtime catalogue pages describe APIs, but do not expose an authenticated public endpoint in the inspected pages. No live integration or registration is claimed. ACTV publishes vehicle/trip feeds, which cannot confirm a whole line's absence/normal operation. Rome's existing current-day service-alert endpoint remains the only live adapter. Airline/airport impact requires dated airport/airline/flight evidence; a ground transit directory cannot supply flight numbers.

## Verified static capability and remaining gaps

The executable `scripts/audit-route-catalogs.cjs` audits all configured official sources and all 20 cities × four product categories. Receipt: `docs/verification/2026-10-potential-route-catalogs-official.json`. Source registration and successful retrieval are separate from event-specific scope and dates.

There are 18 successfully retrieved sources in this audit: 11 GTFS publishers (Milan, Rome, GEST, AMTAB, AMT Genova, CTM Cagliari, AMTS Catania, GTT, EAV, ACTV surface, TPER Bologna) and seven official directories (ATB/TEB, AIR Campania, Trenord official Regione Lombardia publication, Trieste, Brescia buses, Palermo, Verona urban weekday/evening/holiday). These provide some static capabilities in 16 supported cities, not all operators or all modes there. TPER follows its current Bologna version and refuses Ferrara and mismatched downloads. ZIP64 member sizes fix EAV ingestion; a publisher ignoring Range is read as one bounded archive rather than mixed chunks; ACTV's published legal agency name is recognized.

Padova, Perugia, Pisa and Messina still have no verified route catalogue in this registry. Arriva Bergamo's named consortium-to-route mapping also remains unverified; the current timetable page includes Lecco and cannot be silently treated as all three Bergamo networks. Autolinee Toscane's regional GTFS needs city/area mapping before integration; do not assign the whole region to Firenze/Pisa. Old Palermo March–May GTFS and Messina's challenge page cannot pass as current data (Palermo now uses its actual official live route directory). National rail/airline lists and real-time data remain evidence-gated. These gaps are explicit backend capability results, not falsely labelled as successful coverage.

## Refresh and cost

No additional scheduler or model stage. Existing daily cron (`0 5 * * *` UTC) rebuilds strike scopes, then refreshes needed route directories with 24-hour cache. Membership runs after Jev, so directory contents do not enlarge its input or generate a new semantic review stage. Bound downloads, concurrent batches of three and a phase budget isolate publisher failures. The atomic USD 0.20/month existing AI cap, forbidden Gemini models, free translation requirement and all source provenance are unchanged. This does not promise hourly browser polling or new subscriber notifications.

## Verification

225 backend regressions pass, including ownership vs timetable expiry, stale/obsolete sources, agency/city/mode/network fences, TEB/ATB boundaries, source failure isolation, leading-zero exceptions, specific-line narrowing, per-line overnight references, ignored Range and bounded ZIP64 sizes, directory section isolation, TPER version matching and fresh deduplication. TypeScript, focused lint and production build pass. Production deployment/synchronization and read-only stored-data/API receipts are recorded in the subsequent release handoff; this source audit alone is not production verification.
