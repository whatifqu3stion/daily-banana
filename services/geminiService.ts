// services/geminiService.ts — all Gemini API interactions:
//   • Comic plan generation  (single plan + multi-plan brainstorm)
//   • Panel image generation and refinement
//   • News context explainer
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { ComicFormData, ComicPlan, ProcessedReferenceImage, PlanPanel, ExplainerSource, AspectRatio, PanelContext } from '../types';
import { extractDomain } from '../utils/urlUtils';
import { ILLUSTRATION_STYLE_OPTIONS } from '../constants';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// ─── Response schemas ────────────────────────────────────────────────────────
const comicPlanSchema = {
    type: Type.OBJECT,
    properties: {
        premise: {
            type: Type.STRING,
            description: 'ONE sentence that states the core joke or comedic engine of this strip. Written before the panels to anchor everything. E.g. "A senator terrified of AI secretly uses it for every single task." This is your creative north star — every panel must serve it.'
        },
        title: { type: Type.STRING, description: 'A punchy, newspaper-headline-style title. Should tease the joke without giving it away. Avoid puns that require the strip to understand.' },
        summary: { type: Type.STRING, description: 'A one-sentence log-line of the strip, as a TV listings entry would describe it.' },
        panels: {
            type: Type.ARRAY,
            description: 'An array of 3–4 panel objects. Each panel must earn its place in the comedic arc. Do not pad.',
            items: {
                type: Type.OBJECT,
                properties: {
                    slug: { type: Type.STRING, description: 'A short, URL-friendly identifier for the panel, e.g., "senator-panics".' },
                    comedic_role: {
                        type: Type.STRING,
                        description: 'The structural job this panel does: "establish" (introduce premise/character), "escalate" (push the absurdity further), "punchline" (the payoff — a twist, reversal, or visual gag), or "button" (optional short final beat after the punchline).'
                    },
                    visual_prompt: {
                        type: Type.STRING,
                        description: 'Rich scene description for an image-generation model. Include: specific character appearance and expression, body language, setting details, camera framing (close-up / wide shot / over-shoulder), and any physical comedy or sight gag. The image must be able to carry the joke on its own. PROP TEXT (signs, screens, banners, newspapers, whiteboards): describe exactly what they say — e.g. "a whiteboard reading \'SYNERGY\' underlined three times" — the model renders prop text accurately. NEVER include speech bubbles, thought text, captions, or SFX here — those belong in text_elements only.'
                    },
                    text_elements: {
                        type: Type.ARRAY,
                        description: 'ALL spoken/written content for the panel. Keep each entry SHORT — aim for 3–8 words. Never explain the joke in dialogue. If the punchline panel works visually with no text, leave this array empty.',
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                text: { type: Type.STRING, description: 'The text content. Keep it brief and punchy.' },
                                role: { type: Type.STRING, description: 'Exactly one of: "speech" | "thought" | "sfx" | "caption". Use this decision tree:\n1. Is a SPECIFIC character visible in the panel SAYING THIS ALOUD? → "speech" (renders as speech bubble with tail). Only valid when you can name who is speaking.\n2. Is this a character\'s INTERNAL thought, not spoken aloud? → "thought" (renders as thought cloud with dots).\n3. Is this a SOUND EFFECT produced by the action — not words, just sound? → "sfx" (e.g., BANG, CRASH, KA-CHING, SQUEAK).\n4. Everything else → "caption": narrator commentary, scene labels (LATER..., MEANWHILE...), punchline text not spoken by any character, ironic observations, time/place stamps. WHEN IN DOUBT USE CAPTION, NOT SPEECH. Punchline panels almost always end with a caption or silence — not a speech bubble.' },
                            },
                            required: ['text', 'role'],
                        },
                    },
                    consistency_tags: {
                        type: Type.ARRAY,
                        description: 'Highly specific visual tags for recurring characters and key props. Be precise: "Senator Hal — bald, round face, oversized American flag lapel pin, navy suit" not just "politician". These are injected into the image prompt verbatim.',
                        items: { type: Type.STRING }
                    },
                    size: {
                        type: Type.STRING,
                        description: 'Layout weight: "small" (quick beat), "medium" (standard), "large" (visual gag or punchline that needs space to breathe).'
                    },
                    aspect_ratio: {
                        type: Type.STRING,
                        description: 'Compositional hint for this panel. Use "large" size for panels that need visual room — the layout system will render those panels wider or in cinematic 16:9. Always set "1:1" here; aspect ratio is determined by the layout engine based on size and comedic_role.'
                    },
                    scene_state: {
                        type: Type.STRING,
                        description: 'For non-final panels only: ONE sentence describing where each named character is at the END of this panel, what props they are carrying, and which direction they are moving or facing. This is read by the next panel\'s image model to maintain visual continuity. Example: "Sarah is walking LEFT through the glass office doors, cardboard box in both arms, glancing back at colleagues who stand watching from the open-plan floor." Leave empty on the final panel.'
                    }
                },
                required: ['slug', 'comedic_role', 'visual_prompt', 'text_elements', 'consistency_tags', 'size', 'aspect_ratio']
            }
        }
    },
    required: ['premise', 'title', 'summary', 'panels']
};

const multipleComicPlansSchema = {
    type: Type.ARRAY,
    description: "An array of exactly 3 comic plan objects, each using a fundamentally different comedic approach as instructed.",
    items: comicPlanSchema
};

