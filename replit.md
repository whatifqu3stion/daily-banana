# The Daily Banana - AI Comic Generator

## Overview
An AI-powered web application that generates satirical, newspaper-style comic strips based on user-provided topics, stances, and news stories. Uses Google's Gemini AI for both scripting and generating panel illustrations.

## Tech Stack
- **Frontend:** React 19 + TypeScript
- **Build Tool:** Vite 6
- **Styling:** Tailwind CSS (via CDN in dev and prod)
- **AI:** Google Gemini (`gemini-2.5-flash` for text, stable `gemini-nano-banana-2.1` for 2K images; stable `gemini-2.5-flash-image` as a legacy 1K alternative)
- **Image Export:** html-to-image (with Google Fonts embedded as Base64 for offline-safe PNG export)
- **News:** Google Search grounding via Gemini API (results cached in localStorage per calendar day)

## Project Structure
```
/
├── App.tsx                  # Root layout: masthead, footer, stage switcher
├── index.tsx                # React DOM entry point (StrictMode)
├── index.html               # HTML shell (Tailwind CDN, Google Fonts, favicon)
├── types.ts                 # All shared TypeScript interfaces and union types
├── constants.ts             # Stance, comedic style, illustration style, image model options
├── vite.config.ts           # Vite frontend middleware config; no credential defines
├── server/                 # Same-origin HTTP server, memory-only BYOK sessions, Google SDK
├── components/
│   ├── ComicForm.tsx        # Primary input form with sensitive-topic gate
│   ├── StorySwiper.tsx      # Brainstorm card-swipe UI (multi-plan selection)
│   ├── ReviewPlan.tsx       # Panel 0 review + refine before full generation
│   ├── ComicStrip.tsx       # Fully-generated strip with export and share controls
│   ├── Panel.tsx            # Single panel: image, draggable bubbles, caption, controls
│   ├── Bubble.tsx           # Speech/thought bubble with integrated SVG tail dragging
│   ├── Draggable.tsx        # Pointer-event drag+resize wrapper (% positions, resize-safe)
│   ├── EditableText.tsx     # contentEditable <p> with onSave-on-blur
│   ├── TextScaler.tsx       # Binary-search auto-sizing font scaler (ResizeObserver)
│   ├── LoadingState.tsx     # Typewriter loading screen with per-panel progress bar
│   ├── ErrorState.tsx       # Error display with JSON API error parsing
│   ├── ConfirmationModal.tsx# Accessible modal (backdrop click + Escape to cancel)
│   ├── NewsSelector.tsx     # Headlines modal powered by newsService
│   ├── Tooltip.tsx          # CSS group-hover tooltip (top / top-left / top-right)
│   └── icons/               # Inline SVG icon components
├── hooks/
│   └── useComicGeneration.ts# State machine (form→swipe→review→strip), all generation logic
├── services/
│   ├── geminiService.ts     # All Gemini API calls: plan generation, image gen, refine, context
│   └── newsService.ts       # Headline fetching via Google Search grounding + localStorage cache
└── utils/
    ├── layoutAdapter.ts     # Maps comedic_role+size → named CSS-grid layout template
    ├── fontUtils.ts         # embedGoogleFonts() — Base64-embeds fonts for PNG export
    └── fileUtils.ts         # toBase64() — File → base64 for Gemini inlineData
```

## Personal API Keys (BYOK)
- Creators connect their own Gemini key in API settings, outside the comic workspace. The key is submitted once over HTTPS to the same-origin backend and kept only in that process's memory.
- All metadata validation, image Interactions, text, context and grounded news requests go through `/api/gemini/`. Never embed an owner key, store personal keys in a database/browser storage, return them to clients, or log requests/Google exceptions.
- Each tab has a random memory-only ID and its own opaque HttpOnly, Secure, SameSite=Strict cookie. Both are required to use its credential. Sessions expire after 30 minutes (not sliding), on removal, or server restart. Refresh uses a fresh tab ID and requires reconnecting; pagehide revocation is best effort, with hard expiry as the fallback.
- Successful replacement rotates the token and revokes the old key; failed validation leaves the old session intact. Both client and backend block key changes during active requests. Already-started requests may finish after expiry; new ones cannot start.
- SDK output getters are explicitly serialized; errors and responses are redacted. Backend parameters are allowlisted to prevent caller-supplied transport URLs, headers or stored-history continuations.
- Text/news cancellation aborts the browser fetch and propagates disconnects to Google's SDK. Bounded request timeouts are preserved, and server-side text retries are disabled so the news service's explicit retry policy remains authoritative.
- Connection validates model metadata without generating content; billing and image-model access are checked by Google when generating.
- Panel generation, regeneration, and refinement use `client.interactions.create` through the same BYOK connection. Text planning, context, and news retain `generateContent`.
- Image requests use `store: false`, inline delivery, and tagged references; refinements send the current panel explicitly rather than continuing stored server history.
- Generated JPEGs are normalized to PNG before entering the comic/export pipeline. Nano Banana 2.1 requests 2K; legacy 2.5 omits unsupported resolution settings.
- This is a backend application, not a static-only site. Google keys reach the app server; the privacy text must not claim requests go directly from the browser to Google.
- Image API models require paid access. Do not promise a fixed free-generation quota; Google AI Studio allowances are separate.
- Headlines are fetched only on explicit user action, not automatically at page load.
- News requires usable Google Search grounding sources; it filters malformed, blank, duplicate, and unsupported stories rather than displaying unsourced output as current news.
- News caches validated feeds for 30 minutes. Failed refreshes may show saved results up to 24 hours old with a visible warning and the original retrieval timestamp. Older/invalid caches are ignored.
- News has a 30-second overall deadline and at most one retry for transient network/service failures; quota, permission, and response-validation errors are not automatically retried. Closing stops waiting but does not undo Google usage charges.
- Source links are retained when a news story becomes comic background. Google Search Suggestions render in an opaque-origin sandboxed iframe, never directly in app HTML. A nonce-restricted Escape bridge is the only permitted script; provider scripts are blocked.

