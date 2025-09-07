import { GoogleGenAI, Type, Modality, GenerateContentResponse } from "@google/genai";
import { FormData, ComicPlan } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

const comicPlanSchema = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING, description: "A witty, short title for the comic strip (max 6 words)." },
        panels: {
            type: Type.ARRAY,
            description: "An array of 3 to 6 panels for the comic strip.",
            items: {
                type: Type.OBJECT,
                properties: {
                    slug: { type: Type.STRING, description: "A short, descriptive slug for the panel's content." },
                    visual_prompt: {
                        type: Type.STRING,
                        description: "A detailed visual description for an AI image generator. Focus on characters, setting, action, and composition. DO NOT include any text, letters, speech bubbles, captions, or sound effects in this visual description."
                    },
                    caption: { type: Type.STRING, description: "A short, witty caption for the panel (max 15 words)." },
                    bubbles: {
                        type: Type.ARRAY,
                        description: "Speech or thought bubbles in the panel.",
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                text: { type: Type.STRING, description: "The text inside the bubble (max 18 words)." },
                                positionHint: {
                                    type: Type.STRING,
                                    enum: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'],
                                    description: "A hint for where to place the bubble to avoid obscuring important details."
                                }
                            },
                             required: ["text"]
                        }
                    },
                    sfx: {
                        type: Type.ARRAY,
                        description: "Sound effects in the panel.",
                        items: {
                             type: Type.OBJECT,
                             properties: {
                                text: { type: Type.STRING, description: "The sound effect text (e.g., 'BAM!', 'POW!')." },
                                positionHint: {
                                    type: Type.STRING,
                                    enum: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'],
                                    description: "A hint for where to place the sound effect."
                                }
                            },
                            required: ["text"]
                        }
                    },
                    consistency_tags: {
                        type: Type.ARRAY,
                        description: "Keywords to maintain visual consistency for characters/props (e.g., 'man with red hat', 'blue striped cat').",
                        items: { type: Type.STRING }
                    },
                    layout: {
                        type: Type.STRING,
                        enum: ['standard', 'large', 'double-width'],
                        description: "The visual size and importance of the panel. Use 'large' or 'double-width' for establishing shots, key actions, or the final punchline."
                    }
                },
                required: ["slug", "visual_prompt", "layout"]
            }
        }
    },
    required: ["title", "panels"]
};

/**
 * A higher-order function that adds retry logic with exponential backoff to an API call.
 * @param apiCall The function that makes the API call.
 * @returns The result of the API call.
 */
const withRetry = async <T>(apiCall: () => Promise<T>): Promise<T> => {
    const maxRetries = 3;
    let attempt = 0;
    let delay = 4000; // 4 seconds initial delay

    while (attempt < maxRetries) {
        try {
            return await apiCall();
        } catch (error: any) {
             if (error.message && (error.message.includes('429') || error.message.includes('RESOURCE_EXHAUSTED'))) {
                attempt++;
                if (attempt >= maxRetries) {
                     // Throw a more user-friendly error after the last attempt fails.
                     throw new Error("You've exceeded the API request limit. Please wait a minute and try again.");
                }
                console.warn(`Rate limit hit. Retrying in ${delay / 1000}s... (Attempt ${attempt}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Exponential backoff
            } else {
                throw error; // Re-throw other errors immediately
            }
        }
    }
    // This part of the code should be unreachable, but it's here as a fallback.
    throw new Error("Operation failed after multiple retries.");
};


const generateComicPlan = async (formData: FormData, referenceImages: { base64: string, mimeType: string }[]): Promise<ComicPlan> => {
    return withRetry(async () => {
        const { topic, pov, tone } = formData;
        const systemInstruction = `You are a veteran newspaper comics writer and artist. Your task is to create a plan for a short, witty comic strip based on the user's topic.
        - Strategically decide the number of panels (between 3 and 6) to best tell the story.
        - For each panel, provide a detailed visual prompt, any dialogue or captions, and specify a layout size ('standard', 'large', 'double-width') to create narrative impact. Use larger panels for important moments.
        - Ensure all text is witty and concise.
        - Provide consistency tags to help the illustrator maintain character and object appearance.
        - Output ONLY a valid JSON object that adheres to the provided schema. Do not use markdown.`;

        const userPrompt = `
        TOPIC: "${topic}"
        POINT OF VIEW: "${pov}"
        TONE: "${tone}"
        `;

        const parts: any[] = [{ text: userPrompt }];
        if (referenceImages.length > 0) {
            parts.unshift({ text: "Use the following user-provided images as a strong visual reference for characters, style, or objects." });
            for (const img of referenceImages) {
                parts.push({
                    inlineData: {
                        data: img.base64,
                        mimeType: img.mimeType,
                    },
                });
            }
        }

        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ role: 'user', parts }],
            config: {
                systemInstruction,
                responseMimeType: 'application/json',
                responseSchema: comicPlanSchema,
            },
        });

        const responseText = result.text;
        return JSON.parse(responseText) as ComicPlan;
    });
};

const generatePanelImage = async (prompt: string, referenceImages: { base64: string, mimeType: string }[], extraConsistencyTags: string[] = []): Promise<string> => {
    return withRetry(async () => {
        const fullPrompt = `
          A single comic book panel.
          Style: Retro black & white newspaper comic. Halftone shading. Paper grain texture. Slight ink bleed and print misregistration. No color. Clean line art, readable composition.
          Scene: ${prompt}
          ${extraConsistencyTags.length > 0 ? `Important consistency details to include: ${extraConsistencyTags.join(', ')}.` : ''}
          Negative prompt: Do not include any words, letters, text, or color.
        `;

        const parts: any[] = [{ text: fullPrompt }];
        if (referenceImages.length > 0) {
             for (const img of referenceImages) {
                parts.push({
                    inlineData: {
                        data: img.base64,
                        mimeType: img.mimeType,
                    },
                });
            }
        }
        
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: { parts },
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT],
            },
        });

        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            return part.inlineData.data;
          }
        }
        throw new Error("No image was generated by the request.");
    });
};


export const geminiService = {
  generateComicPlan,
  generatePanelImage,
};