// ─── System instruction ──────────────────────────────────────────────────────
const PLAN_GENERATION_SYSTEM_INSTRUCTION = `
You are a veteran satirical comic strip writer — think Doonesbury meets The Onion. You produce strips that are genuinely funny: tight, visually inventive, and structurally sound. Your job is to generate comic strip plans that a skilled cartoonist would be proud to draw.

---

## STEP 0 — MINE THE REAL STORY FOR SATIRICAL AMMUNITION
Do this first, before writing the premise. When background news context is provided, scan it and identify the **single sharpest piece** of satirical ammunition — pick ONE from these options:

- **A self-defeating irony** — a real fact that exposes hypocrisy on its face: the crusader who does the thing they crusade against, the reformer who profits from the status quo. This is the richest ore.
- **A verbatim real quote** — actual words a real person said that can appear in dialogue, a caption, or on a prop. If a CEO said "we're a family here" the day before mass layoffs, that quote IS the joke.
- **A specific number** — a dollar figure, a vote count, a percentage, a headcount. "$4.2 billion" is funnier than "billions." "17 minutes" is funnier than "a short time."

**Pick ONE. The sharpest single thing. Build the entire premise around that one piece.** Do NOT try to include all three — a strip cluttered with facts is a strip with no punchline. One sharp fact, weaponised well, beats three facts deployed cautiously.

If no background context is provided, invent one vivid specific (a plausible bill name, a realistic dollar figure, a fictional but recognisable character type) and commit to it as though it were real.

---

## STEP 1 — CRYSTALLISE THE PREMISE FIRST
Now write the "premise" field: one sentence capturing the core comedic engine, built from the ammunition you found above. The best premises expose a real irony or contradiction.
- WEAK: "Politicians are corrupt."
- WEAK: "A senator does something hypocritical." (generic, could be anyone)
- STRONG: "A senator crusading against Big Tech delivers his speech using every Big Tech product, reading from notes written by ChatGPT." (specific, built-in contradiction)
- STRONG: "The CEO who fired 4,000 people on a Zoom call is now on a speaking tour about 'the importance of human connection in the workplace.'" (uses a real type of event, specific detail makes it land)
Every panel must serve this premise. If a panel doesn't advance or pay off the joke, cut it.

---

## STEP 2 — BUILD THE STRUCTURAL ARC
Choose your panel count and follow its arc rigidly:

**3 panels (classic):**
- Panel 1 "establish": Introduce the absurd situation and key character(s) in one clear image.
- Panel 2 "escalate": Push the premise to a more extreme or unexpected place. The audience should think "oh no, where is this going?"
- Panel 3 "punchline": Land the twist. Subvert the expectation. The joke should feel inevitable in retrospect but surprising in the moment. **Consider a silent punchline — no dialogue at all.**

**4 panels (full arc):**
- Panel 1 "establish": Setup.
- Panel 2 "escalate": Complicate.
- Panel 3 "escalate": Push further — raise the stakes or reveal something.
- Panel 4 "punchline": Hard landing. Should recontextualise everything before it.

**2 panels:** Brutal economy. Setup + punchline only. Works best for visual sight gags.

---

## STEP 3 — APPLY THE COMEDIC STYLE
The user specifies a style. Apply it with craft, not just as a label:

- **Satirical**: Expose a real hypocrisy through exaggeration. The target behaviour must be recognisable — the audience should wince in recognition. Use specificity: name the type of politician, the exact technology, the specific corporate jargon.
- **Ironic**: Characters say or do the opposite of what they mean. Dramatic irony is powerful — let the *reader* know something the character doesn't. Understatement is your friend.
- **Deadpan**: Characters treat the absurd as completely routine. No one acknowledges the insanity. The comedy comes from the gap between the outrageous situation and the characters' flat reaction to it.
- **Absurdist**: Take one impossible premise and follow its logic ruthlessly. The comedy is in the internal consistency of a broken universe. Do not explain the absurdity — commit to it fully.
- **Slapstick**: Physical escalation. Bodies misbehave. Objects behave badly. Each panel the physical mishap compounds. Exaggerated facial expressions and body language carry the strip. Go big.

---

## STEP 4 — DIALOGUE ECONOMICS
- Target: **3–7 words per speech bubble.** Fewer is almost always better.
- Never let a character explain the joke. If you've written "As you can see, this ironically shows that..." — delete it.
- Avoid hedging language: no "Well...", "I suppose...", "Perhaps...".
- The punchline panel should often be **silent**. Trust the image.
- Captions (narrator boxes) can carry punchline text, scene labels, or time/place — but keep them short.
- Sound effects (sfx) must be vivid and specific: "KA-CHING", "SQUEAK SQUEAK", "BOOM" — not "thud".

---

## STEP 5 — VISUAL COMEDY PRINCIPLES
The image must carry at least 50% of the joke. Before writing dialogue, ask: "Could this be funny without any words?"

- **Character specificity**: Give characters a strong, memorable visual hook (a signature prop, an absurd posture, a telling fashion choice). Avoid generic "man in suit."
- **Sight gags**: The funniest moments are often visual — an unexpected object in the background, an absurd scale contrast, a character doing something physically impossible with perfect calm.
- **Expressions matter**: Specify the exact expression. Not "looks surprised" — "eyes wide open, mouth forming a small horrified 'O', one hand raised with a half-eaten biscuit frozen mid-air."
- **Framing for comedy**: Close-ups emphasise reaction. Wide shots reveal scale and context. Over-the-shoulder shots create suspense. Use size "large" for panels where the visual gag needs room.
- **Avoid talking-head panels**: If two characters just face each other and talk, the image adds nothing. Give them something to do, hold, react to.

---

## HARD RULES
1. **Never explain the joke** — in dialogue, captions, or the summary.
2. **The last panel must land hard.** An ambiguous or soft ending is a failed strip.
3. **Consistency tags must be specific.** "Tall woman in a yellow hazmat suit, silver helmet, red safety boots" — not "scientist".
4. **visual_prompt — prop text yes, overlay text never.** Speech bubbles, thought clouds, SFX, and captions belong ONLY in text_elements — never mention them in visual_prompt. However, in-world written props (signs, screens, posters, protest banners, newspapers, whiteboards, name badges) MUST be described with their exact content — the image model renders prop text accurately when given specific wording. BAD: "a protest sign". GOOD: "a hand-lettered cardboard sign reading 'HANDS OFF OUR DATA' in thick black marker". **EXCEPTION — if a text string already appears in text_elements (as a caption, speech bubble, or SFX), do NOT describe that same string on a prop in visual_prompt.** The overlay system will display that text on screen; the image should show the prop as a generic/blank object. BAD: panel has caption "AI TOOK MY JOB" AND visual_prompt says "holding a sign reading 'AI TOOK MY JOB'". GOOD: panel has caption "AI TOOK MY JOB" AND visual_prompt says "holding a protest sign".
5. **Panel count: 2–4.** Do not pad with unnecessary panels.
6. **Output valid JSON only.** No markdown, no preamble, no explanation outside the schema.
7. **Real specificity beats invented specificity.** When background context is available, use real names, real quotes, real dollar figures, and real policy names directly in props, dialogue, and captions — do not paraphrase into vagueness. The joke "The RESTRICT Act passed 96-1, sponsored by the senator who uses TikTok daily" is an indictment. "A law about social media was passed" is not. At least one panel should contain a real, verifiable fact from the story — something a reader could look up. This is what turns a comic strip from general mockery into genuine commentary.
8. **Comedy and narrative come first.** Factual specificity is a sharpening tool — it makes the punchline land harder. If a real fact doesn't directly power the joke, cut it. Never let a data point crowd out a visual gag or a sharp piece of dialogue. The goal is a great joke that happens to be grounded in something true — not a factual report with a comedy label.
9. **scene_state is your continuity contract.** For every non-final panel, populate scene_state with one sentence stating where each named character is at the END of this panel, what they are carrying or wearing, and which direction they are moving. The next panel's image model will open from this exact state. WRONG: "Characters are visible in the scene." RIGHT: "Sarah is walking LEFT through the glass office doors, a cardboard box held in both arms, glancing back over her shoulder at colleagues watching from the open-plan office." Leave scene_state empty on the final (punchline/button) panel.
`;


