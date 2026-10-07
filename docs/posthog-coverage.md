# Product analytics coverage — October 7, 2026

Scope: the current production Lab city pages, four passenger transport modes and 20 supported cities, their six tool sheets, and the public Ask/feedback flow. This is an explicit instrumentation audit of today's product, not a claim that blockers/offline browsers deliver every event or that future UI controls instrument themselves. `analytics_version=3`; older eight legacy events and their storage keys retain their original meanings. The old pre-redesign dashboard remains intact.

## Collection and interpretation

- Browser context: public city tag, chosen language, device, browser/standalone, anonymous `page_view_id`. Ask attempts additionally have `request_id`; continuation/retry has `parent_request_id`, cache has `answer_origin_id`. Public card IDs join viewing, details, sources, shares and reactions within an anonymous session; no private trip dates or raw query text are sent.
- A `*_viewed` section impression requires one foreground second with meaningful viewport exposure. Attention events additionally emit 5/15 seconds, pause behind tool/AI/WeChat sheets, on inactive history pages and background tabs. Reopening a remounted section starts another viewing episode. An opportunity to read is not proof of comprehension.
- Clicks and result receipts are separate. External donation, webcal subscription, installation, social follows and native share delivery cannot be verified here. Copy succeeds only after clipboard success; native share completion means the browser API resolved.
- AI raw questions, answers, named lines, fact values, feedback text, nicknames, URLs with private query strings, refine tokens and IPs are excluded. The existing SDK additionally masks text/attributes/inputs and recording network bodies/headers. No keystroke/mouse-movement event stream. City search sends only settled length/count/empty status after600ms.
- Real writes are never performed just to fill a chart. Reactions retain their original optimistic counter/storage logic; new receipts distinguish actual server acceptance/rejection. Support prevents duplicate in-flight submissions and records anonymous `submission_id` for correlating outcome, including rejection and network exception.
- QA has `is_test=true`; dashboards also exclude the entire session containing a marked QA event, including events sent before marking. Preview/local/opted-out clients send no explicit telemetry. Missing optional analytics context never blocks Ask.

## Coverage matrix

