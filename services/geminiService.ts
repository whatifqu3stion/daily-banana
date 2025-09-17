// services/geminiService.ts
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { ComicFormData, ComicPlan, ProcessedReferenceImage, ComedicStyle } from '../types';
import { ILLUSTRATION_STYLE_OPTIONS } from '../constants';

let ai: GoogleGenAI;

/**
 * Lazily initializes and returns the GoogleGenAI instance.
 * This prevents the app from crashing on load if the API key is not immediately available.
 */
const getAi = (): GoogleGenAI => {
    if (!ai) {
        // FIX: Use process.env.API_KEY as per the guidelines, which resolves the 'env' property error.
        const apiKey = process.env.API_KEY;
        if (!apiKey) {
            // This error will be caught by the UI and displayed to the user.
            throw new Error("The API_KEY environment variable is not set. Please follow the setup instructions.");
        }
        ai = new GoogleGenAI({ apiKey });
    }
    return ai;
};


const comicPlanSchema = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING, description: "A witty, short title for the comic strip (max 8 words)." },
        summary: { type: Type.STRING, description: "A very short, one-sentence summary of the story's concept and punchline. Max 20 words." },
        panels: {
            type: Type.ARRAY,
            description: "An array of 1 to 6 panels for the comic strip.",
            items: {
                type: Type.OBJECT,
                properties: {
                    slug: { type: Type.STRING, description: "A short, descriptive slug for the panel's content (e.g., 'Senator confused by AI')." },
                    visual_prompt: { 
                        type: Type.STRING, 
                        description: "A detailed, specific visual prompt for an image generation model. Describe the scene, characters, actions, emotions, and composition. For characters from reference images, use their tags (e.g., '[SENATOR_X]')." 
                    },
                    text_elements: {
                        type: Type.ARRAY,
                        description: "All text elements within the panel (speech, captions, etc.). Can be empty.",
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                text: { type: Type.STRING, description: "The text content." },
                                role: { 
                                    type: Type.STRING, 
                                    enum: ['speech', 'thought', 'sfx', 'caption'],
                                    description: "The role of the text element."
                                },
                                position: {
                                    type: Type.OBJECT,
                                    description: "Position of the element's top-left corner as percentages of the panel's dimensions (e.g., {x: '10%', y: '15%'}).",
                                    properties: {
                                        x: { type: Type.STRING, description: "X-coordinate (e.g., '10%')." },
                                        y: { type: Type.STRING, description: "Y-coordinate (e.g., '15%')." }
                                    },
                                    required: ['x', 'y']
                                },
                                size: {
                                    type: Type.OBJECT,
                                    description: "Size of the element as percentages of the panel's dimensions (e.g., {width: '30%', height: '20%'}).",
                                    properties: {
                                        width: { type: Type.STRING, description: "Width (e.g., '30%')." },
                                        height: { type: Type.STRING, description: "Height (e.g., '20%')." }
                                    },
                                    required: ['width', 'height']
                                }
                            },
                            required: ['text', 'role', 'position', 'size']
                        }
                    },
                    consistency_tags: {
                        type: Type.ARRAY,
                        description: "An array of keywords or tags to ensure visual consistency for this panel, especially for characters or settings. For characters from reference images, use their tags (e.g., '[SENATOR_X]').",
                        items: { type: Type.STRING }
                    },
                    size: {
                        type: Type.STRING,
                        enum: ['small', 'medium', 'large'],
                        description: "The intended layout size of the panel. 'small' is 1/3 width, 'medium' is 1/2, 'large' is full width."
                    },
                    aspect_ratio: {
                        type: Type.STRING,
                        enum: ['1:1'],
                        description: "The aspect ratio of the panel. MUST be '1:1'."
                    }
                },
                required: ['slug', 'visual_prompt', 'text_elements', 'consistency_tags', 'size', 'aspect_ratio']
            }
        }
    },
    required: ['title', 'summary', 'panels']
};

const createBasePrompt = (formData: ComicFormData, userProvidedImages: ProcessedReferenceImage[]) => {
    const { topic, stance, comedicStyle, illustrationStyle } = formData;
    
    // Find the style option; if it exists, use its description.
    // Otherwise, use the illustrationStyle string directly (as it's a custom user input).
    const styleOption = ILLUSTRATION_STYLE_OPTIONS.find(opt => opt.value === illustrationStyle);
    const styleDetails = styleOption ? styleOption.description : illustrationStyle || 'A standard comic style.';

    const referenceImageTags = userProvidedImages.map(img => img.tag).filter(Boolean);
    const referenceImagePrompt = referenceImageTags.length > 0
        ? `Key reference characters/objects are tagged as: ${referenceImageTags.join(', ')}. Use these tags like [TAG_NAME] in visual prompts.`
        : 'No reference images were provided.';
    
    const isSinglePanelGag = illustrationStyle === 'magazine-gag';
    const panelInstructions = isSinglePanelGag
        ? "Create a single panel. It MUST be 'large' size."
        : "Create a sequence of 3 to 6 panels.";

    return `
    You are a master comic strip writer and artist.

    **Topic:** ${topic}
    **Stance (The comic's message):** ${stance}
    **Comedic Style (The humor's delivery):** ${comedicStyle}
    **Illustration Style:** ${styleDetails}
    **Reference Images:** ${referenceImagePrompt}

    **Instructions for Each Plan:**
    1.  Create a short, witty title (max 8 words).
    2.  Write a concise 'summary' of the entire comic strip's concept and punchline (max 20 words).
    3.  ${panelInstructions}
    4.  For each panel:
        -   Write a concise 'slug'.
        -   Write a detailed 'visual_prompt' for an image generation model. Describe the scene, characters (using their tags like [TAG_NAME] if provided), actions, composition, and emotions. **Do not mention the illustration style in the prompt.** It will be applied separately.
        -   Define all 'text_elements' (speech, captions, etc.) with their text, role, and approximate position/size as percentages.
        -   List 'consistency_tags' to help maintain visual continuity, especially for recurring characters or settings. Use the reference image tags here.
        -   Choose a 'size' ('small', 'medium', 'large') to control the layout.
        -   The 'aspect_ratio' for all panels **MUST** be '1:1'.
    5.  The final output must be a valid JSON object/array that strictly adheres to the provided schema.
    `;
};