// ─── Per-request prompt builders ─────────────────────────────────────────────
// Stance → satirical technique mapping
const STANCE_GUIDANCE: Record<string, string> = {
    supportive: `Your angle is SUPPORTIVE — find the genuine heroism, absurdity of opposition, or comic irony in defending this position. The comedy comes from showing how ridiculous the critics look, or how unexpectedly complicated it is to do the right thing.`,
    critical: `Your angle is CRITICAL — expose the hypocrisy, incompetence, or self-interest at the heart of this topic. Use specific, recognisable behaviour. The target should be identifiable but the critique should feel earned, not preachy.`,
    neutral: `Your angle is NEUTRAL / OBSERVATIONAL — you're the incredulous everyman watching the chaos. The comedy comes from the absurdity of the situation itself, not from taking sides. Both sides can look foolish.`,
};

// Comedic style → craft note mapping
const STYLE_CRAFT_NOTES: Record<string, string> = {
    satirical: `SATIRICAL MODE: Exaggerate real behaviour until it reveals its own absurdity. Specificity is everything — the more recognisable the target, the sharper the satire. Avoid generic "politician does bad thing"; instead show the exact specific bad thing in vivid detail.`,
    ironic: `IRONIC MODE: Build your strip on dramatic irony or verbal irony. Let the reader see the gap between what characters claim and what is actually happening. Understatement is more powerful than overstatement here.`,
    deadpan: `DEADPAN MODE: Everyone in the strip treats the insane situation as completely routine. No character reacts with surprise or horror — that's the audience's job. The comedy lives in the gap between the outrageous event and the flat, matter-of-fact response.`,
    absurdist: `ABSURDIST MODE: Pick one impossible or surreal premise and follow its internal logic to the breaking point. Do NOT explain the absurdity. The characters live in this world and accept it. The escalation should feel inevitable given the broken rules of this universe.`,
    slapstick: `SLAPSTICK MODE: Physical comedy drives this strip. Bodies misbehave, objects act against their owners, mishaps escalate. Each panel the physical chaos compounds. Describe exaggerated expressions and body contortions in the visual_prompt. Sound effects (sfx) are your friends.`,
    'dark-comedy': `DARK COMEDY MODE: Find the laugh in institutional indifference, the absurd cruelty of bureaucratic systems, existential futility, and the comedy of powerlessness. Think Catch-22, Dr. Strangelove, The Death of Stalin — dry, cynical, bleak irony where the punchline is that nothing matters and everyone knows it. The humour comes from the gap between the severity of a situation and the characters' inappropriately casual or resigned response. Tone must stay bone-dry — no winking at the audience. CRITICAL CONTENT BOUNDARY: Stay firmly within satirical newspaper editorial standards. Do NOT depict graphic violence, explicit harm, real named individuals suffering, or any content that would be rejected by a mainstream editorial publication. Dark should mean cynical and nihilistic — never graphic or shocking. The joke must have a satirical point. The punchline should land with a quiet, horrible logic.`,
    parody: `PARODY / PASTICHE MODE: The strip imitates a specific real-world format to deliver its satirical point — a corporate all-hands memo, a government safety announcement, a movie trailer voice-over, a nature documentary, a news ticker, a self-help listicle. Pick ONE format and commit to it completely. Characters should speak in the clichés and jargon of that format. The comedy comes from the collision between the ridiculous content and the straight-faced institutional voice. Use captions (narrator boxes) liberally to sell the format imitation.`,
};

