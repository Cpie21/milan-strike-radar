# Recovering blocked supplementary sources

This release is based on the audited production backend and Claude's released UI. It changes source acquisition only: no schema, model, billing or frontend changes.

## Verified recoveries

CGSSE's apex server omits its Actalis OV G3 intermediate. Node's standard verified TLS failed; www also does not match the certificate. Obtain the public intermediate from an authorized TLS connection to the CA's `onlinevalidation.actalis.it`, verify its signature against Node's existing Actalis root, and pin its SHA256 fingerprint (931AAA1EC9B2BA0FA59A82302F4F830628C86D9B2D2A50A4D1B2CE895C4CC648). Scope the extra issuer to HTTPS requests for the registered CGSSE hosts and canonicalize to `cgsse.it`. Keep hostname, certificate expiry and root-chain verification ON. Local live detail fetch passed with valid TLS. No `rejectUnauthorized:false`, global TLS overrides or insecure HTTP document fetching. Intermediate expires September 22, 2030; a server certificate/issuer change can still require maintenance.

Toscana Aeroporti's news URL now serves a 562-byte SPA shell. Its own publicly served application uses `/console/graphql` for article lists/details. The dedicated adapter reads only that same-origin public endpoint, follows actual pagination (backend currently returns six entries per page regardless of requested size), checks complete/unique article identity, preserves original publication timestamps and public article links, and feeds existing conservative parsing. Redirects, unknown schema, size/time overruns, mismatched article identity and incomplete pages fail explicitly. Old 2025 strike posts cannot be adopted as 2026 announcements. The current list has 32 posts but does NOT include a newly verified notice for the October 16, 2026 strike; readability is not evidence that unpublished details now exist.

## Remaining access boundaries

Trenord, Brescia Mobilità, Venice Airport and easyJet returned actual HTTP 403 on the tested public paths. Local CTM pages returned 200 on recheck (both with and without a specific Accept header), while prior production attempts returned 403. The presence of a normal recaptcha script is NOT proof that the page is blocked; no CAPTCHA-detection relaxation was needed. CTM's accessible RSS feed is last built in 2023 and is deliberately not adopted as a fresh fallback. Toscana's corporate pages/older PDF contents must not be confused with future airport strike notices.

Public official APIs, public PDF notices and date-matched regulator/operator sources are the preferred fallback. This release does not add paid browser/proxy infrastructure, try to solve CAPTCHA, spoof search crawlers, disable TLS or claim all these hosts are solved. Local success must be verified from the deployed runtime separately.

## Validation

294 integrated tests, TypeScript, focused lint and production build passed. Five new tests verify CA signature/fingerprint, URL scope, backend pagination, official detail provenance, historical-date isolation, and schema/identity failure behavior. Local live receipts are in docs/verification; production receipts are added after deployment.
