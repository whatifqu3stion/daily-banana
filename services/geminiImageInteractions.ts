import { createImageInteraction, type ImageInteractionInput } from './geminiConnection';
import type { AspectRatio, ProcessedReferenceImage } from '../types';

const IMAGE_GENERATION_ATTEMPTS = 3;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// The rest of the comic pipeline stores PNG base64, including refinement input.
// Interactions supports JPEG output in the installed SDK; normalize it once here
// so exports and subsequent edits never label JPEG bytes as image/png.
async function toPanelPng(data: string, mimeType: string): Promise<string> {
  if (mimeType === 'image/png') return data;
  const image = new Image();
  image.src = `data:${mimeType};base64,${data}`;
  try {
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable.');
    context.drawImage(image, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  } catch {
    throw new Error('Google returned an image that could not be prepared for the comic. Please try again.');
  }
}

export async function generatePanelInteraction(
  prompt: string,
  references: ProcessedReferenceImage[],
  model: string,
  aspectRatio: AspectRatio = '1:1',
  baseImage?: string,
): Promise<string> {
  const input: ImageInteractionInput[] = [
    ...(baseImage ? [{ type: 'image' as const, data: baseImage, mime_type: 'image/png' }] : []),
    { type: 'text', text: prompt },
    ...references.flatMap<ImageInteractionInput>(image => [
      { type: 'text', text: image.tag || 'User-supplied reference image — match the style, characters, or setting shown.' },
      { type: 'image', data: image.base64, mime_type: image.mimeType },
    ]),
  ];

  for (let attempt = 1; attempt <= IMAGE_GENERATION_ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(1000 * (attempt - 1));
    // Transport, quota, permission, policy, and failed-interaction errors are
    // definitive: only completed responses without an image are retried.
    const result = await createImageInteraction({
      model,
      input,
      response_format: {
        type: 'image',
        mime_type: 'image/jpeg',
        aspect_ratio: aspectRatio,
        ...(model === 'gemini-2.5-flash-image' ? {} : { image_size: '2K' as const }),
      },
    });
    const image = result.output_image;
    if (image?.data) return toPanelPng(image.data, image.mime_type || 'image/jpeg');
    const text = result.output_text || '';
    // A clear textual refusal is not a transient missing-image response.
    if (/\b(?:safety|content policy|content filter|not allowed|cannot (?:generate|create|help)|can't (?:generate|create|help)|unable to (?:generate|create|help))\b/i.test(text)) {
      throw new Error('Google declined this image request. Try rephrasing the panel description or refinement.');
    }
  }
  throw new Error(`Image ${baseImage ? 'refinement' : 'generation'} failed: Google did not return an image after multiple attempts. Please try again.`);
}