const getStanceGuidance = (stance: string): string =>
    STANCE_GUIDANCE[stance.toLowerCase()] ??
    `Your angle is: "${stance}". Before designing panels, consider: what does this perspective find most absurd or infuriating about the topic? What behaviour or assumption does it want to expose or celebrate? What would a reader who shares this view find cathartic or vindicating about the punchline? Let these questions shape every panel's visual and dialogue choices.`;

const getStyleCraftNote = (style: string): string =>
    STYLE_CRAFT_NOTES[style.toLowerCase()] ??
    `CUSTOM STYLE — "${style}": Before designing panels, analyse what this comedic register implies: What is the emotional tone (warm, cold, angry, bewildered)? What pacing does it demand (slow build or rapid fire)? What kind of punchline does it favour (a twist, a visual gag, a bleak non-resolution, a triumphant reversal)? What should characters sound like in their dialogue? Apply all of these inferred qualities consistently across every panel. Commit fully to this register — never break it.`;

// Stance → image-level visual framing note
const STANCE_VISUAL_NOTES: Record<string, string> = {
    supportive: `Visual framing — SUPPORTIVE stance: The protagonist or subject should appear earnest, competent, and sympathetic. Portray critics or obstacles as petty, bumbling, or misguided through body language and expression. Use warm, approachable framing for the subject of support.`,
    critical: `Visual framing — CRITICAL stance: Characters representing the target of critique should appear self-important, oblivious, or hypocritical through their posture, expression, and props. Let the image convey the irony visually — show what words won't say.`,
    neutral: `Visual framing — NEUTRAL/OBSERVATIONAL stance: Balanced framing throughout. No character should appear more heroic or villainous than another through pose, lighting, or composition. The comedy lives in the absurdity of the situation itself.`,
};

const getStanceVisualNote = (stance: string): string =>
    STANCE_VISUAL_NOTES[stance.toLowerCase()] ??
    `Visual framing — editorial stance: "${stance}". Let this perspective subtly inform how characters are framed, posed, and lit — without being heavy-handed about it.`;


// Helper to get illustration style description
const getIllustrationStyleDescription = (styleValue?: string): string => {
    if (!styleValue) return 'A standard full-color retro newspaper comic panel style.';
    const selectedOption = ILLUSTRATION_STYLE_OPTIONS.find(opt => opt.value === styleValue);
    if (selectedOption) return selectedOption.description;
    return `CUSTOM ILLUSTRATION STYLE — "${styleValue}": Analyse what this visual style implies: what line weight and rendering technique does it suggest? What colour palette (saturated, muted, monochrome, limited)? What level of detail in backgrounds vs. characters? What mood does the style evoke? Apply all inferred visual qualities consistently across every panel — never break the style.`;
};


// Constructs the user's specific request to be sent as the main content.
const constructPlanContents = (formData: ComicFormData, numPlans: number): string => {
    const { topic, newsContext, stance, comedicStyle, illustrationStyle, referenceImages, customPremise } = formData;
    const styleDescription = getIllustrationStyleDescription(illustrationStyle);
    const stanceGuidance = getStanceGuidance(stance);
    const styleCraftNote = getStyleCraftNote(comedicStyle);

    // Topic is the user's protected intent anchor. Background context is satirical
    // ammunition — real names, quotes, and numbers should be used directly.
    const topicBlock = newsContext
        ? `- **Topic (your non-negotiable north star — the comic MUST be fundamentally about this exact subject from this exact angle):** ${topic}\n- **Background context (this is your satirical ammunition — apply STEP 0 to it now: pick ONE sharpest piece — the single best irony, OR a verbatim quote, OR a specific number. Real names, real quotes, and real figures from this context are sharper than invented ones — use the best one directly in props, dialogue, or captions. The one constraint: do NOT let this context redirect the comic's subject or override the user's angle above):** ${newsContext}`
        : `- **Topic:** ${topic}`;

    let referenceImageInfo = '';
    if (referenceImages && referenceImages.length > 0) {
        referenceImageInfo = `\n**Reference Images Provided:**\nThe user has supplied reference images. Use them as the visual foundation for characters/settings. Tag them precisely in consistency_tags:\n${referenceImages.map(img => `- "${img.tag}"`).join('\n')}\n`;
    }

    // Hard-inject a user-supplied premise as a non-negotiable constraint.
    // This overrides AI narrative invention while still respecting all other settings.
    const customPremiseBlock = customPremise
        ? `\nREQUIRED PREMISE (non-negotiable): "${customPremise}" — build the entire strip around this exact premise. Do not substitute, paraphrase, or reframe it. Every panel must serve this premise directly. The premise is locked; only the panel breakdown and visual execution are yours to design.\n`
        : '';

    if (numPlans > 1) {
        // Brainstorm mode: three structurally distinct delivery mechanisms, all within the user's chosen comedic register
        return `
Generate exactly 3 comic strip concepts about the topic below. Each concept MUST deliver the user's chosen comedic register through a fundamentally different structural mechanism — they should feel like three different species of the same style, not three variations of the same idea.

**Mandatory structural variety — express the "${comedicStyle}" register via each of these three delivery mechanisms:**
- Concept 1 — VISUAL/PHYSICAL delivery: The comedy lives almost entirely in the image. Minimal or no dialogue. A sight gag, visual absurdity, or physical mishap carries the punchline. Think Buster Keaton — the chosen register expressed through bodies and objects, not words.
- Concept 2 — IRONIC REVERSAL delivery: Build the strip around strong dramatic or verbal irony. The reader knows something characters don't, or characters say the opposite of what they mean. Dialogue is central but kept short. The chosen register expressed through the gap between what is said and what is true.
- Concept 3 — ABSURD ESCALATION delivery: One impossible or surreal premise, followed ruthlessly to its logical extreme. Each panel the situation compounds, but all characters treat it as routine. The chosen register expressed through internal consistency of a broken universe.

**Creative Brief:**
${topicBlock}
- **Angle:** ${stanceGuidance}
- **Comedic Register:** ${styleCraftNote}
- **Illustration Style:** ${styleDescription}
${referenceImageInfo}${customPremiseBlock}
Before writing any premise, apply STEP 0 once: mine the background context and pick ONE sharpest piece of ammunition — the single best irony, OR a verbatim real quote, OR a specific number. Then use that one sharp fact as the common foundation across all three concepts — each expresses it through a different structural mechanism, but all three are grounded in the same real material.
Remember: write the "premise" field first for each concept before designing panels. That one sentence is your anchor.
CRITICAL: No matter how much background context is provided, every concept's core premise must remain faithful to the user's stated Topic and Angle above. Background context is your satirical ammunition — not a replacement for the user's subject.
`;
    }

    return `
Generate a single comic strip plan about the topic below.

**Creative Brief:**
${topicBlock}
- **Angle:** ${stanceGuidance}
- **Comedic Register:** ${styleCraftNote}
- **Illustration Style:** ${styleDescription}
${referenceImageInfo}${customPremiseBlock}
Before writing the premise, apply STEP 0: mine the background context and pick ONE sharpest piece — the single best irony, OR a verbatim real quote, OR a specific number. Build the entire premise from that one piece.
Remember: write the "premise" field first before designing panels. That one sentence anchors the entire strip.
CRITICAL: No matter how much background context is provided, the comic's premise must remain faithful to the user's stated Topic and Angle above. Background context is your satirical ammunition — not a replacement for the user's subject.
`;
};

