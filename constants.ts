// constants.ts — static option lists shared by the form UI and the AI prompt builders.
import { Stance, ComedicStyle, ImageModel } from './types';

export const STANCE_OPTIONS: { value: Stance; label: string }[] = [
  { value: 'supportive', label: 'Supportive (Pro)' },
  { value: 'critical', label: 'Critical' },
  { value: 'neutral', label: 'Neutral / Observational' },
];

export const COMEDIC_STYLE_OPTIONS: { value: ComedicStyle; label: string; tooltip: string }[] = [
  { value: 'satirical',   label: 'Satirical',              tooltip: 'Exposes real hypocrisy through sharp, specific exaggeration.' },
  { value: 'ironic',      label: 'Ironic',                 tooltip: 'Characters say or do the opposite of what they actually mean.' },
  { value: 'deadpan',     label: 'Deadpan',                tooltip: 'Everyone treats the completely absurd as totally routine.' },
  { value: 'absurdist',   label: 'Absurdist / Surreal',    tooltip: 'One impossible premise, followed ruthlessly to its logical conclusion.' },
  { value: 'slapstick',   label: 'Slapstick / Exaggerated',tooltip: 'Escalating physical chaos — bodies and objects misbehave.' },
  { value: 'dark-comedy', label: 'Dark Comedy',            tooltip: 'Bleakly funny — the comedy lives in nihilism and quiet resignation.' },
  { value: 'parody',      label: 'Parody / Pastiche',      tooltip: 'Imitates a specific real-world format (memo, ad, documentary) to make its point.' },
];

export const ILLUSTRATION_STYLE_OPTIONS: { value: string; label: string; description: string }[] = [
  { 
    value: 'default-color', 
    label: 'Default Color Style',
    description: 'A standard full-color retro newspaper comic panel style with vibrant colors and clean lines.'
  },
  { 
    value: 'sunday-funnies', 
    label: 'Sunday Funnies',
    description: 'A charming, colorful style like classic newspaper funnies. Use a bright, simple palette, rounded shapes, and focus on clear character expressions over detailed backgrounds.'
  },
  { 
    value: 'golden-age', 
    label: 'Golden Age Heroic',
    description: 'A style reminiscent of 1940s American superhero comics. Use a primary color palette (bold reds, yellows, blues), dynamic outlines, and a sense of action and drama.'
  },
  { 
    value: 'ligne-claire', 
    label: 'Ligne Claire',
    description: 'A "clear line" European comic style. Use crisp, precise, unvarying line weights for all objects and characters. Employ flat, block colors with minimal shading.'
  },
  { 
    value: 'magazine-gag', 
    label: 'Magazine Gag Cartoon',
    description: 'A witty, single-panel gag cartoon in the style of a classic magazine like The New Yorker. The final output will be a single large panel. Use a black and white aesthetic with a grayscale ink wash. The image should depict a single, static scene. The primary humor should come from a clever, dry, or satirical caption placed below the panel.'
  },
  { 
    value: 'modern-manga', 
    label: 'Modern Color Manga',
    description: 'A vibrant, modern manga style. Use dynamic, cinematic angles, expressive faces with large eyes, and a rich color palette with gradients and cell shading.'
  },
  { 
    value: 'underground-comix', 
    label: 'Underground Comix',
    description: 'An exaggerated, psychedelic style inspired by 1960s underground comix. Use a wild, high-saturation color palette, distorted and rubbery character anatomy, and dense, intricate background details.'
  },
];

export const IMAGE_MODEL_OPTIONS: {
  value: ImageModel;
  label: string;
  note: string;
  pricePerImage: number;
}[] = [
  {
    value: 'gemini-3.1-flash-image-preview',
    label: 'Flash Image 3.1',
    note: 'Higher quality · natively multimodal',
    pricePerImage: 0.067,
  },
  {
    value: 'gemini-2.5-flash-preview-image-generation',
    label: 'Flash Image 2.5',
    note: 'Fast · cost-effective',
    pricePerImage: 0.039,
  },
];