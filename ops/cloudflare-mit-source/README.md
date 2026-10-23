# Italy-near MIT transport

MIT currently accepts the tested Italian connections while several foreign
cloud networks cannot complete TCP. This owned Cloudflare Worker uses the
`aws:eu-south-1` Milan placement hint. Actual upcoming GET and all-state history
POST both returned 200 in approximately 0.3 seconds on October 23. Placement
alone is not a guarantee; production validates every acquired response.

Both `/source` and metadata-only `/probe` require a dedicated `MIT_RELAY_TOKEN`
(at least 32 characters). There are no database credentials, models, schedules
or business-data writes here. The token lives in Cloudflare secret storage and
Vercel production environment storage; never reuse a service-role or cron key.

Vercel tries MIT directly first, then uses this transport within the existing
three-attempt bound. It checks the approved URL/method, exact Rome-date search
filters, request nonce, fresh timestamp, SHA256, size limit and actual MIT table
before parsing or reconciliation. Redirects are rejected using `manual` plus
status checking because Workers does not support `redirect: error`.

Deploy from a committed checkout using Wrangler. Preserve the minimal OAuth
permissions and the existing placement hint. Do not upgrade the plan. This
workload is two source requests per daily sync plus bounded retries/diagnostics;
there are no paid model calls. Workers Free includes 100,000 requests/day,
subject to its runtime limits. If acquisition fails, synchronization fails
visibly; an old or malformed table must never retire current events.

References:
- https://developers.cloudflare.com/workers/configuration/placement/
- https://developers.cloudflare.com/workers/runtime-apis/fetch/
- https://developers.cloudflare.com/workers/platform/limits/