/**
 * Builds the final text prompt sent to the image model.
 * When `refinementPrompt` is provided the instruction becomes "refine this image";
 * otherwise it generates from scratch. `consistencyTags` is guarded against
 * null/undefined since the AI occasionally omits the field.
 */
const constructImagePrompt = (
    basePrompt: string,
    consistencyTags: string[],
    illustrationStyle?: string,
    comedicStyle?: string,
    refinementPrompt?: string,
    stance?: string,
    aspectRatio?: AspectRatio,
    overlayTexts?: string[],
    panelContext?: PanelContext,
    prevSceneState?: string,
): string => {
    const styleDescription = getIllustrationStyleDescription(illustrationStyle);
    // Use the full craft note so the image model gets the same rich guidance
    // that the plan model received — not just the raw style name.
    const styleCraftNote = comedicStyle ? getStyleCraftNote(comedicStyle) : '';
    const stanceVisualNote = stance ? getStanceVisualNote(stance) : '';

    const mainInstruction = refinementPrompt
        ? `You are refining an existing comic panel image. Apply ONLY these visual modifications to the artwork: [${refinementPrompt}]. These are editing instructions — do NOT render them as text, labels, or words anywhere in the image.`
        : `Generate a comic panel image based on the following description.`;

    const safeConsistencyTags = consistencyTags || [];

    const consistencyBlock = safeConsistencyTags.length > 0
        ? `**CHARACTER DESIGN REFERENCE — apply only to characters present in this panel:**
The following are design descriptions for recurring characters. If a character listed below appears in this panel's visual description, reproduce them exactly as described. Do NOT include a character simply because they are listed here — only draw characters that are explicitly called for in this panel's description. Do NOT add body parts, props, or scene elements from other panels.
${safeConsistencyTags.map(t => `• ${t}`).join('\n')}
Key props, vehicles, buildings, and set pieces must maintain consistent spatial orientation across panels — if an object faces left in one panel it must face left in all panels unless the description explicitly calls for a different angle.`
        : '';

    const safeOverlayTexts = (overlayTexts ?? []).filter(t => t.trim());
    const overlayBlacklistBlock = safeOverlayTexts.length > 0
        ? `\nOVERLAY TEXT BLACKLIST — These exact strings will be rendered on screen by the app. Do NOT paint them into the artwork — not in speech bubbles, captions, SFX bursts, signs, screens, or any other element. If a prop in the scene would naturally carry one of these strings, render that prop with blank, illegible, or placeholder markings instead:\n${safeOverlayTexts.map(t => `• "${t}"`).join('\n')}`
        : '';

    const roleGuidance: Record<string, string> = {
        establish: 'ESTABLISH — Opening panel. Introduce the characters and situation with clarity. Prefer a wide or medium establishing shot so the reader grasps the premise at a glance.',
        escalate: 'ESCALATE — The absurdity is intensifying. Composition should feel more pressured and dynamic than the opener — raise the stakes visually, build dread or comic tension.',
        punchline: 'PUNCHLINE — The payoff. Compose for maximum visual impact: a sight gag, a reveal, or a juxtaposition that recontextualises everything before it. Choose the framing that makes the joke land hardest — go wide for a grand reveal or tight for a reaction shot.',
        button: 'BUTTON — A brief coda after the punchline. Keep the composition tight and punchy.',
    };
    const narrativeContextBlock = panelContext
        ? `\nNARRATIVE CONTEXT — You are drawing panel ${panelContext.panelIndex + 1} of ${panelContext.totalPanels} in a comic strip.${panelContext.premise ? `\nCore premise: "${panelContext.premise}"` : ''}${panelContext.comedicRole && roleGuidance[panelContext.comedicRole] ? `\nThis panel's role: ${roleGuidance[panelContext.comedicRole]}` : ''}\nLet this context guide your compositional choices — camera distance, visual energy, framing — beyond what the scene description says literally.\n`
        : '';

    const shapeLabel = aspectRatio === '16:9' ? 'widescreen 16:9 landscape'
        : aspectRatio === '9:16' ? 'portrait 9:16 vertical'
        : aspectRatio === '4:3'  ? 'landscape 4:3'
        : 'square 1:1';

    const prevSceneBlock = prevSceneState
        ? `\nCONTINUITY FROM PREVIOUS PANEL — this scene opens from this state:\n${prevSceneState}\nCharacters begin this panel where the previous panel left them. Do not contradict this state.\n`
        : '';

    return `${narrativeContextBlock}
OVERLAY TEXT — DO NOT RENDER IN IMAGE: Speech bubbles, thought clouds, dialogue, captions, narrator boxes, and sound-effect text must NOT appear anywhere in the artwork. These are composited on top of the image by a separate overlay system — any version you draw will be hidden under it and will only create visual noise. Leave all of that space clean.${overlayBlacklistBlock}

PROP TEXT — RENDER ACCURATELY: Signs, screens, posters, newspapers, protest banners, name badges, labels, whiteboards, book covers, and any other in-world written props should show the exact text described below. The model is expected to produce legible, correctly-spelled prop text. "A placard reading 'HANDS OFF OUR DATA'" means render those exact words on that placard.

CANVAS SHAPE: ${shapeLabel} frame — compose the full shot for this exact ratio, filling edge-to-edge.

---

${mainInstruction}
${prevSceneBlock}
**Visual Description:**
${basePrompt}

**Art Style:**
- **Overall Style:** ${styleDescription}
- **Comedic Register:** ${styleCraftNote}
${stanceVisualNote ? `- **Editorial Framing:** ${stanceVisualNote}` : ''}

${consistencyBlock}

FILL THE PANEL EDGE-TO-EDGE: Artwork must bleed to all four edges of the image. Do not add any white margins, gutters, padding, borders, or empty space around the artwork. The image frame is the panel border — there is no inner frame inside it.

Reminder: no speech bubbles, thought clouds, captions, or SFX text in the image. Prop text (signs, screens, banners) render exactly as described.

If a reference image is provided, use it only to match the art style, character designs, and colour palette. Do not copy its scene composition, background layout, camera framing, or specific poses. Output a single comic panel image.
`;
};

