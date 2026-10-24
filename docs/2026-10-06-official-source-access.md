# Recovering blocked supplementary sources

This release is based on the audited production backend and Claude's released UI. It changes source acquisition only: no schema, model, billing or frontend changes.

## Verified local adapters

CGSSE's apex server omits its Actalis OV G3 intermediate. Node's standard verified TLS failed; www also does not match the certificate. Obtain the public intermediate from an authorized TLS connection to the CA's `onlinevalidation.actalis.it`, verify its signature against Node's existing Actalis root, and pin its SHA256 fingerprint (931AAA1EC9B2BA0FA59A82302F4F830628C86D9B2D2A50A4D1B2CE895C4CC648). Scope the extra issuer to HTTPS requests for the registered CGSSE hosts and canonicalize to `cgsse.it`. Keep hostname, certificate expiry and root-chain verification ON. Local live detail fetch passed with valid TLS. No `rejectUnauthorized:false`, global TLS overrides or insecure HTTP document fetching. Intermediate expires September 22, 2030; a server certificate/issuer change can still require maintenance.

Toscana Aeroporti's news URL now serves a 562-byte SPA shell. Its own publicly served application uses `/console/graphql` for article lists/details. The dedicated adapter reads only that same-origin public endpoint, follows actual pagination (backend currently returns six entries per page regardless of requested size), checks complete/unique article identity, preserves original publication timestamps and public article links, and feeds existing conservative parsing. Redirects, unknown schema, size/time overruns, mismatched article identity and incomplete pages fail explicitly. Old 2025 strike posts cannot be adopted as 2026 announcements. The current list has 32 posts but does NOT include a newly verified notice for the October 16, 2026 strike; readability is not evidence that unpublished details now exist.

## Remaining access boundaries

Trenord, Brescia Mobilità, Venice Airport and easyJet returned actual HTTP 403 on the tested public paths. Local CTM pages returned 200 on recheck (both with and without a specific Accept header), while prior production attempts returned 403. The presence of a normal recaptcha script is NOT proof that the page is blocked; no CAPTCHA-detection relaxation was needed. CTM's accessible RSS feed is last built in 2023 and is deliberately not adopted as a fresh fallback. Toscana's corporate pages/older PDF contents must not be confused with future airport strike notices.

Public official APIs, public PDF notices and date-matched regulator/operator sources are the preferred fallback. This release does not add paid browser/proxy infrastructure, try to solve CAPTCHA, spoof search crawlers, disable TLS or claim all these hosts are solved. Local success must be verified from the deployed runtime separately.

## Validation

298 integrated tests after preserving Claude's released page-refresh integration, TypeScript, focused lint and production build passed. Five new tests verify CA signature/fingerprint, URL scope, backend pagination, official detail provenance, historical-date isolation, and schema/identity failure behavior. Local live receipts are in docs/verification; production receipts are added after deployment.

## Runtime access comparison

US production runtime 14693cc completed sync bcd48274-91b1-44a6-a733-e7fa7fc2517f at 13:17 UTC, but acquired ZERO CGSSE and Toscana API documents. Local acquisition success was therefore insufficient. A read-only, CRON_SECRET-protected `/api/admin/source-access` probes only seven fixed public URLs; it accepts no target URL, writes no database data and invokes no AI. It fails closed when credentials are missing and returns metadata rather than page bodies or arbitrary errors.

An authenticated preview in Frankfurt (`fra1`) at 13:24 UTC read CGSSE's detail (HTTP 200, 55,646 bytes), Toscana's complete public article index (6,366 normalized bytes) and CTM (HTTP 200, 72,824 bytes). The four other probes failed. These results justify using the supported `vercel.json` single-region configuration for server functions (`fra1`); static frontend hosting remains on the existing CDN, and the daily `0 5 * * *` schedule is preserved. No paid multi-region/proxy/browser service is added. Vercel supports configurable function regions: https://vercel.com/docs/functions/configuring-functions/region.

During the investigation MIT added Start Romagna's October 9 announcement. Normal sync picked it up; the official operational wording remains `24 ORE: VARIE MODALITA'`, so exact intervals remain unresolved. It concerns unsupported cities, not an unknown official location. Fresh independent MIT-to-DB and reverse checks passed for all 34 active records /30 announcements, including this addition. The reviewed audit matrix was extended with this new official case. All 65 public city/API/calendar/lab/root checks passed. October shared AI ledger is .027633 USD, with the existing .20 cap unchanged; the one new semantic call was the existing pipeline reviewing the newly published announcement.

Claude concurrently released `09bed52`, including open-page refresh and this source adapter change. It is merged into this branch before any further release; no pending Claude UI changes are overwritten. The initial route-level `preferredRegion` declaration did not affect this deployed Next.js build: runtime still reported `iad1`. It was removed and replaced by explicit `vercel.json` regions configuration. Production EU acquisition receipts follow below.

## Reconciliation regression found by full production checks

The first Frankfurt sync successfully acquired six CGSSE and three Toscana documents. It exposed an existing hierarchy flaw: CGSSE's AL-Cobas proclamation lists 08:45–15:00, while ATM's dated joint AL-Cobas/Confial service notice also includes after 18:00. Treating both publishers as equivalent forced the AL-Cobas BUS/SUBWAY rows to unresolved timing. The independent 34-record timing audit caught this; the release was not called complete at that point.

Timing reconciliation now prioritizes a matched dated registered operator notice over regulator proclamations for operational service availability. All existing exact date/operator/geography matching gates remain. Differences stay in conflicts/provenance; disagreements between two operator documents remain unresolved, and regulator-only evidence continues to work. A regression checks both input orders, retained official conflict/source, regulator fallback and same-tier operator disagreement. This follows the existing product's source hierarchy and does not claim a union's proclaimed strike hours are identical to the combined operator-day service impact.

## Final production receipt

Runtime 996d933 is READY at www.theitalystrike.com, deployment dpl_43KcVsEZcehQQjGT4cmVXcYdtVuk. Protected diagnostic positively reports fra1: CGSSE HTTP 200, complete Toscana API readable, CTM HTTP 200; Brescia/Trenord/Venice/easyJet remain actual HTTP 403. Anonymous access to the diagnostic returns 401.

Normal final sync c7c1c741-bbeb-4211-aaa3-e4920eff6e8a succeeded: 75 fetched/59 upserted, 6 CGSSE +3 Toscana acquisitions, 19 warnings (down from the original 27). Exact ATM operational windows are restored on both unions' BUS/SUBWAY records; CGSSE disagreements remain traceable. Fresh independent audit again passed 34/34 active records against 30 official announcements in both directions, with five unresolved future operational timings (including the new Start Romagna event). Reads are restored for three sources; four hosts are still blocked, and neither access success nor sync health means every passenger detail is known.

PR #16 now targets Claude's already released claude/redesign-lab branch (7f9f536), reducing the handoff diff to backend acquisition, hierarchy and runtime configuration plus docs/tests. Preserve free translation and existing shared Jev/Ask monthly cap; no new model or AI stage was introduced. All 298 regressions, typecheck, focused lint and production build passed. Full source/runtime/data receipts are in docs/verification/2026-10-06-source-access-*.json.

After the final sync, 65 public city/API/calendar/GEST/lab/root checks passed. The protected-only source probe and anonymous401 were also checked on the final runtime. Final October shared ledger .028115 USD, disabled=false, cap .20 remains. The only paid calls were existing semantic QA reacting to changed evidence; acquisition diagnostics themselves make none.
