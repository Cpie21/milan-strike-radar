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
| `ai_clarification_shown` | Browser | Received clarification; missing date/mode |
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

Result summary: kind, intent, date/city method, modes/methods, fallback, named_line_count, assumption_count; clarification missing field; result view/level, matches/excluded/unchecked, strike_day_count and period_item_count, checked_city_count, cost_usd and presence of sync timestamp. **Period results are counted through days/items**, not only `matches`. Cached cost is the original result's cost, never fresh spend; use API completion `cost_usd` for successful-call cost observations (failed calls can spend, shared ledger is financial truth).

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