// ─── Response sanitization ───────────────────────────────────────────────────

/**
 * Checks the first candidate's finishReason for a safety block and throws a
 * user-friendly error if found. Call this after every generateContent call,
 * before trying to read the response body.
 */
const assertNotSafetyBlocked = (result: any, context: string): void => {
    const candidate = result.candidates?.[0];
    const finishReason = candidate?.finishReason as string | undefined;
    // Only throw definitively for confirmed content-policy blocks.
    // Empty candidates (no candidate at all) are treated as transient API failures —
    // the retry loop will handle them. Throwing here would abort all retries with
    // a misleading "content filters" message when the real cause is a model hiccup.
    if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
        console.warn(`Safety block detected (${context}). finishReason: ${finishReason}`);
        throw new Error(
            "The AI's content filters blocked this request. Try rephrasing your topic or choosing a different comedic style. " +
            "If using Dark Comedy, keep the subject matter within editorial-cartoon bounds — avoid explicit references to harm, violence, or tragedy."
        );
    }
    if (!candidate) {
        // Log for debugging but let the retry loop continue.
        console.warn(`${context}: empty candidates array (transient failure, will retry if attempts remain).`);
    }
};

const VALID_ROLES = new Set(['speech', 'thought', 'sfx', 'caption']);

// Unambiguous bracket label: [Later...] / [Meanwhile, in Congress]
const BRACKET_RE = /^\[.*\]$/;
// Unambiguous internal-monologue marker: *sighs* / *internally screaming*
const ASTERISK_RE = /^\*[^*]+\*$/;

/**
 * Applies deterministic heuristics to catch the most common AI role
 * misclassifications before the plan reaches the renderer.
 *
 * Rules (in priority order):
 *  1. Unknown role string → "caption" (safe fallback)
 *  2. [Bracket] text → always "caption" (scene/time label)
 *  3. *Asterisk* text → always "thought" (internal monologue marker)
 *  4. Otherwise keep what the AI chose
 */
const coerceRole = (
    text: string,
    rawRole: string
): 'speech' | 'thought' | 'sfx' | 'caption' => {
    const role = VALID_ROLES.has(rawRole)
        ? (rawRole as 'speech' | 'thought' | 'sfx' | 'caption')
        : 'caption';

    const trimmed = text.trim();
    if (BRACKET_RE.test(trimmed)) return 'caption';
    if (ASTERISK_RE.test(trimmed)) return 'thought';
    return role;
};

/**
 * Constructs a guaranteed-valid ComicPlan from raw AI output.
 * Builds a fresh object rather than spreading the raw response so every field
 * is explicitly validated. Callers can rely on the result having the correct
 * shape even when the AI returns partial or malformed JSON.
 */
