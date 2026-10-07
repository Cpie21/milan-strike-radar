# Production PostHog event contract

Project 136776 (EU Cloud, existing project token confirmed against production). Version `analytics_version=2`. This release restores the redesigned site's events without changing strike parsing, AI decisions/models/budget, database schema or visual design.

## Audit before repair (2026-10-07 08:18 UTC)

The old provider still initializes on the production domain and `$pageview` is ingested (latest 08:16 UTC). In the prior 14 days: 430 pageviews, 6 graffiti events (last Oct 4), 3 WeChat events (last Oct 6); guides last seen Sep 24. These counts are debugging observations, not a certified usage measure. Calendar and share absence in this window is not proof nobody used them.

Root now renders LabRoute. `components/lab/track.ts` was a development-only console stub, so the redesigned UI's explicit events never reached PostHog. Ask had no explicit analytics. Old components still containing SDK calls do not establish current UI coverage. The project is the same EU project, not a new analytics account.

## Shared rules

- Only `theitalystrike.com` / `www.theitalystrike.com` initialize browser analytics. Local/preview/promo builds don't send. Browser opt-out suppresses custom events and the optional server envelope.
- Browser events share SDK anonymous identity/session, `analytics_version`, `environment=production`, `device`, `surface=site`, `is_test`. API events share `request_id` and optional `$session_id`, `surface=ask_api`, and `$process_person_profile=false`.
- Browser QA can set sessionStorage `strike_analytics_test=1` **before reloading**. Filter `is_test != true` for real traffic. Older events have no version/test properties; don't require version on historical reports. Domain filtering remains useful for historical localhost traffic.
- No keystroke events. No raw queries, answers, prompts, itinerary dates, named lines, stage fact values, IPs, refinement tokens or private traces are explicitly sent. SDK URL query/fragment is removed except utm_source/medium/campaign; nested initial URLs are scrubbed too. Autocapture masks text/attributes; recording masks inputs/text, disables console and request/response bodies/headers. Ask form, question heading and answer pages additionally use `ph-no-capture`.
- Raw good/bad examples remain service-only in Supabase. New feedback `answer.analytics` stores `{requestId, version}` for linking a private evaluation to its PostHog flow; no identity or raw query is added to PostHog. Existing feedback rows remain readable. No SQL migration or feedback response change.
- Analytics delivery failures do not change answers/ratings. Server events flush via `after()` with bounded SDK requests. Ad blockers/offline clients, opt-out, or platform termination can still prevent delivery. Server completions, browser-received responses and answers displayed in an open sheet are separate facts.

## Legacy events restored

| Event | Trigger / counting unit |
|---|---|
| `graffiti_spray_triggered` | Existing affected-user interaction; repeatable, existing counter unchanged |
| `share_intent_clicked` | Strike-card share intent; repeatable |
| `donate_coffee_clicked` | Existing Revolut outbound click; amount is selected intent, not payment completion |
| `wechat_jump_success` | WeChat browser guide; once per device, same legacy storage key |
| `AppToDesktop_tutorial_success` | Home Screen guide stays open 3 seconds; once per device |
| `Widgets_tutorial_success` | Widget guide stays open 3 seconds; once per device |
| `CalendarSync_tutorial_success` | Calendar guide stays open 3 seconds; once per device |
| `calendar_sync_clicked` | Subscription intent; once per device, preserving old counting semantics |

“Tutorial success” retains legacy naming; it means guide dwell, **not** verified installation. Once markers are only written after the SDK accepts the capture, with storage blocked handled safely; this is not an ingestion acknowledgement.

## AI events

Each attempted ask has a random `request_id`; refinements carry `parent_request_id`. Cache hits have a new attempt id and optional `answer_origin_id`. History retains its original request id (legacy history may have null). No ID is a refinement/quota credential.

