// FIX: The original file started with an invalid line of text that caused parsing errors. It has been removed.
// services/geminiService.ts
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { ComicFormData, ComicPlan, ProcessedReferenceImage, ComedicStyle, PlanPanel } from '../types';
import { ILLUSTRATION_STYLE_OPTIONS } from '../constants';

// According to guidelines, API key must be from the environment.
// FIX: The API key must be read from `process.env.API_KEY` as per the coding guidelines.
// This resolves the "Property 'env' does not exist on type 'ImportMeta'" error.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Schemas for comic plan generation
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
                        description: 'Rich scene description for an image-generation model. Include: specific character appearance and expression, body language, setting details, camera framing (close-up / wide shot / over-shoulder), and any physical comedy or sight gag. The image must be able to carry the joke on its own. DO NOT include any text, speech bubbles, or captions here.'
                    },
                    text_elements: {
                        type: Type.ARRAY,
                        description: 'ALL spoken/written content for the panel. Keep each entry SHORT — aim for 3–8 words. Never explain the joke in dialogue. If the punchline panel works visually with no text, leave this array empty.',
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                text: { type: Type.STRING, description: 'The text content. Keep it brief and punchy.' },
                                role: { type: Type.STRING, description: '"speech" (talking), "thought" (thinking), "sfx" (sound effect), or "caption" (narrator box).' },
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
                        description: 'Must always be "1:1".'
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

// System instruction for the comic plan generator.
const PLAN_GENERATION_SYSTEM_INSTRUCTION = `
You are a veteran satirical comic strip writer — think Doonesbury meets The Onion. You produce strips that are genuinely funny: tight, visually inventive, and structurally sound. Your job is to generate comic strip plans that a skilled cartoonist would be proud to draw.

---

## STEP 1 — CRYSTALLISE THE PREMISE FIRST
Before designing a single panel, write the "premise" field: one sentence capturing the core comedic engine. The best premises have a built-in irony or contradiction. 
- WEAK: "Politicians are corrupt."
- STRONG: "A senator crusading against Big Tech delivers his speech using every Big Tech product, reading from notes written by ChatGPT."
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
- Captions are for setting time/place only, not commentary.
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
4. **visual_prompt contains zero text, zero speech, zero captions.** Describe only what is seen.
5. **aspect_ratio is always "1:1".**
6. **Panel count: 2–4.** Do not pad with unnecessary panels.
7. **Output valid JSON only.** No markdown, no preamble, no explanation outside the schema.
`;


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
    'dark-comedy': `DARK COMEDY MODE: Find the laugh inside the genuinely bleak, tragic, or taboo. The humour comes from the gap between the severity of a situation and the inappropriately casual or optimistic response to it. Tone must stay bone-dry — never wink at the audience. The best dark comedy makes the reader laugh and immediately feel guilty about it. Avoid shock for its own sake; the joke must have a point. The punchline should land with a quiet, horrible logic rather than a bang.`,
    parody: `PARODY / PASTICHE MODE: The strip imitates a specific real-world format to deliver its satirical point — a corporate all-hands memo, a government safety announcement, a movie trailer voice-over, a nature documentary, a news ticker, a self-help listicle. Pick ONE format and commit to it completely. Characters should speak in the clichés and jargon of that format. The comedy comes from the collision between the ridiculous content and the straight-faced institutional voice. Use captions (narrator boxes) liberally to sell the format imitation.`,
};

const getStanceGuidance = (stance: string): string =>
    STANCE_GUIDANCE[stance.toLowerCase()] ??
    `Your angle is: "${stance}". Before designing panels, consider: what does this perspective find most absurd or infuriating about the topic? What behaviour or assumption does it want to expose or celebrate? What would a reader who shares this view find cathartic or vindicating about the punchline? Let these questions shape every panel's visual and dialogue choices.`;

const getStyleCraftNote = (style: string): string =>
    STYLE_CRAFT_NOTES[style.toLowerCase()] ??
    `CUSTOM STYLE — "${style}": Before designing panels, analyse what this comedic register implies: What is the emotional tone (warm, cold, angry, bewildered)? What pacing does it demand (slow build or rapid fire)? What kind of punchline does it favour (a twist, a visual gag, a bleak non-resolution, a triumphant reversal)? What should characters sound like in their dialogue? Apply all of these inferred qualities consistently across every panel. Commit fully to this register — never break it.`;


// Helper to get illustration style description
const getIllustrationStyleDescription = (styleValue?: string): string => {
    if (!styleValue) return 'A standard full-color retro newspaper comic panel style.';
    const selectedOption = ILLUSTRATION_STYLE_OPTIONS.find(opt => opt.value === styleValue);
    return selectedOption ? selectedOption.description : styleValue;
};


