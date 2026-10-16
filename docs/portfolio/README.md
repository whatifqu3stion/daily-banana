# Portfolio capture notes

## Desktop walkthrough

Captured from the Pages production build at source commit `9a0d4f1d24c1f5c6e0662c0c1594a8203954a75a`, during the 2026-10-16 documentation pass. The desktop viewport was 1280 × 960 at device scale 2. The browser's environment date appears in the masthead.

This is a constructed UI demonstration, not a record of one end-to-end live model run. It combines a scripted fictional story plan with crops of saved prototype artwork. Provider responses were intercepted in Playwright; the app performed its normal stage transitions and interactions. No real key or paid model call was used.

The artwork comes from `attached_assets/0_the_cost_of_doing_business_1792075563509.png`, retained unchanged. The source image is 2048 × 3048 pixels. Crop rectangles are given as left, top, right, bottom:

| Use | Source rectangle |
| --- | --- |
| Panel 1, executive signing | `1035, 326, 1859, 1150` |
| Panel 2, executive crumpling the notice | `70, 1434, 1006, 2368` |
| Panel 3, discarded fines | `1040, 1434, 1978, 2368` |
| Uploaded image reference | Panel 2 crop, resized to 420 × 420 |

These crops supply artwork to the demonstration; they are not new model outputs. The fictional topic does not establish the truth of figures visible in the saved artwork. Those figures and the original comic's factual claims were not independently verified.

| File | What is shown |
| --- | --- |
| `walkthrough-01-setup.jpg` | The fictional executive topic, before optional details are opened. |
| `detail-reference.jpg` | The real upload control after adding the saved executive image and a note about hair, suit, and palette. The reference was also present in the intercepted image request. |
| `walkthrough-02-story.jpg` | The scripted plan in the real story-selection page. |
| `detail-custom-angle.jpg` | The alternative premise tab with text entered. This alternate premise was not submitted; the walkthrough continues with the original plan. |
| `walkthrough-03-proof.jpg` | The first saved image in the real proof view. The refinement field is filled, but neither Refine nor Regenerate was executed for this capture. |
| `walkthrough-04-editor.jpg` | The three supplied images assembled by the app, with its editable overlay text and normal final actions. |
| `detail-panel-edit.jpg` | The second panel after the overlay text changes from “Routine expenses.” to “Already budgeted.” through the editor. Image controls are visible; the underlying artwork is unchanged. |
| `walkthrough-export.jpg` | The actual PNG export of that edited state, converted to JPEG for the README link. Editor controls are omitted by the app's export function. |

The flow exercised a metadata-only key check, one intercepted story response, and three intercepted image responses. It verified reference-image inclusion, stage transitions, text editing, and PNG export, with no page runtime errors. This verifies the capture interactions, not model fidelity, reference adherence, usability, or factual correctness.

The declared Google fonts were supplied locally to the capture browser because external font loading was unavailable there. Screenshots were converted to JPEG and resized for readable, smaller README assets. Interface elements were not removed, redrawn, or added in image editing.

## Earlier captures retained in this directory

- `01-setup.jpg`: earlier setup UI at 1280 × 960 with an office-automation topic.
- `02-setup-mobile.jpg`: that earlier setup at 390 × 844, used in the README's separate mobile-layout detail.
- `03-story-choice.jpg`: earlier story-selection UI with the deterministic office-automation story from `tests/pages/byok.spec.ts`.
- `example-comic.jpg`: a resized copy of the full saved prototype comic cited above.

The earlier UI captures also used intercepted responses. The repository's separate live tests remain opt-in. The original publishing-pass UI captures can be reproduced by building with `npm run build:pages`, setting `PORTFOLIO_SCREENSHOTS`, and running `npm run test:pages`; they do not reproduce the newer executive walkthrough.
