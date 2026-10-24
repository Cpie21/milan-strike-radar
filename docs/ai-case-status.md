# AI feedback case status

Use this registry when triaging Ask feedback. Keep original ratings in private `ask_feedback`; a historical bad rating must not be rewritten into good or deleted after a fix. This public repository stores anonymized issue descriptions, synthetic replay inputs and verification evidence only, not users' original questions, itineraries or full answer/trace payloads.

## Closure rules

- `OPEN`: observed failure is not fixed.
- `FIXED_PENDING_VERIFICATION`: a relevant code change exists, but the specific failure has not been verified against the deployed service.
- `RESOLVED_VERIFIED`: the observed failure passes a focused regression and an original-input replay against the deployed service. Record the fix commit, verification date, expected behavior and evidence. Closure applies to that observed failure, not every possible interpretation of the user's rating.
- `REOPENED`: new evidence reproduces the same failure. Preserve the earlier resolution record and add the new evidence.
- `GOOD_REPORTED`: a user rated the answer good; this alone does not prove all answer facts correct.

Future fixes should update this file and the corresponding regression in the same PR. Run already-resolved regressions locally; do not repeatedly spend model tokens re-triaging closed cases without new evidence. Dynamic strike results are not frozen: replay the user's date interpretation with its original Rome reference date, and verify factual answers against the source data appropriate to that time. Model failure/rate limits are different failures and must not be mistaken for recurrence of a date parser bug.

## Checked 2026-10-07 (Europe/Rome)

Private production `ask_feedback` contains three submissions: one bad and two good. They need not represent three distinct users; author identity is not stored. No additional AI-related issue was found in the checked general-feedback table. Only explicitly submitted evaluations are available: session quota hashes are not a searchable transcript of every query.

| Private feedback ID | Rating | Observed issue / description | Case status |
| --- | --- | --- | --- |
| 4 | bad / missing | An English question specifies an ordinal day and month, but the stored trace has no date, `scope=null`, and `kind=clarify`. | **RESOLVED_VERIFIED** for this date-recognition failure |
| 3 | good | A dated domestic-flight question received a day-specific trip result. | GOOD_REPORTED; rating retained |
| 5 | good | A question about the next strike received a period result. | GOOD_REPORTED; rating retained |

The two good submissions are feedback examples, not independently certified answers. Feedback 5's stored summary has no matches while its retrieval trace has five candidates: period answers store their result in `days`, which the existing feedback summary does not retain. That snapshot alone cannot establish which cards the user saw. This is an evaluation-evidence limitation, not a proven wrong answer. Recording fuller version/reference-date/hints/period evidence is deferred; no feedback schema or API is changed in this review.

## ASK-DATE-EN-ORDINAL-001 — resolved

- Private source: `ask_feedback.id=4`, submitted 2026-10-06 at 12:11:27 Europe/Rome. Original question and answer remain in Supabase.
- Observable failure: an explicit English ordinal/month date was not recognized and the service unnecessarily asked for clarification. The stored reason is `missing`; no further explanation was submitted, so closure is limited to this observable defect.
- Synthetic public regression: `Is there a strike the 7th of October?` and `I have a trip the 7th of October.`.
- Expected parse: a day scope of `2026-10-07`, with both original reference day `2026-10-06` and verification reference day `2026-10-07`.
- Existing fix: Claude commit `44fc534a6711aec4b1ee9b9b5587ffd30ccbd760`, October 6, adds named English/Italian months and ordinal date forms to `lib/ask/parseQuery.ts`.
- Permanent regression: `scripts/test-ask.cjs`, test `ASK-DATE-EN-ORDINAL-001: a specified ordinal month date never needs date clarification`.
- Original-input production replay: October 7, HTTP 200; `understand.date=2026-10-07` by rule, final `kind=result`, `view=trip`, `range.from=range.to=2026-10-07`. No date hints were supplied. Deployed service was READY `dpl_718rqgtXi1U9imD9dn5pqQBQ583N`. This replay submits no new evaluation row.
- Verification boundary: confirms correct date interpretation and no unnecessary date clarification. It does not certify actual flight operation or every future English sentence. Date parsing itself uses no model call; the single live end-to-end replay used the existing Jev stage (reported USD .000029316), with no new model or stage.

There are **zero unresolved observed failures among the currently submitted bad cases**, as of this check. This is not a claim that the whole Ask system has no defects.
