---
name: React preview refresh
description: Distinguish stale hot-reload hook-order errors from fresh-load failures.
---

After changing the hook count inside a custom hook, check a freshly loaded page
before treating a hook-order error in the existing preview as a production defect.

**Why:** The mounted development preview retained an old hook layout during
edits, while fresh Chromium pages and the restarted application loaded correctly.

**How to apply:** Complete the coherent edit, restart the workflow once, and
verify a fresh page. Do not change hook behavior just to satisfy stale hot-reload
state; investigate further if a fresh load also fails.
