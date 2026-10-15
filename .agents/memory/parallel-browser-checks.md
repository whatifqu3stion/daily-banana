---
name: Parallel browser checks
description: Avoid shared-output collisions when running separate Playwright suites concurrently.
---

Use separate output directories for concurrently running Playwright commands.

**Why:** Each runner clears its output directory. Concurrent suites using the same default directory can delete each other's active traces, causing file-not-found failures even when browser assertions pass.

**How to apply:** Pass distinct `--output=test-results/<suite>` paths when launching independent browser suites in parallel. Shared output is safe when suites run sequentially.
