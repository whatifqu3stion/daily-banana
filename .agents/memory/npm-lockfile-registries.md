---
name: Npm lockfile registries
description: Prevent Replit's internal package firewall registry from being committed into portable npm lockfiles.
---

Committed npm lockfiles must use portable public registry endpoints and retain artifact integrity metadata; environment-specific package firewall URLs must not be committed.

**Why:** The environment's npm configuration may use an internal package firewall registry. Its URLs work in the current workspace but are not resolvable in a normal clone or CI environment, while incomplete lock data weakens reproducibility.

**How to apply:** Treat lockfiles regenerated under an internal registry configuration as needing portability validation before commit, including the full cross-platform optional dependency set and package artifact verification data.