const generateSingleComicPlan = async (formData: ComicFormData, userProvidedImages: ProcessedReferenceImage[]): Promise<ComicPlan> => {
    const ai = getAi();
    const basePrompt = createBasePrompt(formData, userProvidedImages);
    const prompt = `${basePrompt}\nYour task is to create a single, high-quality plan for a comic strip.`;
    
    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: comicPlanSchema,
        },
    });

    const jsonText = result.text.trim();
    try {
        return JSON.parse(jsonText) as ComicPlan;
    } catch (e) {
        console.error("Failed to parse comic plan JSON:", jsonText);
        throw new Error("The AI returned an invalid comic plan. Please try again.");
    }
};


const generateMultipleComicPlans = async (formData: ComicFormData, userProvidedImages: ProcessedReferenceImage[]): Promise<ComicPlan[]> => {
    const ai = getAi();
    const basePrompt = createBasePrompt(formData, userProvidedImages);
    const prompt = `${basePrompt}\nYour task is to create a list of 3 distinct plans for a comic strip. Each plan should be a unique take on the topic.`;


    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.ARRAY,
                items: comicPlanSchema
            },
        },
    });

    const jsonText = result.text.trim();
    try {
        return JSON.parse(jsonText) as ComicPlan[];
    } catch (e) {
        console.error("Failed to parse comic plans JSON:", jsonText);
        throw new Error("The AI returned an invalid set of comic plans. Please try again.");
    }
};


const generatePanelImageWithReferences = async (
    visual_prompt: string,
    consistency_tags: string[],
    illustrationStyle: string | undefined,
    comedicStyle: ComedicStyle | undefined,
    references: ProcessedReferenceImage[]
): Promise<string> => {
    const ai = getAi();
    const styleOption = ILLUSTRATION_STYLE_OPTIONS.find(opt => opt.value === illustrationStyle);
    const styleDetails = styleOption ? styleOption.description : illustrationStyle || 'A standard comic style.';


    const fullPrompt = `
        Visual Prompt: "${visual_prompt}"
        Style: ${styleDetails}
        Comedic Style: ${comedicStyle}
        Consistency Cues: ${consistency_tags.join(', ')}
        
        Generate an image based on the prompt, adhering to the style, tone, and consistency cues.
        If reference images are provided, use them as strong guides for the appearance of tagged characters and objects.
    `;

    const textPart = { text: fullPrompt };
    const imageParts = references.map(ref => ({
        inlineData: {
            data: ref.base64,
            mimeType: ref.mimeType,
        },
    }));

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: {
            parts: [...imageParts, textPart],
        },
        config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
    });

    const imagePart = result.candidates?.[0]?.content?.parts?.find(part => part.inlineData);

    // FIX: Corrected typo from 'imagepart' to 'imagePart'.
    if (!imagePart || !imagePart.inlineData) {
        console.error("No image part found in response:", result);
        throw new Error("The AI failed to generate an image for the panel.");
    }
    
    return imagePart.inlineData.data;
};

const refinePanelImage = async (
    baseImage: string, // base64
    refinementPrompt: string,
    illustrationStyle: string | undefined,
    comedicStyle: ComedicStyle | undefined,
    references: ProcessedReferenceImage[]
): Promise<string> => {
    const ai = getAi();
    const styleOption = ILLUSTRATION_STYLE_OPTIONS.find(opt => opt.value === illustrationStyle);
    const styleDetails = styleOption ? styleOption.description : illustrationStyle || 'A standard comic style.';

    const fullPrompt = `
        Refine the provided base image according to these instructions: "${refinementPrompt}"
        
        Maintain the overall style, but incorporate the changes.
        Original Style Context: ${styleDetails}
        Original Comedic Style Context: ${comedicStyle}
    `;

    const textPart = { text: fullPrompt };
    const baseImagePart = {
        inlineData: {
            data: baseImage,
            mimeType: 'image/png', // Assume png for simplicity
        },
    };
    const referenceImageParts = references.map(ref => ({
        inlineData: {
            data: ref.base64,
            mimeType: ref.mimeType,
        },
    }));

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: {
            parts: [baseImagePart, ...referenceImageParts, textPart],
        },
        config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
    });

    const imagePart = result.candidates?.[0]?.content?.parts?.find(part => part.inlineData);

    if (!imagePart || !imagePart.inlineData) {
        console.error("No image part found in refinement response:", result);
        throw new Error("The AI failed to refine the image.");
    }

    return imagePart.inlineData.data;
};

// FIX: Export a geminiService object containing the service functions.
export const geminiService = {
    generateSingleComicPlan,
    generateMultipleComicPlans,
    generatePanelImageWithReferences,
    refinePanelImage,
};