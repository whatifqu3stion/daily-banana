# The Daily Banana - AI Comic Generator

## Overview
An AI-powered web application that generates satirical, newspaper-style comic strips based on user-provided topics, stances, and news stories. Uses Google's Gemini AI for both scripting and generating panel illustrations.

## Tech Stack
- **Frontend:** React 19 + TypeScript
- **Build Tool:** Vite 6
- **Styling:** Tailwind CSS (via CDN in dev and prod)
- **AI:** Google Gemini (`gemini-2.5-flash` for text, `gemini-3.1-flash-image-preview` for images)
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
├── vite.config.ts           # Vite config (port 5000, host 0.0.0.0, API key defines)
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

## Environment Variables
- `GEMINI_API_KEY` (secret) — Google Gemini API key, required for all AI features.
  Exposed in Vite's `define` block as both `process.env.API_KEY` and `process.env.GEMINI_API_KEY`.

## Running the App
```bash
npm install
npm run dev   # Dev server on http://0.0.0.0:5000
npm run build # Production build → dist/
```

## Image Pricing
Hard-coded in `constants.ts` (`pricePerImage`). Estimates shown in the UI are based on Google's published rates as of May 2026 — verify at https://ai.google.dev/gemini-api/docs/pricing if needed.

## Deployment
- **Type:** Static site
- **Build:** `npm run build` → outputs to `dist/`
- Deployed via Replit static deployment

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
