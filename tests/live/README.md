# Opt-in paid Google image smoke

The default build, server tests, and intercepted Playwright suites do **not**
discover this suite. Run it only when a creator explicitly approves paid usage.

## Cost and credential setup

A successful run makes **two paid Nano Banana 2.1 2K image requests**: one new
panel, then one refinement using that panel's PNG. Expect two image charges
(the app's current estimate is $0.0504 each, $0.1008 total), **plus input/text
costs**, including the PNG input for refinement. Check current Google pricing;
this is not a guaranteed total. Failed requests may also be billed.

1. For an agent-assisted run, first get explicit approval for the above costs.
   Read the environment-secrets skill and check integrations before requesting
   a credential; use `requestSecrets` for `GOOGLE_IMAGE_SMOKE_API_KEY`. If the
   secure form is unavailable, the creator can add it in Tools > Secrets.
   Use a dedicated funded Google test project/key with access to this model.
   Never paste it into chat, CLI arguments, fixtures, `.env` files, or screenshots.
2. Only after approving the costs, run:

   ```sh
   GOOGLE_IMAGE_SMOKE=two-paid-images npm run test:google-live
   ```

Without the exact enablement value or the secret, Playwright reports **SKIPPED**,
not a live pass. Merely adding a key does not enable paid calls. Do not add the
enablement flag to shared workspace settings or normal CI/build commands.
To list the test without executing it: `npm run test:google-live -- --list`.

## What it proves

The production backend handler constructs the actual Google SDK Interactions
requests. It must send `store:false`, inline JPEG, 2K, and 1:1 for Nano Banana
2.1. Google must complete both interactions with valid image bytes. The browser
uses the production panel service, decodes and normalizes the image to PNG,
then sends that exact PNG as the refinement input and decodes the refined PNG.
No Google response is mocked. The browser-to-local-backend adapter keeps the
test credential entirely in Node; the browser receives only a dummy connection
placeholder and redacted production responses.

The test allows at most two SDK image calls and disables SDK and Playwright
retries. Extra frontend missing-image retries are blocked before reaching
Google. It uses a fresh, memory-only session and revokes it during cleanup.
Tracing, screenshots, and video are off; only boolean checks enter reports.
Do not use debug logging, `--trace`, `--repeat-each`, retries, custom reporters,
network recording, inspectors, or manually capture this run. Configuration
overrides that enable recording/repetition and common debug variables fail
before connecting. Generated panels and credentials are never written to disk.

If the live check fails, it fails rather than falling back to another model or
claiming compatibility. The report intentionally omits raw upstream exceptions;
check Google project billing, model access, quota and API docs separately.
