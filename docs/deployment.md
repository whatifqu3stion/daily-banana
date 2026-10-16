# Deployment

## GitHub Pages: browser BYOK

`npm run build:pages` selects Vite's `pages` mode. `.env.pages` contains only `VITE_GEMINI_TRANSPORT=browser`, a public build option. Vite's base path is `/daily-banana/`; mascot and bundled assets resolve under that path.

The Pages workflow builds `dist/`, runs server tests and production-build browser tests with intercepted Google responses, uploads only `dist/`, and deploys through GitHub Actions. Repository Settings → Pages must use **GitHub Actions** as the build source. No Google key belongs in repository secrets, build variables, committed files, or the generated bundle.

Visitors supply their own key in API settings. The browser makes a model-metadata request to check it without generating content. This check does not establish paid image-model access. The key and SDK instance are held in module memory, cleared on refresh/page hide/removal, and expire after 30 minutes. The key is never deliberately persisted to cookies, localStorage, sessionStorage, or the app server. As with any browser-held credential, scripts running on the page and browser extensions may access it during use. Use a dedicated Gemini key with appropriate restrictions and review Google project billing and quotas.

Text, image, refinement, and grounded-news requests go directly to Google. News uses the shared request and citation parser; its existing client cache is scoped to the connection. The build never uses the Node API routes. Google/provider availability and browser permissions remain external dependencies. No live paid generation was performed for the publishing pass.

For local preview:

```bash
npm ci
npm run build:pages
npx vite preview --mode pages
```

Then visit the displayed host with `/daily-banana/` appended. Preview needs `--mode pages` to serve the same base path as the build.

## Same-origin Node hosting

The default build keeps the server-backed credential flow:

```bash
npm ci
npm run build
npm start
```

Use a Node-capable host and HTTPS. `PORT` is respected. The server holds temporary visitor-key sessions in memory; sessions disappear on process restart. A visitor's browser talks only to same-origin `/api/gemini/` routes. The server intentionally rejects cross-origin access and uses strict session cookies. It is not configured as a separate cross-origin API for a Pages frontend.

`npm run dev -- --local-test-http` allows plain HTTP loopback development. Production keeps Secure cookies enabled.

## Validation

```bash
npm run test:server
npx playwright install chromium
npx playwright test
npm run build:pages
npm run test:pages
npx tsc --noEmit
```

The Pages suite exercises the real SDK against intercepted Google responses, including text/image generation, session-memory behavior, failed key replacement, removal, expiry, and grounded news with cached reuse. `CHROMIUM_EXECUTABLE_PATH` can select an existing Chromium binary. Live paid checks use the separate opt-in flow documented in `tests/live/README.md`.