// Constructs the user's specific request to be sent as the main content.
const constructPlanContents = (formData: ComicFormData, numPlans: number): string => {
    const { topic, stance, comedicStyle, illustrationStyle, referenceImages } = formData;
    const styleDescription = getIllustrationStyleDescription(illustrationStyle);
    const stanceGuidance = getStanceGuidance(stance);
    const styleCraftNote = getStyleCraftNote(comedicStyle);

    let referenceImageInfo = '';
    if (referenceImages && referenceImages.length > 0) {
        referenceImageInfo = `\n**Reference Images Provided:**\nThe user has supplied reference images. Use them as the visual foundation for characters/settings. Tag them precisely in consistency_tags:\n${referenceImages.map(img => `- "${img.tag}"`).join('\n')}\n`;
    }

    if (numPlans > 1) {
        // Brainstorm mode: force three structurally distinct comedic approaches
        return `
Generate exactly 3 comic strip concepts about the topic below. Each concept MUST use a fundamentally different comedic approach — do not let them feel like variations of the same idea.

**Mandatory structural variety:**
- Concept 1 — VISUAL/PHYSICAL: The comedy lives almost entirely in the image. Minimal or no dialogue. A sight gag, visual absurdity, or slapstick mishap carries the punchline. Think Buster Keaton, not a stand-up comedian.
- Concept 2 — IRONIC REVERSAL: Build the strip around a strong dramatic or verbal irony. The reader knows something characters don't, or characters say the exact opposite of what they mean. Dialogue is central but kept short.
- Concept 3 — ABSURD ESCALATION: One impossible or surreal premise, followed ruthlessly to its logical extreme. Each panel the situation gets more ridiculous but remains internally consistent. No one in the strip finds this strange.

**Creative Brief:**
- **Topic:** ${topic}
- **Angle:** ${stanceGuidance}
- **Comedic Register:** ${styleCraftNote}
- **Illustration Style:** ${styleDescription}
${referenceImageInfo}
Remember: write the "premise" field first for each concept before designing panels. That one sentence is your anchor.
`;
    }

    return `
Generate a single comic strip plan about the topic below.

**Creative Brief:**
- **Topic:** ${topic}
- **Angle:** ${stanceGuidance}
- **Comedic Register:** ${styleCraftNote}
- **Illustration Style:** ${styleDescription}
${referenceImageInfo}
Remember: write the "premise" field first before designing panels. That one sentence anchors the entire strip.
`;
};

// Prompt constructor for image generation/refinement
const constructImagePrompt = (
    basePrompt: string,
    consistencyTags: string[],
    illustrationStyle?: string,
    comedicStyle?: ComedicStyle,
    refinementPrompt?: string
): string => {
    const styleDescription = getIllustrationStyleDescription(illustrationStyle);

    const mainInstruction = refinementPrompt
        ? `Refine the provided image based on these instructions: "${refinementPrompt}".`
        : `Generate a comic panel image based on the following description.`;
    
    // FIX: Add a defensive check to prevent a crash if the AI omits consistency_tags.
    const safeConsistencyTags = consistencyTags || [];

    return `
${mainInstruction}

**Visual Description:**
${basePrompt}

**Art Style Guidance:**
- **Overall Style:** ${styleDescription}
- **Comedic Tone:** The image should reflect a ${comedicStyle} tone.
- **Consistency Cues:** Maintain visual consistency for these elements: ${safeConsistencyTags.join(', ')}.

CRITICAL INSTRUCTION: Generate ARTWORK ONLY. There must be absolutely no legible or illegible text, words, letters, numbers, or symbols of any kind in the generated image. If a sign or object would normally contain text, render it as a blank surface or with a simple abstract pattern instead. This is a strict rule.

If reference images are provided, use them as a strong visual guide for characters, objects, and overall style. The final output should be a single comic panel image.
`;
};

// --- API Functions ---

