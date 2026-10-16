---
name: News freshness semantics
description: Distinguish news retrieval freshness from independent publication-date verification.
---

Label news timestamps as retrieval times, not article publication times. Searching a recent time window and caching a recent response do not independently verify every publisher's publication date.

**Why:** Gemini's grounded search returns summarized stories and source metadata, not a verified publication-date feed. Calling retrieval timestamps publication dates would give creators false confidence in stale or updated reporting.

**How to apply:** Preserve explicit warnings when displaying saved results after a failed refresh. Do not claim independently verified article dates unless a future feature actually obtains and validates dates from the publisher.

## News request budgets

Treat an uncertain news timeout as potentially billable; require an explicit user action before another lookup rather than treating a missing response as proof no work occurred.

**Why:** An intercepted timeout reproduced two provider-proxy calls in the former retry flow. The second attempt could start with little time left in the overall budget and incur additional usage without producing usable headlines.

**How to apply:** Keep SDK retries and orchestration retries coordinated, preserve manual refresh and labelled saved results, and measure real provider latency when calibrating deadlines. The user approved an initial 60-second Google / 75-second overall budget after the 20-second cutoff and a swallowed Pages timeout were reproduced offline. These limits remain unvalidated against live Google latency. Offline fixtures prove boundaries and call counts, not live Google performance. Both transports use the constants in `shared/news-request.mjs`; preserve the distinction between a caller cancellation and an internal SDK/deadline abort.
