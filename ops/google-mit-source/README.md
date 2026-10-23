# Google-hosted MIT connectivity probe

This is a manual read-only diagnostic, not a production fallback. `Code.gs`
requests only the two fixed public MIT pages. The history POST preserves every
status and the same preceding-seven/following-90 Rome dates as the production
parser. HTTPS certificates remain validated. Each request has a 15-second bound.
Only status, table markers, byte/row counts and sanitized errors are logged.

Create a standalone Apps Script project and paste `Code.gs`; use the included
manifest to keep the permission to external requests only. Run
`probeMitConnectivity` once. The account owner must handle the first-run Google
authorization. Do not grant Gmail/Drive access, add database credentials, publish
a web app, install a scheduled trigger or treat the diagnostic as a sync receipt.

Google documents consumer-account quotas of 20,000 URL Fetch calls/day and 90
minutes/day of trigger runtime, subject to change. Testing two requests needs no
paid plan. It still needs a successful real network test before integration:

- https://developers.google.com/apps-script/guides/services/quotas
- https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app

The October 23 attempt and its observed outcome belong in
`docs/2026-10-23-union-notice-followup.md`.
