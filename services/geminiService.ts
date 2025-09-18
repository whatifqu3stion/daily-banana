// FIX: The original file started with an invalid line of text that caused parsing errors. It has been removed.
// services/geminiService.ts
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { ComicFormData, ComicPlan, ProcessedReferenceImage, ComedicStyle } from '../types';
import { ILLUSTRATION_STYLE_OPTIONS } from '../constants';

// According to guidelines, API key must be from process.env.API_KEY
// The user has been instructed that this will be available.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Schemas for comic plan generation
const comicPlanSchema = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING, description: 'A catchy, newspaper-style title for the comic strip.' },
        summary: { type: Type.STRING, description: 'A one-sentence summary of the comic\'s story or joke.' },
        panels: {
            type: Type.ARRAY,
            description: 'An array of panel objects, representing the sequence of the comic strip. Usually 3-4 panels.',
            items: {
                type: Type.OBJECT,
                properties: {
                    slug: { type: Type.STRING, description: 'A short, URL-friendly identifier for the panel, e.g., "senator-confused".' },
                    visual_prompt: {
                        type: Type.STRING,
                        description: 'A detailed description for an image generation model, outlining the scene, characters, actions, and emotions. This should NOT contain any text, speech bubbles, or captions.'
                    },
                    text_elements: {
                        type: Type.ARRAY,
                        description: 'All text content for the panel, including speech, thoughts, sound effects, and captions.',
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                text: { type: Type.STRING, description: 'The text content.' },
                                role: { type: Type.STRING, description: 'The role of the text: "speech", "thought", "sfx", or "caption".' },
                            },
                            required: ['text', 'role'],
                        },
                    },
                    consistency_tags: {
                        type: Type.ARRAY,
                        description: 'An array of descriptive tags for maintaining visual consistency of characters and settings across panels (e.g., "Senator Higgins with red tie", "oak desk").',
                        items: { type: Type.STRING }
                    },
                    size: {
                        type: Type.STRING,
                        description: 'A layout hint for the panel\'s relative size: "small", "medium", or "large".'
                    },
                    aspect_ratio: {
                        type: Type.STRING,
                        description: 'The aspect ratio of the panel, which must be "1:1".'
                    }
                },
                required: ['slug', 'visual_prompt', 'text_elements', 'consistency_tags', 'size', 'aspect_ratio']
            }
        }
    },
    required: ['title', 'summary', 'panels']
};

const multipleComicPlansSchema = {
    type: Type.ARRAY,
    description: "An array of 2 to 3 distinct comic plan objects.",
    items: comicPlanSchema
};


// Helper to get illustration style description
const getIllustrationStyleDescription = (styleValue?: string): string => {
    if (!styleValue) return 'A standard full-color retro newspaper comic panel style.';
    const selectedOption = ILLUSTRATION_STYLE_OPTIONS.find(opt => opt.value === styleValue);
    return selectedOption ? selectedOption.description : styleValue;
};


// Prompt constructor for comic plan
const constructPlanPrompt = (formData: ComicFormData, numPlans: number): string => {
    const { topic, stance, comedicStyle, illustrationStyle, referenceImages } = formData;
    const styleDescription = getIllustrationStyleDescription(illustrationStyle);

    let referenceImageInfo = '';
    if (referenceImages && referenceImages.length > 0) {
        referenceImageInfo = `The user has provided reference images. Pay close attention to them for visual consistency. The images are tagged as follows:\n${referenceImages.map(img => `- "${img.tag}"`).join('\n')}\nUse these tags in your consistency tags.`;
    }

    const planCountInstruction = numPlans > 1
        ? `Generate ${numPlans} completely distinct and creative comic strip ideas based on the user's request.`
        : `Generate a creative comic strip plan based on the user's request.`;

    return `
You are a creative and witty comic strip writer. Your task is to generate a plan for a short comic strip (usually 3-4 panels). The output must be a valid JSON object that adheres to the provided schema.

**Comic Request:**
- **Topic:** ${topic}
- **Your Stance/Angle:** ${stance}
- **Comedic Style:** ${comedicStyle}
- **Intended Illustration Style:** ${styleDescription}
${referenceImageInfo}

**Instructions:**
1.  ${planCountInstruction}
2.  The "visual_prompt" for each panel must be a detailed description for an AI image generator. It should describe the scene, characters, composition, and actions. **DO NOT include any text, speech, or captions in the visual prompt itself.**
3.  All text content (speech, captions, sound effects) must be in the "text_elements" array.
4.  Create "consistency_tags" for any recurring characters or key objects to help the image generator maintain a consistent look. If reference images were provided, use their tags here.
5.  Vary panel sizes ('small', 'medium', 'large') to create a dynamic layout. Ensure the total number of panels is between 2 and 6.
6.  The aspect ratio for all panels must be '1:1'.
7.  Ensure the final output is a single, valid JSON object (or an array of objects if multiple plans were requested) with no extra text or markdown formatting.
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

const generateSingleComicPlan = async (formData: ComicFormData, userProvidedImages: ProcessedReferenceImage[]): Promise<ComicPlan> => {
    const prompt = constructPlanPrompt(formData, 1);
    const parts = [
        { text: prompt },
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
            responseMimeType: 'application/json',
            responseSchema: comicPlanSchema
        }
    });

    try {
        const jsonText = result.text.trim();
        const plan = JSON.parse(jsonText) as ComicPlan;

        // FIX: Defensively sanitize the AI's output to prevent crashes.
        // This ensures `panels` is always a valid array, even if the AI omits it.
        if (plan) {
            plan.panels = (plan.panels || []).filter(Boolean); // Handle missing array and null entries.
        }

        return plan;
    } catch (e) {
        console.error("Failed to parse comic plan JSON:", e);
        console.error("Received text:", result.text);
        throw new Error("The AI returned an invalid story plan. Please try regenerating.");
    }
};

const generateMultipleComicPlans = async (formData: ComicFormData, userProvidedImages: ProcessedReferenceImage[]): Promise<ComicPlan[]> => {
    const prompt = constructPlanPrompt(formData, 3); // Ask for 3 ideas
    const parts = [
        { text: prompt },
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
            responseMimeType: 'application/json',
            responseSchema: multipleComicPlansSchema,
        }
    });

    try {
        const jsonText = result.text.trim();
        const plans = JSON.parse(jsonText) as ComicPlan[];

        if (!Array.isArray(plans)) {
            console.error("AI did not return an array for multiple plans. Received:", plans);
            throw new Error("The AI returned an invalid set of story ideas. Please try regenerating.");
        }
        
        // Filter out any null/undefined plans from the top-level array.
        const validPlans = plans.filter(Boolean);

        // FIX: Defensively sanitize the panels within each valid plan.
        validPlans.forEach(plan => {
            plan.panels = (plan.panels || []).filter(Boolean);
        });

        return validPlans;
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
        model: 'gemini-2.5-flash-image-preview',
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
        model: 'gemini-2.5-flash-image-preview',
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

// Exported service object
export const geminiService = {
    generateSingleComicPlan,
    generateMultipleComicPlans,
    generatePanelImageWithReferences,
    refinePanelImage
};