---
name: BYOK placement
description: Keep credential setup separate from the main comic-creation workspace.
---

The user said: “i want the byok flow out of the main build area”.

The user also asked to remove the top-right API settings button and show a user-centric error with an API settings button when someone tries to generate without a key.

The user asked to remove the bottom connected API settings button during the comic build process.

**Why:** The user asked to separate API-key setup from making comics.

**How to apply:** Keep key entry, replacement, removal, and billing explanations in API settings rather than an expanded card in the creation workspace. Do not put an API settings button in the masthead. Missing-key recovery should offer a contextual launcher after a generation attempt.

Keep the connected footer launcher on the setup screen only, not during generation or subsequent build stages.