const sanitizeComicPlan = (plan: any): ComicPlan => {
  const newPlan: ComicPlan = {
    title: 'Untitled Comic',
    summary: 'No summary provided.',
    panels: [],
  };

  if (typeof plan !== 'object' || plan === null) {
    return newPlan;
  }

  if (typeof plan.premise === 'string') newPlan.premise = plan.premise.trim();
  if (typeof plan.title === 'string') newPlan.title = plan.title.trim();
  if (typeof plan.summary === 'string') newPlan.summary = plan.summary.trim();

  if (Array.isArray(plan.panels)) {
    for (const p of plan.panels) {
      if (typeof p !== 'object' || p === null) {
        continue;
      }

      const newPanel: PlanPanel = {
        slug: `panel-${Date.now()}-${Math.random()}`,
        visual_prompt: 'No visual prompt provided.',
        text_elements: [],
        consistency_tags: [],
        size: 'medium',
        aspect_ratio: '1:1', // layoutAdapter overrides this via template selection
      };

      if (typeof p.slug === 'string') newPanel.slug = p.slug;
      if (typeof p.visual_prompt === 'string') newPanel.visual_prompt = p.visual_prompt;
      if (['small', 'medium', 'large'].includes(p.size)) newPanel.size = p.size;
      if (['establish', 'escalate', 'punchline', 'button'].includes(p.comedic_role)) {
          newPanel.comedic_role = p.comedic_role;
      }
      if (typeof p.scene_state === 'string' && p.scene_state.trim()) {
          newPanel.scene_state = p.scene_state.trim();
      }

      if (Array.isArray(p.text_elements)) {
          for (const el of p.text_elements) {
              if (typeof el === 'object' && el !== null && typeof el.text === 'string') {
                  const text = el.text.trim();
                  const role = coerceRole(text, typeof el.role === 'string' ? el.role : '');
                  newPanel.text_elements.push({ text, role });
              }
          }
      }

      if (Array.isArray(p.consistency_tags)) {
          for (const tag of p.consistency_tags) {
              if (typeof tag === 'string') {
                  newPanel.consistency_tags.push(tag);
              }
          }
      }

      newPlan.panels.push(newPanel);
    }
  }

  return newPlan;
};

// ─── API functions ───────────────────────────────────────────────────────────

const generateSingleComicPlan = async (formData: ComicFormData, userProvidedImages: ProcessedReferenceImage[]): Promise<ComicPlan> => {
    const contents = constructPlanContents(formData, 1);
    // Each reference image is preceded by its tag so the model knows which
    // character/style each image represents (same pattern as image generation).
    const parts = [
        { text: contents },
        ...userProvidedImages.flatMap(img => [
            { text: img.tag || 'User-supplied reference image — match the style, characters, or setting shown.' },
            { inlineData: { data: img.base64, mimeType: img.mimeType } }
        ])
    ];

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts },
        config: {
            systemInstruction: PLAN_GENERATION_SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
            responseSchema: comicPlanSchema
        }
    });

    assertNotSafetyBlocked(result, 'generateSingleComicPlan');

    try {
        const jsonText = result.text.trim();
        if (!jsonText) {
            console.error("AI returned empty text for single comic plan.");
            throw new Error("The AI returned an empty response. Please try again.");
        }
        const rawPlan = JSON.parse(jsonText);
        return sanitizeComicPlan(rawPlan);
    } catch (e) {
        console.error("Failed to parse comic plan JSON:", e);
        console.error("Received text:", result.text);
        throw new Error("The AI returned an invalid story plan. Please try regenerating.");
    }
};

const generateMultipleComicPlans = async (formData: ComicFormData, userProvidedImages: ProcessedReferenceImage[]): Promise<ComicPlan[]> => {
    const contents = constructPlanContents(formData, 3); // Ask for 3 ideas
    // Each reference image is preceded by its tag so the model knows which
    // character/style each image represents (same pattern as image generation).
    const parts = [
        { text: contents },
        ...userProvidedImages.flatMap(img => [
            { text: img.tag || 'User-supplied reference image — match the style, characters, or setting shown.' },
            { inlineData: { data: img.base64, mimeType: img.mimeType } }
        ])
    ];

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts },
        config: {
            systemInstruction: PLAN_GENERATION_SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
            responseSchema: multipleComicPlansSchema,
        }
    });

    assertNotSafetyBlocked(result, 'generateMultipleComicPlans');

    try {
        const jsonText = result.text.trim();
        if (!jsonText) {
            console.error("AI returned empty text for multiple comic plans.");
            throw new Error("The AI returned an empty response. Please try again.");
        }
        const rawPlans = JSON.parse(jsonText);

        if (!Array.isArray(rawPlans)) {
            console.error("AI did not return an array for multiple plans. Received:", rawPlans);
            throw new Error("The AI returned an invalid set of story ideas. Please try regenerating.");
        }
        
        // Sanitize each plan within the array.
        return rawPlans.map(sanitizeComicPlan);

    } catch (e) {
        console.error("Failed to parse multiple comic plans JSON:", e);
        console.error("Received text:", result.text);
        throw new Error("The AI returned an invalid set of story ideas. Please try regenerating.");
    }
};

