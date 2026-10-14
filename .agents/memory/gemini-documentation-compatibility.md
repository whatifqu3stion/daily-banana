---
name: Gemini documentation compatibility
description: Image-generation examples can differ from the installed SDK's schema.
---

Check both Google's current documentation and the installed SDK's types when migrating image requests; do not bypass a discrepancy with an unchecked cast.

**Why:** During the Interactions migration, Google's JavaScript guide showed PNG output while the installed SDK's image response-format schema only accepted JPEG. Copying the example directly would not type-check.

**How to apply:** Recheck this discrepancy when updating the SDK. Use a supported output format and explicitly convert images where the comic pipeline requires another format, rather than assuming the returned bytes match the requested format.

## Verify failure contracts as well as request schemas

Google SDK compatibility checks must exercise the installed SDK's failure behavior, not just successful image payloads or hand-written error mocks.

**Why:** Text and image clients within the same SDK can use different error representations and retry options. Losing the provider explanation produced a generic image rejection and misleading advice to simplify the creator's topic.

**How to apply:** During SDK or transport changes, use intercepted, credential-free SDK requests to verify that provider diagnostics survive, credentials are redacted, and paid requests stay bounded. Keep explicitly authorized live tests separate.

## Interactions cancellation and deadlines

Bound the cancellation signal itself when making image Interactions requests; do not rely on a separate SDK timeout option when also supplying a signal.

**Why:** The installed Interactions bridge skips its timeout when an explicit signal is present. An intercepted SDK timeout test hung until an independently timed signal was supplied.

**How to apply:** Combine the browser-disconnect signal with a deadline signal, distinguish deadline expiration from user cancellation, and verify bounded failure and session-lock release through the installed SDK after upgrades.
