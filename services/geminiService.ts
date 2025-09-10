// services/geminiService.ts
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { ComicFormData, ComicPlan, ProcessedReferenceImage, Tone } from '../types';
import { ILLUSTRATION_STYLE_OPTIONS } from '../constants';

let ai: GoogleGenAI;

/**
 * Lazily initializes and returns the GoogleGenAI instance.
 * This prevents the app from crashing on load if the API key is not immediately available.
 */
const getAi = (): GoogleGenAI => {
    if (!ai) {
        // FIX: Per coding guidelines, API key must be retrieved from `process.env.API_KEY`. This also resolves the TypeScript error on 'import.meta.env'.
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
        panels: {
            type: Type.ARRAY,
            description: "An array of 3 to 6 panels for the comic strip.",
            items: {
                type: Type.OBJECT,
                properties: {
                    slug: { type: Type.STRING, description: "A short, descriptive slug for the panel's content." },
                    visual_prompt: {
                        type: Type.STRING,
                        description: "A detailed visual description for an AI image generator. Focus on characters, setting, action, and composition. CRITICAL: Do not include any text, letters, or words in this visual description."
                    },
                    text_elements: {
                        type: Type.ARRAY,
                        description: "All text elements for the panel. This includes speech, thoughts, captions, and sound effects.",
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                text: { type: Type.STRING, description: "The text content of the element." },
                                role: {
                                    type: Type.STRING,
                                    description: "The role of the text. Valid values: 'speech', 'thought', 'caption', 'sfx'."
                                },
                                position: {
                                    type: Type.OBJECT,
                                    description: "The top-left position of the element as percentage strings of the panel's dimensions. Example: { x: '10%', y: '15%' }.",
                                    properties: {
                                        x: { type: Type.STRING },
                                        y: { type: Type.STRING }
                                    },
                                    required: ["x", "y"]
                                },
                                size: {
                                    type: Type.OBJECT,
                                    description: "The size of the element as percentage strings of the panel's dimensions. Example: { width: '30%', height: '25%' }.",
                                    properties: {
                                        width: { type: Type.STRING },
                                        height: { type: Type.STRING }
                                    },
                                    required: ["width", "height"]
                                }
                            },
                            required: ["text", "role", "position", "size"]
                        }
                    },
                    consistency_tags: {
                        type: Type.ARRAY,
                        description: "CRITICAL: For each character/prop, create ONE hyper-specific tag that includes identity, appearance, and style (e.g., 'Senator Higgins (bald man, thick glasses, double chin, pinstripe suit)'). Use the exact same tag every time the character appears.",
                        items: { type: Type.STRING }
                    },
                    size: {
                        type: Type.STRING,
                        description: "The visual size/importance of the panel. Use 'large' for establishing shots or punchlines. Valid values: 'small', 'medium', 'large'."
                    },
                    aspect_ratio: {
                        type: Type.STRING,
                        description: "The shape of the panel. IMPORTANT: Always use '1:1' (square) for all panels."
                    }
                },
                required: ["slug", "visual_prompt", "size", "aspect_ratio"]
            }
        }
    },
    required: ["title", "panels"]
};

