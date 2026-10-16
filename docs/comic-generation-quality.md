# Comic generation: ownership and quality

## Evidence and limits

The supplied “Cost of Doing Business” PNG was manually corrected: FWOOSH was
moved before upload. It cannot locate the original defect. The remembered dark
comedy setting is unconfirmed. The archive summary is later research, not a
record of the original inputs. The original raw plan/unedited output is unavailable.
No billable Google calls were made for this work.

A deterministic regression reproduces the former background-run bug: effect
cleanup sets a shared abort flag, the replacement resets it, and an old pending
result can then write into the replacement's result array. Separate run objects
now prevent this. This is a reproduced application defect, **not proof that it
caused the reported FWOOSH error**.

## Phases and data owners

| Phase | Inputs / owner | Output and check |
|---|---|---|
| Setup/news | User topic, optional supplied background, settings, references | App-authored brief snapshots actual inputs. Supplied context is not independently verified. |
| Single/brainstorm/custom planning | One existing text request; same schema and system rules, branch-specific brief | Story anchor + exact supplied excerpt, argument, setup/payoff; ordered unique panel/action identities; effect-to-action IDs; unresolved writer notes. Self-review happens within the existing request, not an additional paid critic call. |
| Sanitization/preflight | Application | Keep contract fields. Reject unusable drawing data and conflicting panel identifiers; expose premise, source, action, sound and amount concerns as optional advice. These checks establish structure/presence, not truth, comedy or semantic equivalence. |
| Selection/layout | User chooses a story; application selects geometry | Stable panel identities and action bindings survive. Layout does not rewrite the plot. Magazine Gag is one scene; other built-in styles use 2–4 panels. |
| First proof | Image model gets local action before/after, story intent, source basis, role, stance/register, art style and references | First image plus review version. Image text blacklist remains; props and overlays remain separate. No automatic vision verification. |
| Background/foreground | Per-review run; stable panel IDs; primary style and previous-image references | A pending background call is joined, not repeated. Failed calls remain failures until explicit Retry. Superseded runs cannot publish late results or start another panel. |
| Assembly/editor | App maps each panel's own image, contract and overlays | Stable IDs/action bindings remain. SFX composition hints are bounded relative centers, not image measurements. Manual edits remain authoritative. |
| Image changes | User requests refinement/regeneration | Only requested artwork is regenerated. Mention affected image and downstream continuity in the single optional concern notice; retain text edits. The normal Finish action accepts the proof, with no acknowledgment checkbox or reviewed buttons. No automatic paid repair. |
| Archive | Optional separate search after images, using title/summary/background | Explanatory context, never retroactive proof that the plan knew those facts. Do not treat fictional names/numbers as established allegations. |
| Export | Current edited DOM | Same panel-owned overlays and manual changes. Editor checks/warnings are excluded; export does not create new narrative content. |

## Settings and branch coverage

Shared structural requirements do not prescribe a universal joke. Setup may be
concise context; it is different from explaining a punchline. Silence, dry
non-resolution, parody and internally consistent surreal action remain valid.

| Dimension | Contract / test strategy |
|---|---|
| Seven built-in registers × three stances × single/brainstorm | Exhaustive small prompt matrix (42 combinations); selected register remains authoritative. Brainstorm delivery mechanisms are not alternate selected styles. |
| Custom stance/register/illustration + required custom premise | Explicit cases; user premise is not rewritten; unknown styles retain custom guidance. |
| Art/model/reference choices | Art descriptions stay separate from narrative intent. Both models keep existing image transport/reference contracts; reference tags are captured without file bytes. |
| Source and context switches | Provided-context vs topic-only provenance; archive on/off does not change the plan's source basis or invent verification. |
| 1/2/3/4 panels | One only for magazine gag; 2–4 otherwise. Unique action/panel IDs and source-panel binding. |
| Review/speculation/finish | Cold, pending join, completed reuse, failed background, replacement proof, background-direction change and superseded result fixtures. |
| Final edits/failures | Partial failure, explicit regenerate/refine, no unintended repair, retained manual overlay changes, advisory concern lifecycle. |

Use exhaustive small contract matrices and risk-based combinations for the
larger dimensions, not thousands of paid generations.

## Narrative rubric (human judgment, not a regex score)

| Example | Source recognizability | Causal logic / style | Effect alignment |
|---|---|---|---|
| Original reported banking story | Amount visible, compliance subject largely absent | Paying authorization then discarding it admits conflicting readings: acceptable cost vs ignored fine. Casual reaction may suit dark comedy but the argument is unclear. | Reported wrong before correction; edited PNG cannot prove origin. |
| Grounded cynical-cost plan | Opening identifies fictional bank/compliance context using supplied detail | Payment occurs, then the fictional executive budgets for recurrence: one clear cynical argument, not an assertion of real motives. | Paper-crumple and throw are separate actions; FWOOSH binds only to throw. |
| Neutral deadpan alternative | Same topic anchor | Routine administrative response exposes the situation without forcing a villain or frantic escalation. | Silence is valid. |
| Supportive/parody alternative | Same source provenance | Critique can target inadequate systems or obstacles to reform; format/stance must match the brief rather than inheriting the critical dark-comedy argument. | Format text may be captions; do not invent noise to fill fields. |
| Absurdist/slapstick/custom alternative | Keep the one supported anchor distinct from fictional exaggeration | Impossible action is allowed when the selected style calls for it, with consistent before/after states. | Bind each sound to its visible producing action, not to preparation. |

Remaining uncertainty: self-review can still miss a weak joke, a source excerpt
can be present but misinterpreted, and an image model can draw the wrong action.
Mocked regression tests cannot prove live narrative or visual fidelity. Any live
evaluation must use an explicitly authorized, capped budget; no paid automatic
judge, retry, vision inspection or repair loop has been introduced.