const IMAGE_GENERATION_ATTEMPTS = 3;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const generatePanelImageWithReferences = async (
    visual_prompt: string,
    consistency_tags: string[],
    illustrationStyle?: string,
    comedicStyle?: string,
    userProvidedImages: ProcessedReferenceImage[] = [],
    imageModel: string = 'gemini-3.1-flash-image-preview',
    stance?: string,
    aspectRatio?: AspectRatio,
    overlayTexts?: string[],
    panelContext?: PanelContext,
    prevSceneState?: string,
): Promise<string> => {
    const prompt = constructImagePrompt(visual_prompt, consistency_tags, illustrationStyle, comedicStyle, undefined, stance, aspectRatio, overlayTexts, panelContext, prevSceneState);
    // Each reference image is preceded by its tag text so the model understands
    // what role that image plays (style sheet, previous panel, user character, etc.).
    const parts = [
        { text: prompt },
        ...userProvidedImages.flatMap(img => [
            { text: img.tag || 'User-supplied reference image — match the style, characters, or setting shown.' },
            { inlineData: { data: img.base64, mimeType: img.mimeType } }
        ])
    ];

    for (let attempt = 1; attempt <= IMAGE_GENERATION_ATTEMPTS; attempt++) {
        if (attempt > 1) await sleep(1000 * (attempt - 1));

        const result = await ai.models.generateContent({
            model: imageModel,
            contents: { parts },
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT],
                imageConfig: {
                    aspectRatio: aspectRatio ?? '1:1',
                    imageSize: '2K',
                },
            }
        });

        // Safety blocks are definitive — do not retry.
        assertNotSafetyBlocked(result, 'generatePanelImageWithReferences');

        const imagePart = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (imagePart?.inlineData) return imagePart.inlineData.data;

        // Log what the model said instead of the image — helps diagnose soft refusals.
        const textPart = result.candidates?.[0]?.content?.parts?.find(p => p.text);
        console.error(`generatePanelImageWithReferences attempt ${attempt}/${IMAGE_GENERATION_ATTEMPTS}: no image returned. Model text: "${textPart?.text ?? '(none)'}"`);
    }

    throw new Error('Image generation failed: The AI did not return an image after multiple attempts. Please try regenerating.');
};

const refinePanelImage = async (
    baseImage: string, // base64
    refinementPrompt: string,
    visualPrompt: string,
    consistencyTags: string[],
    illustrationStyle?: string,
    comedicStyle?: string,
    userProvidedImages: ProcessedReferenceImage[] = [],
    imageModel: string = 'gemini-3.1-flash-image-preview',
    stance?: string,
    aspectRatio?: AspectRatio,
    overlayTexts?: string[],
    panelContext?: PanelContext,
    prevSceneState?: string,
): Promise<string> => {
    const prompt = constructImagePrompt(
        visualPrompt,
        consistencyTags,
        illustrationStyle,
        comedicStyle,
        refinementPrompt,
        stance,
        aspectRatio,
        overlayTexts,
        panelContext,
        prevSceneState,
    );

    const parts = [
        { inlineData: { data: baseImage, mimeType: 'image/png' } },
        { text: prompt },
        ...userProvidedImages.flatMap(img => [
            { text: img.tag || 'User-supplied reference image — match the style, characters, or setting shown.' },
            { inlineData: { data: img.base64, mimeType: img.mimeType } }
        ])
    ];

    for (let attempt = 1; attempt <= IMAGE_GENERATION_ATTEMPTS; attempt++) {
        if (attempt > 1) await sleep(1000 * (attempt - 1));

        const result = await ai.models.generateContent({
            model: imageModel,
            contents: { parts },
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT],
                imageConfig: {
                    aspectRatio: aspectRatio ?? '1:1',
                    imageSize: '2K',
                },
            }
        });

        assertNotSafetyBlocked(result, 'refinePanelImage');

        const imagePart = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (imagePart?.inlineData) return imagePart.inlineData.data;

        const textPart = result.candidates?.[0]?.content?.parts?.find(p => p.text);
        console.error(`refinePanelImage attempt ${attempt}/${IMAGE_GENERATION_ATTEMPTS}: no image returned. Model text: "${textPart?.text ?? '(none)'}"`);
    }

    throw new Error('Image refinement failed: The AI did not return an image after multiple attempts. Please try again.');
};

const generateContextExplainer = async (
    title: string,
    summary: string,
    newsContext?: string,
): Promise<{ text: string; sources: ExplainerSource[] }> => {
    const contextSection = newsContext
        ? `\n**Background provided by user:** "${newsContext}"\n`
        : '';
    const contents = `
The following is a satirical comic strip. Use Google Search to find the real-world news event or context this comic references, then write a 1–2 sentence factual explanation of it. Tone: dry, neutral, and informational — like a newspaper footnote. Do not editorialize or take sides.

**Comic Title:** "${title}"
**Comic Summary:** "${summary}"${contextSection}

**Context Explanation:**
`;

    try {
        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents,
            config: {
                temperature: 0.1,
                tools: [{ googleSearch: {} }],
            },
        });

        const text = result.text?.trim() || 'Could not generate context at this time.';

        // Extract cited sources from grounding metadata
        const chunks: any[] = (result as any).candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
        const sources: ExplainerSource[] = chunks
            .filter((c: any) => c.web?.uri)
            .map((c: any) => ({
                url: c.web.uri as string,
                title: (c.web.title as string) || extractDomain(c.web.uri as string),
            }))
            // Deduplicate by domain so "reuters.com" doesn't appear twice
            .filter((s, i, arr) => arr.findIndex(x => extractDomain(x.url) === extractDomain(s.url)) === i)
            .slice(0, 5);

        return { text, sources };
    } catch (error) {
        console.error('Failed to generate context explainer:', error);
        return { text: 'Could not generate context at this time.', sources: [] };
    }
};

// Exported service object
export const geminiService = {
    generateSingleComicPlan,
    generateMultipleComicPlans,
    generatePanelImageWithReferences,
    refinePanelImage,
    generateContextExplainer,
};