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
- Local assertions do not establish cloud cron behavior.

## Live release verification

- Committed runtime `90cdd109f1a420d92f2f14935d08bc2d405039df`, deployment `dpl_E7xqSSVPHzcuMjYfSBT35W3ZDa1r`, promoted to `https://www.theitalystrike.com`. Inspecting that custom alias resolves to this ready deployment. PR: https://github.com/Cpie21/milan-strike-radar/pull/35 . The subsequent merge of the prior branch only retained its verification document.
- Two authenticated, manually triggered cloud synchronizations succeeded: `6c77d1eb-a1d1-4ccd-ae61-2ea75062fa08` (13:02:38–13:03:42 UTC), then `c83dc3b3-0b67-4131-9f22-9816a2322b44` (13:04:46–13:05:40 UTC). Each fetched 72 primary rows via the configured Italy relay and upserted 73 projections; primary coverage issues were empty. No new relay or secret configuration was needed.
- Six existing national/Naples transport rows retain their database IDs and become `CANCELLED / POSTPONED` with empty windows. After the second normal sync they remain cancelled; neither old timing evidence nor city discovery reactivates them. Tuscany's two independent airport rows keep their IDs and `CONFIRMED` status.
- All 20 cities: public page, strikes API, widget API and calendar return 200; matching national source events are postponed and empty of active hours; widget data is fresh. Florence/Pisa retain only their independent airport action on October 30. Milan/Naples calendars preserve every previously returned October 29/30 UID with a cancellation update.
- A real browser at 390×844 shows the October 30 bus/train/airport cards as `已延期` and `新日期待公布`. After repeat sync, Milan/Naples/Florence/Pisa widgets report the second run's last-success timestamp. Native device refresh timing was not tested.
- Evidence: `verification/2026-10-29-usb-postponement.json` and `verification/2026-10-29-postponement-mobile.png`. A pre-existing browser console issue (three absent wallpaper mask images) is outside this status repair.
- The morning scheduled run proves cron ran before the repair. The two repaired executions were manual cloud runs; future scheduled execution has not yet been observed.
