# Italy-near MIT transport candidate

The same-provider October 23 comparison can reach MIT from Milan but not
Frankfurt; failure occurs before the TCP connection finishes. This candidate
uses Cloudflare's explicit `aws:eu-south-1` (Milan) placement hint rather than
another arbitrary international region. Placement chooses a nearby Cloudflare
data center, not an AWS instance, and must be verified in a real deployment.

This directory is NOT currently an active production fallback. `/probe` makes
two fixed public requests and returns connectivity/table/hash metadata only.
`/source` remains 503 until a dedicated `MIT_RELAY_TOKEN` (at least 32 characters)
is configured. Never use the database service-role key or CRON_SECRET here.

The transport reuses `handleMitSource`: exact MIT endpoints, unchanged all-state
history POST, Rome date range, TLS verification, 15-second request/2 MB body
bounds, original HTML/SHA256/fetch receipt, no arbitrary URL, database or model.
No scheduler or business-data writes belong in this worker. The existing
Vercel pipeline should stay responsible for parsing, reconciliation and writes.

Before integration:

1. Deploy as an owned Workers Free resource (or explicitly authorized temporary
   account); account/terms/OAuth steps belong to the account owner.
2. Verify both `/probe` results and compare original HTML against the same-date
   direct official responses. Placement configuration alone proves nothing.
3. Configure a dedicated relay token using secret storage, never source files.
4. Add bounded Vercel acquisition only after real cloud GET and history POST
   work. Validate provenance, dates/form, hash and freshness; never promote old
   cached tables or fabricate cancellation history.
5. Run the existing normal cloud synchronization, then check database and APIs.
   A diagnostic success alone is not a production synchronization receipt.

No paid account upgrade is authorized. Workers Free currently includes 100,000
requests/day; this two-source daily workload is small, but actual CPU/runtime
and account quotas must still be checked. A temporary account expires unless
the intended user claims it in time; do not wire an unclaimed account into a
permanent production dependency.

Official references:

- https://developers.cloudflare.com/workers/configuration/placement/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/platform/claim-deployments/
