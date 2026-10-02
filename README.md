# The Daily Banana

An AI comic-making prototype that turns a topic or idea into a short illustrated strip.

The project explores how to give someone useful creative control around generated content. Instead of accepting a single finished result, the user chooses a story idea, reviews the plan, and can edit or regenerate individual panels.

## The workflow

1. Enter a topic, an angle, and a visual style; optionally add reference images.
2. Choose from generated story concepts.
3. Review the plan before generating the strip.
4. Refine images or panel text and download the finished comic as a PNG.

The interface includes loading, error, and panel-level regeneration states. Generated stories and images still need human review.

## Current status

**Creative prototype built from a Google AI Studio export.** This repository contains the React interface, generation workflow, and Gemini integration. It is not presented as a production service.

The current implementation calls Gemini from the browser. Vite substitutes `GEMINI_API_KEY` into the client bundle, so an environment file does **not** keep that key private in a deployed build. Use this version only for controlled local experimentation. A shared hosted demo needs server-side credential handling and request limits first.

Model names in the source reflect the original prototype; current access and image-generation behavior have not been verified in this documentation pass.

## Run locally

Requires Node.js and a Gemini API key:

```bash
npm install
```

Create a local `.env.local` file containing `GEMINI_API_KEY=your_key`, then run:

```bash
npm run dev
```

Generation sends the topic and any supplied reference images to the configured model provider. Use material you are comfortable submitting to that service.

To check the frontend build:

```bash
npm run build
```

## Read the implementation

| File | What it explains |
| --- | --- |
| [App.tsx](App.tsx) | The form, story selection, review, and strip stages |
| [useComicGeneration.ts](hooks/useComicGeneration.ts) | Generation state and user actions |
| [geminiService.ts](services/geminiService.ts) | Structured story plans and image requests |
| [ComicStrip.tsx](components/ComicStrip.tsx) | Panel editing, PNG export, and sharing |
| [types.ts](types.ts) | The story and panel data model |

**Stack:** React · TypeScript · Vite · Google GenAI SDK · html-to-image.

Before featuring a public demo: verify current model support, move credential handling to a server, and capture a complete example strip and walkthrough. Those are remaining tasks, not completed features.