| Event | Producer | Meaning / relevant properties |
|---|---|---|
| `ai_surface_viewed` | Browser | Ask surface mounted for city; region |
| `ai_input_focused` | Browser | Focus entered input; region, module/bar layout |
| `ai_query_submitted` | Browser | Nonempty submit; typed/example/refinement, query_length, language, hint-presence flags, parent_request_id |
| `ai_query_blocked` | Browser | Device daily quota blocked request before API |
| `ai_cache_hit` | Browser | Session answer reused; answer_origin_id |
| `ai_query_started` | API | Validation, shared rate limit and session admission succeeded; region, is_refinement |
| `ai_query_rejected` | API | HTTP admission/validation failure; bounded error_code, http_status |
| `ai_stage_completed` | API | understand/retrieve/judge/evidence; duration_ms, rule/model/default fact counts, low-confidence count |
| `ai_query_completed` | API | Answer/clarification/out-of-scope produced and session finalized; result summary, elapsed_ms, client_disconnected |
| `ai_query_failed` | API | Pipeline/budget/session finalization failed; bounded error_code |
| `ai_client_disconnected` | API | Stream cancelled; server may still finish independently |
| `ai_response_received` | Browser | Final frame received or cache loaded, even if sheet was closed while waiting; network/cache, duration_ms, summary |
| `ai_result_viewed` | Browser | Result rendered with answer sheet open and loading complete; once per attempt. A background answer counts here only when reopened |
| `ai_clarification_shown` | Browser | Clarification rendered in an open sheet (including cache); missing date/mode |
| `ai_refinement_selected` | Browser | Current answer's date/range/mode control chosen |
| `ai_refinement_expired` | Browser | Held token rejected, retried as a new question; same attempt id |
| `ai_query_error` | Browser | HTTP/network/budget/stream error or no terminal frame |
| `ai_query_cancelled` | Browser | Unfinished request superseded/unmounted; not completed |
| `ai_answer_reopened` | Browser | Last answer reopened |
| `ai_answer_closed` | Browser | Answer sheet dismissed; was_busy (dismissal does not cancel computation) |
| `ai_history_viewed` | Browser | Swiped to an older answer |
| `ai_trace_toggled` | Browser | Decision process opened/closed; expanded |
| `ai_result_day_opened` | Browser | Open day from result/navigation; request_id |
| `ai_answer_share_clicked` | Browser | Share intent, not successful external delivery |
| `ai_feedback_selected` | Browser | Good/bad selected; bad alone is not submitted feedback |
| `ai_feedback_submitted` | Browser | Evaluation request sent; rating/reason |
| `ai_feedback_stored` | API | Supabase insert succeeded; rating/reason/http_status |
| `ai_feedback_store_failed` | API | Validation/rate/storage failure; error_code/status |
| `ai_feedback_saved` | Browser | Received successful feedback response |
| `ai_feedback_error` | Browser | Failed response/network, retry offered |

Result summary: result_kind, intent, date/city method, modes/methods, fallback, named_line_count, assumption_count; clarification missing field; result view/level, matches/excluded/unchecked, strike_day_count and period_item_count, checked_city_count, cost_usd and presence of sync timestamp. **Period results are counted through days/items**, not only `matches`. Cached cost is the original result's cost, never fresh spend; use API completion `cost_usd` for successful-call cost observations (failed calls can spend, shared ledger is financial truth).

## Other explicit interactions

`tool_sheet_opened` (tool/region), `strike_date_selected` (relative day offset/card count), `city_selected` (new/previous region), `language_changed`, `calendar_subscription_requested` (repeatable, selected modes; external subscription not verified), `widget_copy_clicked/succeeded/failed`, `strike_sources_toggled`, `official_source_clicked` (host only, no URL query; from existing bottom source area and schedule reference).

## Analysis conventions

- Client funnel: `ai_surface_viewed → ai_query_submitted → ai_result_viewed`. Separate cache/network and clarification/final result. Events count attempts, not necessarily distinct questions or people.
- Service health: admitted `ai_query_started → ai_query_completed / ai_query_failed`; rejected traffic is separate. Join on request_id for attempt diagnostics; don't count client-view and server-complete together as two answers.
- Clarification flow: missing field → refinement submit → final answer; parent_request_id links the attempts. Expired-refinement retry may produce rejection and start under one id.
- Quality: use **stored** good/bad ratings, not clicks; private Supabase evaluation remains the bad-case replay source. Do not automatically mark a bad case resolved from an analytics event.
- Installation, subscription and donation completion are outside this site's visibility; labels must describe intent/dwell only.

## Validation

