---
name: Gemini documentation compatibility
description: Image-generation examples can differ from the installed SDK's schema.
---

Check both Google's current documentation and the installed SDK's types when migrating image requests; do not bypass a discrepancy with an unchecked cast.

**Why:** During the Interactions migration, Google's JavaScript guide showed PNG output while the installed SDK's image response-format schema only accepted JPEG. Copying the example directly would not type-check.

**How to apply:** Recheck this discrepancy when updating the SDK. Use a supported output format and explicitly convert images where the comic pipeline requires another format, rather than assuming the returned bytes match the requested format.