| Current flow/control/state | Intent / change | Display / result | Boundary |
|---|---|---|---|
| City page arrival, shared-day link, language/device | `product_page_viewed`, `language_changed` | Page context; `day_summary_viewed` | SDK `$pageview` alone is not content exposure |
| Foreground return after10min | `product_refresh_requested` | Subsequent current page/day content | Request is not proof a refresh succeeded |
| Date rail scrolling, date tap | `date_rail_browsed`, `strike_date_selected` with source=rail | Day summary counts/state | Month transitions bounded; no scroll-pixel stream |
| Month sheet, visible months, selected date | `ui_sheet_opened`, `calendar_month_viewed`, source=month selection | `ui_sheet_viewed`, new day summary | Disabled out-of-range dates are not clicks |
| Next-strike shortcut, AI calendar navigation | source=next_strike/ai selection; `ai_result_day_opened` | New page/day receipt | Navigation intent does not guarantee arrival |
| Switch-city sheet, current-city tap | `city_selection_clicked`, `city_selected` | New `product_page_viewed` region | Same-city close distinguished; no fake navigation success |
| City search start/clear/settle/no results | `city_search_started/cleared/completed` | `city_search_empty_viewed` | Length/count only, never search text |
| Clear day / all cancelled / active strikes | — | `day_summary_viewed` state + counts | No-data errors are not counted as clear days |
| Active/uncertain/cancelled card | `strike_mode_jumped` | `strike_card_attention` with public card_id, mode/status/scope/timing/guarantees | Foreground1/5/15sec |
| Guarantees / workforce / subtype / geographic scope / lines | — | `strike_detail_viewed` section and evidence classification | Named services vs potential operator services remain distinct |
| Source accordion | `strike_sources_toggled` | `strike_sources_viewed` with official/reported counts | Closed/covered sources are not viewed |
| MIT register / operator announcement / schedule / ENAC / press outbound links | `source_link_clicked` with host, authority/type/card | Browser outbound intent | Legacy `official_source_clicked` preserved; its name historically includes reports. Use neutral new event for authority analysis |
| Original/translated source toggle | `strike_original_toggled` | Existing source exposure | Translation service unchanged/free |
| Card sharing | `share_intent_clicked` | `strike_share_outcome` completed/cancelled/failed | Share API/clipboard result, not external delivery |
| “I am affected” | `affected_reaction_submitted` | `affected_reaction_outcome` saved/rejected/network_failed; legacy `graffiti_spray_triggered` | Counter, offsets, persistence and per-device dedup unchanged |
| Calendar guide / transport choices / zero selected | `tool_modes_changed`, `calendar_subscription_blocked` | `ui_sheet_viewed`; legacy3sec guide marker | No modes means no request |
| Calendar external subscription | `calendar_subscription_requested`; legacy `calendar_sync_clicked` | External intent only | Browser cannot confirm subscriber's calendar state or future client refreshes |
| Widget preview states / transport choices | `widget_preview_selected`, `tool_modes_changed` | Sheet/step exposure | Preview uses examples, not actual strike evidence |
| Widget code copy / store link | `widget_copy_clicked`, `widget_app_store_opened` | `widget_copy_succeeded/failed` | Clipboard success is not widget installation |
| Widget steps1–5; Home steps1–4 | — | `tool_step_viewed` per tool/step | Each step must be in viewport, not just its sheet open |
| Home-screen non-Safari guidance / copy link | `home_link_copy_clicked` | `home_browser_notice_viewed`, `home_link_copy_succeeded/failed` | Unsupported clipboard no longer falsely shows copied; installation unverified |
| Tutorial image error | — | `tool_image_failed` asset basename only | No raw error message |
| Tool/AI/city/month/support sheets, close button/swipe/dismiss/navigation, expand | `ui_sheet_opened/closed/expanded` enum sheet and close reason | `ui_sheet_viewed` | Open vs actually viewed separate; close de-duplicated |
| Support draft, clear, leave unsent, validation | `support_feedback_started/cleared/left_unsent/blocked` | — | Unsent means leaving the support sheet, not leaving the whole visit |
| Support send/retry | `support_feedback_submitted` UUID | `support_feedback_saved/failed` same UUID | Same in-flight write cannot be double-clicked; content/name absent |
| Donation cup selection / payment link | `donation_amount_selected`, legacy `donate_coffee_clicked` | Intent amount EUR | No fake revenue/payment completion |
| Footer/support social link | `social_link_clicked` destination/placement | Outbound intent only | Follow not verified |
| WeChat browser notice / dismiss | legacy `wechat_jump_success`, `wechat_notice_dismissed` | Page overlay blocks underlying attention | Legacy “success” means browser detection, not leaving WeChat |
| AI module/docked input mount vs real exposure | legacy `ai_surface_viewed`, `ai_input_focused` | `ai_input_attention`1/5/15 | Mounted input is not the funnel exposure denominator |
| AI edit / clear / unsent blur / input limit | `ai_input_started/cleared/abandoned/limit_reached` | `ai_quota_notice_viewed` when disabled by device quota | Blur is an unsent editing episode, not session abandonment |
| AI typed/example/clarification/refinement send | `ai_query_submitted`, `ai_example_selected`, `ai_refinement_selected`, `ai_modes_changed` | `ai_query_started` admission | Structured source/length/hints, no input values |
| AI client quota / server validation/daily/rate/budget/failure | `ai_query_blocked/rejected/error/failed` | `ai_error_viewed` if actually displayed | Browser/server errors join by request_id rather than counted twice |
| AI successful stream / first bytes / four stages | `ai_stream_started`, `ai_stage_completed` | `ai_query_completed`, `ai_response_received` | Completion, receipt, display and first byte have different clocks |
| AI cancelled stream / server continuing after client disconnect | `ai_query_cancelled`, `ai_client_disconnected` | Completion property client_disconnected | Closed sheet doesn't automatically cancel compute |
| AI cache answer | `ai_cache_hit` + originID | `ai_response_received`, `ai_result_viewed` | Cached historical cost is not fresh spend |
| AI result/clarify/navigate/out-of-scope | — | `ai_result_viewed`, `ai_clarification_shown`, `ai_verdict_viewed` | Result enum, view, counts/methods/fallback retained; no private data |
| AI assumptions / corrections | `ai_assumption_edit_opened`, modes/refinement events | `ai_assumptions_viewed` | Missing corrections are not inferred from lower confidence |
| AI incomplete check / checked scope | — | `ai_incomplete_notice_viewed`, `ai_checked_scope_viewed` | Warnings are not silent “all clear” |
| AI clarification expired / retry following failure | `ai_refinement_expired`, `ai_retry_submitted` parent ID | Child result/receipt/display | Retry means next attempt after failure, not necessarily identical text |
| AI earlier history / last answer reopen / close while loading | `ai_history_viewed`, `ai_answer_reopened/closed` | Current-page-only attention | Close identifies the shown history request; old null IDs are not fabricated |
| AI decision trace expand/collapse | `ai_trace_toggled` | `ai_trace_viewed` stage_count | UI opening and exposure separate |
| AI answer share | `ai_answer_share_clicked` | `ai_answer_share_outcome` | Same browser boundary as card shares |
| AI good/bad choice / bad reason / submission/retry | `ai_feedback_selected`, `ai_feedback_reason_selected/submitted` | `ai_feedback_prompt_viewed`, `ai_feedback_saved/error`, server `ai_feedback_stored/store_failed` | Bad click alone is not stored; ratings are not factual accuracy certification |

