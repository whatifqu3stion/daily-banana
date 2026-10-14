---
name: News freshness semantics
description: Distinguish news retrieval freshness from independent publication-date verification.
---

Label news timestamps as retrieval times, not article publication times. Searching a recent time window and caching a recent response do not independently verify every publisher's publication date.

**Why:** Gemini's grounded search returns summarized stories and source metadata, not a verified publication-date feed. Calling retrieval timestamps publication dates would give creators false confidence in stale or updated reporting.

**How to apply:** Preserve explicit warnings when displaying saved results after a failed refresh. Do not claim independently verified article dates unless a future feature actually obtains and validates dates from the publisher.
