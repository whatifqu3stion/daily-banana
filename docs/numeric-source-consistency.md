# Monetary source consistency

## Why one input did not guarantee one amount

The supplied background, generated planning fields, image prop instructions and optional
post-art archive note are separate representations. A model can paraphrase a number
incorrectly while producing a structurally valid plan, and later research can introduce
another figure. Before this safeguard, the planner's text was not deterministically
compared to a shared, source-linked monetary record. The original bad model response is
not available, so this describes the architectural failure path, not a claim about which
call introduced the historical discrepancy.

## Primary boundary: before images

1. The app extracts monetary evidence from both the supplied topic and background,
   retaining their distinct provenance even when both contain amounts. It retains the original excerpt, contextual subject/claim,
   source ID, normalized base-unit decimal value, currency and rounding policy.
   These are **supplied claims**, not independently verified reporting.
2. The existing single/brainstorm/custom planning request receives this ledger and
   instructions to check amounts in the same response. `numeric_uses` binds individual
   dialogue, caption, story, action, set, continuity and prop phrases to source IDs.
3. `inspectNumericFacts` runs deterministically on the result. A single unambiguous
   source amount can be bound by the app. Multiple claims always require explicit IDs;
   equal numbers alone do not establish equal subjects or claims. Repeated identical
   phrases within one field must be disambiguated before separate claims can be bound.
4. `assertDrawableStory` blocks the first image and later scheduling/finish boundaries.
   Each brainstorm alternative is checked separately. A blocked custom concept remains
   available in the same review UI rather than bypassing the checks.
5. Image prompts carry the same ledger and bindings. Existing overlay suppression,
   action ownership and visual-reference behavior remain unchanged.

`$1.21 billion`, `$1,210,000,000` and `one point two one billion dollars` normalize
to the same USD value. `twelve billion` does not. Different currencies are not converted.
The parser is deliberately conservative English monetary parsing, not general semantic
fact checking, financial arithmetic, a currency-conversion service or a full locale parser.
Non-monetary counts, dates and percentages are outside this pass.

## Explicit decisions, never automatic repair

- Default policy: exact source amount.
- Allowed approximation: nearest displayed precision, at most 1% relative difference,
  and only after an explicit creator approval. Thus $1.21bn → $1.2bn can be approved,
  but $1bn or $12bn cannot be passed as rounding.
- Approvals bind the specific phrase, field, source ID and decision type. A changed
  amount invalidates its approval. Model-provided approvals are never accepted.
- Distinct fictional amounts in a sourced story require explicit creator confirmation
  when the planner identifies them as fiction. Unsubstantiated topic-only monetary
  fiction is labelled as such, not reported as a verified fact.
- Source binding and text correction are deliberate UI actions. The app does not
  silently rewrite text, regenerate artwork or add paid critic/OCR/review calls.
- Approved approximation/fiction decisions remain visible in review and printed output.

## Editing, archive and export

The final strip retains the evidence, bindings and creator decisions. Numeric edits are
checked from current text, without changing text, bubble positions or artwork. New conflicts
stay visible adjacent to the comic and inside the PNG capture; the editable review controls
are not exported. Regeneration/refinement cannot ignore an existing numeric conflict.

The optional archive request receives the selected ledger and actual planned panel/prop
text, not only a summary. Its text is checked again before attachment. Conflicting
amounts are withheld, with later-research provenance and source links visible; no later
research silently replaces the supplied claim. Any unstructured note containing monetary
claims is conservatively withheld, including an equal amount attached to a different claim.
Number equality cannot prove subject/claim identity, even with only one supplied figure.
This pass does not add a claim-linked archive-approval workflow. Non-monetary notes can
still be shown. Archive failure preserves the finished comic. Manual numeric
conflicts hide an otherwise retained note until the text is corrected.

**Limit:** matching structured text cannot verify lettering painted into a generated
image, the truth of supplied background, or all semantic associations. The creator still
needs to inspect props and source claims. A PNG contains rendered disclosure/warnings,
not a machine-readable copy of the plan.

## Offline verification

`npx playwright test -c playwright.story.config.ts` includes normalization, source/claim
ambiguity, currency disagreement, explicit rounding/fiction, all configured style and
stance branches plus custom choices, both image routes, archive enabled/disabled,
first-image blocking, brainstorm alternatives, custom-premise blocking, non-destructive
archive failures, final metadata, manual geometry preservation and printed warnings.
Tests intercept or stub Google traffic; no real generation quota is used.