## Analyses and responsible denominators

Two current dashboards: existing AI use/health board1004559 is extended; a separate whole-product board contains city/date discovery, trust, tools and return behavior. The historical555663 board is untouched. Exact saved queries/IDs are versioned in the manifests.

- Native funnels are ordered person-level flows within30min; they can span different questions/cards. Same-question analysis uses exact UUID joins with browser/API/cache/refinement events. Same-card analysis requires matching public card_id AND anonymous session_id; it never joins one user's source click to another user's view.
- Attempt failures/rejections/limits are deduplicated on request_id, with mutually exclusive outcome precedence. Server failure and browser error do not produce two failed attempts. Missing final telemetry is “unresolved”, not automatically failure. Feedback stored uses the server receipt and latest rating per request.
- First-byte and full-network-answer P50/P95 are separate; cached responses excluded. Stage latency uses server stage durations; stage counts and rule/model/default/low-confidence facts are diagnostics, not factual accuracy. AI billed ledger remains the financial source; completion cost excludes failed/unobserved spending and cached old cost.
- Trends / breakdowns / retention / paths use native PostHog query nodes. Daily first-time cohorts need time to mature; new events have no pre-release history. Sparse/empty tiles are instrumentation availability, not a product failure verdict.
- SQL join tables explicitly say rolling30days and do not silently follow the global dashboard date selector. Native queries do. All charts exclude QA and version1; new whole-product entry denominators start with version3. UTC is the existing project timezone.
- This connection's metric-list API is scope-gated, but the complete accessible information-schema catalog was read and returned0definitions. These are documented project-specific exploratory definitions, not approved company KPIs. No paid monitoring agents, models, new plans or schedules are added.

## Delivery checks

Code tests, actual deployed interactions and PostHog ingestion receipts are recorded in `posthog-events.md`. New UI state/outcome tests use isolated mocks; no false good/bad/support/reaction rows are written to production. Analytics collection can be blocked; anonymous users are not guaranteed one-to-one people across devices. No guarantee of 100% event delivery is made.