## Running the App
```bash
npm install
npm run dev   # Dev server on http://0.0.0.0:5000
npm run build # Production build → dist/
npm start     # Production backend + dist/ on port 5000 (or PORT)
npm run test:server # Isolated HTTP/session/security tests, no live keys
npx playwright test -c playwright.byok.config.ts # Same-origin BYOK browser tests
```

## Image Pricing
Hard-coded in `constants.ts` (`pricePerImage`). Image-output estimates checked October 7, 2026: $0.0504 per Nano Banana 2.1 2K image, $0.039 per legacy 2.5 image. They exclude text/input tokens, edits, retries and search. Verify at https://ai.google.dev/gemini-api/docs/pricing.

## Deployment
- **Required type:** Application with a Node backend, not static hosting
- **Build:** `npm run build` → outputs to `dist/`
- **Run:** `npm start`
- Existing production deployment settings are deliberately unchanged. Before publishing this version, explicitly switch from static hosting to a backend deployment.
- Credentials are deliberately process-local. Use a single running instance (for example a reserved VM) or guaranteed sticky routing; do not horizontally scale across workers or move keys into a database. Restarts require users to reconnect.
- Production and proxied HTTPS preview cookies are always Secure. `--local-test-http` is only for loopback browser tests and is ignored in production. Serve production over HTTPS; cookies will not authenticate plain-HTTP clients.
- No owner Google key or database is required. Session IDs are cryptographically random opaque tokens rather than signed client state; no session secret is needed for this design.

## Key Features
- Topic, stance, comedic style, and illustration style inputs
- Live news integration (Google Search grounding) to seed topic ideas
- Brainstorm mode: generate 3 story concepts and swipe to choose one
- Panel 0 review step: inspect and refine the first panel before committing to the full run
- AI-generated panel images with 3-attempt retry and safety-block detection
- Comedic-role-aware named layout templates (cinematic openers, wide punchlines, etc.)
- Per-panel regenerate, refine, and consistency-tag editing
- Draggable/resizable speech bubbles and captions with integrated SVG tail dragging
- PNG export with embedded Google Fonts (offline-safe)
- Twitter/X share intent

## Layout System (`utils/layoutAdapter.ts`)
Curated named templates chosen by reading `comedic_role` and `size` from the AI plan:

| Count | Template | Layout | Trigger |
|---|---|---|---|
| 1 | `single` | 6-col 16:9 | always |
| 2 | `split` | 3+3 sq | default |
| 2 | `feature-left` | 4+2 sq | panel 0 establish+large |
| 2 | `feature-right` | 2+4 sq | panel 1 punchline+large |
| 3 | `triplet` | 2+2+2 sq | default |
| 3 | `cinematic-open-3` | 6 (16:9) / 3+3 sq | panel 0 establish+large |
| 3 | `wide-punchline-3` | 3+3 sq / 6 (16:9) | panel 2 punchline+large |
| 4 | `quad-equal` | 3+3 / 3+3 sq | default |
| 4 | `cinematic-open-4` | 6 (16:9) / 2+2+2 sq | panel 0 establish+large only |
| 4 | `wide-punchline-4` | 2+2+2 sq / 6 (16:9) | panel 3 punchline+large only |
| 4 | `bookend-4` | 4+2 / 2+4 sq | panel 0 establish+large AND panel 3 punchline+large |

Only full-width (col-span-6) panels get 16:9 — avoids row-height mismatches within a row.

### `size` assignment rules (prompt-enforced)
- **punchline / button panels**: default to `"large"` — the layout engine widens or cinematic-crops these
- **establish panels**: `"large"` when a wide shot genuinely sets the scene
- **escalate panels**: `"medium"` unless a sight gag needs visual room
- Panel count: **2–4** (2 for sharp single-beat gags; 3 classic; 4 full arc)
