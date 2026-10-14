---
name: Sandboxed embed keyboard handling
description: Escape inside opaque iframe content does not reach a host modal's keyboard listener.
---

Do not rely on a parent document's Escape listener to handle keyboard events while an opaque embedded frame has focus, even when its containing modal is a native dialog.

**Why:** Browser verification showed that Escape from a focused Google suggestions link stayed inside the sandboxed frame instead of closing the containing news dialog.

**How to apply:** Keep the frame's opaque origin. If a keyboard bridge is necessary, restrict execution with a fresh CSP nonce, allow only the owned bridge rather than arbitrary provider scripts, and validate both the sending window and a per-frame token before acting on messages. Never enable same-origin access or unrestricted inline scripts merely to fix keyboard behavior.