const withRetry = async <T>(apiCall: () => Promise<T>): Promise<T> => {
    const maxRetries = 4; // Increased from 3
    let attempt = 0;
    let delay = 5000; // Increased from 4000ms
    while (attempt < maxRetries) {
        try {
            return await apiCall();
        } catch (error: any) {
             if (error.message && (error.message.includes('429') || error.message.includes('RESOURCE_EXHAUSTED') || error.message.includes('rate limit'))) {
                attempt++;
                if (attempt >= maxRetries) {
                     // Re-throw the original error object to preserve its details for parsing in the UI.
                     throw error;
                }
                console.warn(`Rate limit hit. Retrying in ${delay / 1000}s... (Attempt ${attempt}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Delays will be 5s, 10s, 20s
            } else {
                throw error;
            }
        }
    }
    throw new Error("API call failed after multiple retries.");
};

const systemInstruction = `You are a creative and witty newspaper comics writer and layout artist. Your goal is to plan a 3-6 panel retro, full-color Sunday-style comic strip based on the user's topic.

Core Rules:
1.  **Story First:** Focus on a clear, compelling narrative with a setup, build-up, and a punchline. Good dialogue is essential.
2.  **Visual Variety:** Vary the camera shots. Use a mix of wide shots, medium shots, and close-ups to keep it visually interesting.
3.  **Compatibility:** You MUST return a single, valid JSON object that strictly follows the provided schema. Do not include any other text or prose in your response.
4.  **CRITICAL - Accurate Bubble Placement:** The placement of speech and thought bubbles is the most important part of your layout task. For each text element:
    a. First, identify which character in the 'visual_prompt' is speaking or thinking.
    b. Then, set the 'position' of the bubble so it is directly next to THAT character.
    c. **DO NOT** place the bubble near a character who is merely being mentioned in the text. For example, if a reporter says "Look, it's Senator Higgins!", the bubble must be near the reporter, NOT Senator Higgins.
    d. Position bubbles in empty space (e.g., sky, walls) to avoid covering important details.
5.  **No Baked-in Text:** All text (dialogue, thoughts, captions, SFX) MUST be in the 'text_elements' array. The 'visual_prompt' must describe visuals ONLY.
6.  **Hyper-Specific Tags:** For each character or key prop, create a single, highly detailed consistency tag that includes their name (if any) and physical description. For example: "Senator Higgins (bald man, thick glasses, double chin, pinstripe suit)". Use this EXACT same tag in every panel the character appears in.`;


const generateComicPlan = async (formData: ComicFormData, referenceImages: ProcessedReferenceImage[]): Promise<ComicPlan> => {
  return withRetry(async () => {
    const ai = getAi();
    const selectedStyle = ILLUSTRATION_STYLE_OPTIONS.find(opt => opt.value === formData.illustrationStyle) || ILLUSTRATION_STYLE_OPTIONS[0];
    let userPrompt = `TOPIC: ${formData.topic}\nPOV or MESSAGE: ${formData.pov}\nTONE: ${formData.tone}`;
    userPrompt += `\nILLUSTRATION STYLE: ${selectedStyle.description}`;
    
    const parts: any[] = [{ text: userPrompt }];

    if (referenceImages.length > 0) {
        let referenceText = "\n\nUse the provided reference images as the primary visual inspiration. Each image is tagged for context:\n";
        referenceImages.forEach((refImg, index) => {
            referenceText += `- Image ${index + 1}: ${refImg.tag || 'General reference'}\n`;
        });
        parts[0].text += referenceText;

        referenceImages.forEach(img => {
            parts.push({
                inlineData: { mimeType: img.mimeType, data: img.base64 }
            });
        });
    }

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: { parts },
        config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: comicPlanSchema,
        },
    });

    const jsonStr = response.text.trim();
    return JSON.parse(jsonStr) as ComicPlan;
  });
};

const generatePanelImageWithReferences = async (
  visualPrompt: string,
  consistencyTags: string[],
  styleValue: string | undefined,
  tone: Tone | undefined,
  referenceImages: ProcessedReferenceImage[]
): Promise<string> => {
  return withRetry(async () => {
    const ai = getAi();
    const parts: any[] = [];

    // 1. Add all user-provided reference images.
    referenceImages.forEach(img => {
      parts.push({
        inlineData: { mimeType: img.mimeType, data: img.base64 }
      });
    });

    const selectedStyle = ILLUSTRATION_STYLE_OPTIONS.find(opt => opt.value === styleValue) || ILLUSTRATION_STYLE_OPTIONS[0];
    
    // 2. Construct a clear text prompt for generation.
    let textPrompt = `Generate a single comic panel based on this description: "${visualPrompt}".`;
    if (consistencyTags.length > 0) {
      textPrompt += ` Pay close attention to these character/object tags: ${consistencyTags.join(', ')}.`;
    }
    if (referenceImages.length > 0) {
      textPrompt += ` Use the provided images as the primary visual references for characters, objects, and overall artistic style.`;
    }
    textPrompt += ` The artistic style is: ${selectedStyle.description}. The tone is ${tone || 'satirical'}. Ensure the final result is a vibrant, fun cartoon image. Do not add any text or signatures to the image itself.`;
    
    parts.push({ text: textPrompt });
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image-preview',
      contents: { parts },
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });

    if (!response.candidates || response.candidates.length === 0) {
      throw new Error("The image generation request was blocked, possibly due to safety filters. Please adjust your prompt.");
    }

    let imageFound: string | null = null;
    let textFeedback = '';

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        imageFound = part.inlineData.data;
      }
      if (part.text) {
        textFeedback = part.text;
      }
    }
    
    if (imageFound) {
      return imageFound;
    }

    if (textFeedback) {
      throw new Error(`Image generation failed. The model responded: "${textFeedback}"`);
    }

    throw new Error("No image was generated by the request. This could be due to a safety filter or an issue with the prompt.");
  });
};


const refinePanelImage = async (
  base64ImageData: string,
  refinementPrompt: string,
  styleValue?: string,
  tone?: Tone,
  referenceImages: ProcessedReferenceImage[] = []
): Promise<string> => {
  return withRetry(async () => {
    const ai = getAi();
    const parts: any[] = [];
    
    // 1. Add the main image to be edited as the first part.
    parts.push({
      inlineData: { mimeType: 'image/png', data: base64ImageData },
    });

    // 2. Add all user-provided reference images.
    referenceImages.forEach(img => {
      parts.push({
        inlineData: { mimeType: img.mimeType, data: img.base64 }
      });
    });

    const selectedStyle = ILLUSTRATION_STYLE_OPTIONS.find(opt => opt.value === styleValue) || ILLUSTRATION_STYLE_OPTIONS[0];
    
    // 3. Construct a clear text prompt that explains the roles of the different images.
    let textPrompt = `Refine the first image based on the following instruction: "${refinementPrompt}".`;
    if (referenceImages.length > 0) {
      textPrompt += " Use the other images provided as crucial visual references for characters, objects, and overall artistic style.";
    }
    textPrompt += ` Maintain the core style, which is described as: ${selectedStyle.description}. The tone is ${tone || 'satirical'}. Ensure the final result is a vibrant, fun cartoon image. Do not add any text or signatures.`;
    
    parts.push({ text: textPrompt });
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image-preview',
      contents: { parts },
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });

    if (!response.candidates || response.candidates.length === 0) {
      throw new Error("The image refinement request was blocked, possibly due to safety filters. Please adjust your refinement prompt.");
    }

    let imageFound: string | null = null;
    let textFeedback = '';

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        imageFound = part.inlineData.data;
      }
      if (part.text) {
        textFeedback = part.text;
      }
    }
    
    if (imageFound) {
      return imageFound;
    }

    if (textFeedback) {
      throw new Error(`Image refinement failed. The model responded: "${textFeedback}"`);
    }

    throw new Error("No image was generated by the request. This could be due to a safety filter or an issue with the prompt.");
  });
};

export const geminiService = {
  generateComicPlan,
  generatePanelImageWithReferences,
  refinePanelImage,
};