322 regressions and TypeScript passed. Analytics tests cover malformed/PII identities, no-context/opt-out, period counts, nested URL redaction, legacy once/storage-blocked behavior, streaming completion, admission limits, session-finalization failure, disconnect, successful/failed feedback inserts, SDK outage isolation. Initial runtime 9bc7800 / deployment dpl_F5VcpVUeThzyZ1yvbweHmpPEDAhZ was READY. At 08:32 UTC, PostHog ingested both client and server query events under one synthetic UUID, all marked is_test=true, including four server stages, completion and browser result. The single synthetic query cost $0.000029022 under the existing budget. Version 2 separates response receipt from actual display after noticing that a user can close the sheet while waiting. Final release receipts follow below.

Implementation uses the already-installed SDKs and same project; no new LLM or hosting dependency. Reference: [PostHog Next.js server analytics](https://posthog.com/docs/libraries/next-js#server-side-analytics), [JavaScript configuration](https://posthog.com/docs/libraries/js/config).

## Production receipts (final schema v2)

- Preserved Claude03ddb0b UI and all previously integrated backend logic. Schema v2 runtime e75875c was READY at deployment dpl_8z8kgVQRv21VuUtStQL35sjoH8bC. Health endpoint stayed healthy=true / stale=false. Later runtime01bd3d4 only records server event timestamps at occurrence rather than delayed flush time.
- EU project136776 contains matched browser/API receipts: query submitted, started, four stages, completed, response received, result viewed. Initial synthetic id fa27c825-f47e-4e2d-8fea-a5e60d80c7ae; repeat cache id7c317514-ed89-463c-b117-b997a60a77d6 reused the answer and avoided a fresh model call.
- For synthetic v2 id e66bb556-f943-48ca-8fea-744bc145dd54: answer closed08:39:18.295UTC; response received08:39:22.925; **no result-viewed event while closed**. Reopened08:40:48.380, result-viewed08:40:48.382. This checks actual browser behavior and PostHog storage, not just HTTP acceptance.
- Widgets_tutorial_success ingested08:36:15.756UTC after actual guide dwell; tool_sheet_opened08:36:12.696. Legacy naming/once semantics restored.
- Bad selection ingested but no evaluation was submitted. A deliberately invalid feedback validation probe returned400 and generated ai_feedback_store_failed; no artificial good/bad evaluation row was inserted. Successful/failed insert branches remain covered by isolated API tests; no fake positive rating was added to production for the smoke test.
- All synthetic traffic is is_test=true. Browser delay shim was restored. Keep test exclusion in reports; receipts do not prove every future visitor will bypass blockers or stay online.

Final runtime 01bd3d4 deployed READY to www.theitalystrike.com: deployment dpl_7KNWecXL8L21dTDQHWB2tmzFfDb3. Version2 optional validation probe returned400/invalid_query, without entering the model pipeline. Server timestamps are stamped at occurrence and preserve lifecycle ordering despite batched post-response delivery.


## Detailed behavior and saved AI dashboard (October 7)

Dashboard: https://eu.posthog.com/project/136776/dashboard/1004559 · Project136776. The previous dashboard555663 is preserved. Reproducible query definitions and existing insight IDs live in `posthog-ai-dashboard.json`; reuse them when editing, do not create duplicates.

Eleven saved tiles cover daily usage, user adoption, exact request-ID delivery/action receipts, result type versus stored feedback, parent-ID clarification follow-ups, network P50/P95, errors/limits, cache, input editing, visible answer dwell and strike/tool interactions. Native trends/funnels are retained; only cross-event request/parent correlation uses SQL. All queries exclude QA and require analytics_version >=2. A session with any is_test=true event is excluded in full, including initial exposure events before the QA marker took effect; null-session events still use their explicit is_test flag. Project timezone remains UTC. Three correlation SQL tables use a fixed rolling30-day window; changing the dashboard date control does not change those SQL windows. These are exploratory project definitions: this connection has no accessible governed metric catalog; they are not certified business metrics.

| New event | Meaning / properties |
|---|---|
| `ai_input_attention` | Visible input; module/bar and region; milestone_seconds=1/5/15 |
| `ai_input_started` | First nonempty change in an editing episode; no text or per-keystroke event |
| `ai_input_cleared` | Episode text cleared to empty |
| `ai_input_abandoned` | Edited input lost focus without sending; query_length, editing_ms; a focus episode, **not** whole-visit abandonment |
| `ai_answer_attention` | Current open answer page visible and not busy; request_id, summary, milestones |
| `ai_assumption_edit_opened` | Opened mode correction; request_id and bounded field enum |
| `ai_answer_share_outcome` | Browser share/copy API completed/cancelled/failed; method, request_id; never raw share payload |
| `strike_card_attention` | Visible card; region, transport_type, status, timing_known, line_scope, has_guarantees, milestones |
| `strike_mode_jumped` | Selected mode jump from day summary |
| `strike_original_toggled` | Original announcement text opened/closed |
| `strike_share_outcome` | Same bounded share receipt as AI; region and mode |
| `tool_modes_changed` | Calendar/widget mode selection; tool, region, modes |
| `widget_preview_selected` | calm/strike/many preview selection |
| `widget_app_store_opened` | Scriptable link intent, not installation |
| `support_feedback_submitted/saved/failed` | Existing support form request/acknowledgement; length and name-presence only, no name/content |

Attention requires at least25% of the smaller of element/viewport height inside the viewport and a foreground document. Offscreen, background, covered site sheets and noncurrent history pages pause the clock. Exposure accumulates to1/5/15 seconds with at most3 events per mounted identity; re-entry does not duplicate a crossed threshold, while a new mount starts a new viewing episode. Old browsers without IntersectionObserver skip attention events. This measures an opportunity to read, not comprehension. Timer resolution is about1 second. No scroll/keystroke stream. Ask remains masked and ph-no-capture.

A closed answer received in the background is not a clarification impression; this release aligns clarification visibility with result visibility, including cached clarifications. Share success means browser API resolved, not delivery to a friend. Missing clipboard now records failed and does not falsely show “Copied”. Input send clears its draft before submit; pointer submit doesn't falsely count the blur as abandonment. Support network rejection now returns the form to a retryable error rather than leaving it sending.

The request receipt table separates caches from network requests; caches don't require server starts/completions. The table uses event presence on one request_id, not a chronological funnel or inferred failure rate. Missing telemetry is not failure. The standard user funnel is a separate30-minute person-level ordered flow; it cannot certify all events belong to the same question. Stored rating is the latest observed receipt per request in the window, not proof of factual correctness. Period results use days/items; cached old cost is never fresh spend. New behavior has no historical backfill. Baseline real data at creation:3 attempts/3 displayed,1 stored rating; two people in the user funnel. Far too little to assess quality.


### Detailed behavior production receipts

Application commit36e3171 is deployed to the production domain: READY deployment `dpl_3Bg2vaLMe3SMkfkYaBF72TqjqH8d`. The normal sync-status endpoint returned healthy=true/stale=false. All11 saved tiles ran successfully; then QA-session exclusion was added and the live user funnel/correlated tables rechecked, preserving3 real attempts/3 displays/1 stored rating (not a quality claim).

Synthetic browser clarification attempt `7984a9a1-f18a-4956-bde7-512e37893fce` → date refinement `c66f4c84-d3d9-4afb-b423-b804ff52ea3f`: production QA correlation returns1 visible date clarification,1 parent continued,1 child viewed. Both answers produced actual foreground1/5/15-second receipts in PostHog. Input started/unsent blur, failed share with no false “Copied”, widget mode selection and preview, and subway card1/5/15-second receipts were ingested. No fake feedback was submitted. Attention pause/bounded-repeat and share cancellation/failure branches have deterministic regression coverage.

Opening the test tab produced two unmarked initial input exposures before the marker/reload. All saved analyses now exclude a whole session once any event has is_test=true, so those exposures are also excluded without deleting captured data. Older null-session data remains subject to explicit test/version filters. Some individual events appeared later than others; SDK acceptance is not an ingestion receipt.

The clipboard override was restored, synthetic history IDs removed, the one device-question quota restored, and the original widget once marker restored; test tab closed. The standard Ask pipeline remained within its existing shared reservation budget; analytics introduced no model stage or recurring paid analysis. Handoff PR23 stacks on22/21.
