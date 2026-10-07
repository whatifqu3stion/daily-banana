---
name: CSS pipeline restarts
description: Verify development CSS compilation after CSS toolchain merges.
---

After a merge introduces a CSS compilation pipeline, restart the running development workflow before judging the visual result.

**Why:** A running Vite server retained its previously empty PostCSS configuration after a merge; it served raw Tailwind directives and made the app appear unstyled despite a valid production build.

**How to apply:** Confirm the served stylesheet contains compiled utilities, not raw directives, and inspect the running page after the restart.