/**
 * FIX: Replaced the comic plan sanitization function with a highly defensive, imperative "builder" version.
 * This new function constructs a guaranteed-valid comic plan object from scratch, validating every property
 * from the AI's response. This is the most robust possible defense against malformed data and will permanently
 * resolve the recurring "Cannot read properties of undefined (reading 'length')" error.
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
        aspect_ratio: '1:1',
      };

      if (typeof p.slug === 'string') newPanel.slug = p.slug;
      if (typeof p.visual_prompt === 'string') newPanel.visual_prompt = p.visual_prompt;
      if (['small', 'medium', 'large'].includes(p.size)) newPanel.size = p.size;
      if (['establish', 'escalate', 'punchline', 'button'].includes(p.comedic_role)) {
          newPanel.comedic_role = p.comedic_role;
      }

      if (Array.isArray(p.text_elements)) {
          for (const el of p.text_elements) {
              if (typeof el === 'object' && el !== null && typeof el.text === 'string' && typeof el.role === 'string') {
                  newPanel.text_elements.push({ text: el.text, role: el.role as any });
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


const generateSingleComicPlan = async (formData: ComicFormData, userProvidedImages: ProcessedReferenceImage[]): Promise<ComicPlan> => {
    const contents = constructPlanContents(formData, 1);
    const parts = [
        { text: contents },
        ...userProvidedImages.map(img => ({
            inlineData: {
                data: img.base64,
                mimeType: img.mimeType
            }
        }))
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

    try {
        const jsonText = result.text.trim();
        if (!jsonText) {
            console.error("AI returned empty text for single comic plan.");
            throw new Error("The AI returned an empty response. Please try again.");
        }
        const rawPlan = JSON.parse(jsonText);
        // --- DEBUG LOGGING ---
        console.log("Raw plan from AI:", JSON.stringify(rawPlan, null, 2));
        return sanitizeComicPlan(rawPlan);
    } catch (e) {
        console.error("Failed to parse comic plan JSON:", e);
        console.error("Received text:", result.text);
        throw new Error("The AI returned an invalid story plan. Please try regenerating.");
    }
};

const generateMultipleComicPlans = async (formData: ComicFormData, userProvidedImages: ProcessedReferenceImage[]): Promise<ComicPlan[]> => {
    const contents = constructPlanContents(formData, 3); // Ask for 3 ideas
    const parts = [
        { text: contents },
        ...userProvidedImages.map(img => ({
            inlineData: {
                data: img.base64,
                mimeType: img.mimeType
            }
        }))
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

    try {
        const jsonText = result.text.trim();
        if (!jsonText) {
            console.error("AI returned empty text for multiple comic plans.");
            throw new Error("The AI returned an empty response. Please try again.");
        }
        const rawPlans = JSON.parse(jsonText);
        // --- DEBUG LOGGING ---
        console.log("Raw plans from AI:", JSON.stringify(rawPlans, null, 2));

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

const generatePanelImageWithReferences = async (
    visual_prompt: string,
    consistency_tags: string[],
    illustrationStyle?: string,
    comedicStyle?: ComedicStyle,
    userProvidedImages: ProcessedReferenceImage[] = []
): Promise<string> => {
    const prompt = constructImagePrompt(visual_prompt, consistency_tags, illustrationStyle, comedicStyle);
    const parts = [
        { text: prompt },
        ...userProvidedImages.map(img => ({
            inlineData: { data: img.base64, mimeType: img.mimeType }
        }))
    ];

    const result = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: { parts },
        config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT]
        }
    });

    const imagePart = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData);

    if (imagePart?.inlineData) {
        return imagePart.inlineData.data;
    }
    
    throw new Error('Image generation failed: The AI did not return an image.');
};

const refinePanelImage = async (
    baseImage: string, // base64
    refinementPrompt: string,
    illustrationStyle?: string,
    comedicStyle?: ComedicStyle,
    userProvidedImages: ProcessedReferenceImage[] = []
): Promise<string> => {
    const prompt = constructImagePrompt(
        "The user wants to modify the provided image.",
        [], // Consistency tags are less relevant for a direct refinement prompt
        illustrationStyle,
        comedicStyle,
        refinementPrompt
    );

    const parts = [
        { inlineData: { data: baseImage, mimeType: 'image/png' } },
        { text: prompt },
        ...userProvidedImages.map(img => ({
            inlineData: { data: img.base64, mimeType: img.mimeType }
        }))
    ];

    const result = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: { parts },
        config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT]
        }
    });

    const imagePart = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData);

    if (imagePart?.inlineData) {
        return imagePart.inlineData.data;
    }
    
    throw new Error('Image refinement failed: The AI did not return an image.');
};

const generateContextExplainer = async (title: string, summary: string): Promise<string> => {
    const contents = `
    The following is the title and summary of a satirical comic strip. Write a brief, neutral, one-paragraph explanation (2-3 sentences) of the real-world context or news event that this comic is likely referencing. Be concise and informative, like an archivist's note.
    
    **Title:** "${title}"
    **Summary:** "${summary}"
    
    **Context Explanation:**
    `;

    try {
        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents,
            // Low temperature for factual, non-creative response
            config: { temperature: 0.1 }
        });
        return result.text;
    } catch (error) {
        console.error("Failed to generate context explainer:", error);
        // Return a fallback message instead of throwing an error to avoid breaking the main flow
        return "Could not generate context at this time.";
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