# USB postponement status repair — 2026-10-29

## Cause and source evidence

The scheduled production run on October 29 completed successfully (05:10:31–05:11:40 UTC, 68 primary rows fetched, 62 records upserted). It stored the national USB declaration's explicit MIT note:

> ORDINANZA MINISTERIALE N. 204 T DI DIFFERIMENTO DEI SETTORI DEI TRASPORTI INTERESSATI DALLA REGOLA DELLA FRANCHIGIA PER LA COMMEMORAZIONE DEI DEFUNTI

The old parser checked `revocat|differit|sospes`. `DIFFERIMENTO` contains `differim`, so it failed to override the broad general declaration's `In Programma` status. This was a status interpretation failure, not a source outage or a missed cron.

- MIT source: https://scioperi.mit.gov.it/mit2/public/scioperi
- Trenord updated October 28: https://www.trenord.it/news/trenord-informa/avvisi/sciopero/ — the 21:00 October 29–20:59 October 30 USB rail action is deferred to another date; prior variations are no longer valid.
- ATM: https://www.atm.it/it/ViaggiaConNoi/InfoTraffico/Pagine/Sciopero.aspx — October 30 USB public transport strike postponed by the October 27 ministerial order.
- Signed order, six scanned pages; operative pages 5–6 visually checked: https://svt.vi.it/sites/default/files/2026-10/MIT%20Ordinanza%20numero%20204%20.27-10-2026.pdf . SHA256 `7031bda2f3847a69f1f8b778fb8ad748348878a0a757fdb222ceed3c01c4aa38`.

The order applies to the USB national general declaration proclaimed October 6 and the protected transport sectors. It is not a universal cancellation of independent strikes on the same day. The separate Tuscany airport proclamation dated October 12 retains its own status. No replacement date has been established for the deferred national declaration.

## Change and compatibility

- Deterministic primary lifecycle parser recognizes verb and noun forms and applies note decisions by mode. Requests, negations and decisions explicitly about a different dated strike are ignored.
- Preserve source identity and original raw facts; use existing `CANCELLED` to retire original dates, clear their operational hours and retain the official statement as additive optional `fields.lifecycle` evidence. No schema/status/model/budget/schedule changes.
- Keep previously published city/subway projections as cancelled updates. Repeated synchronization cannot silently reactivate them. Source identity prevents unrelated proclamations from being changed.
- Preserve cancellation evidence through timing enrichment. Cards explain postponement/new-date availability. Calendar cancellation uses the same UID as the former active event; widgets exclude it from active impact.

## Validation before release

- Full regression suite: 383 passing, including the real MIT fixture, independent airport preservation, category limits, negations/requests, stable local projections, repeated sync reconstruction, card wording and calendar UID/cancellation.
- Typecheck, lint of changed TypeScript/TSX, production build and diff checks pass.
- Local assertions do not establish cloud cron behavior. Live deployment/synchronization verification will be recorded below after release.
