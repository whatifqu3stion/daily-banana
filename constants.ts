// constants.ts — static option lists shared by the form UI and the AI prompt builders.
import { Stance, ComedicStyle, ImageModel } from './types';

export const STANCE_OPTIONS: { value: Stance; label: string; tooltip: string }[] = [
  { value: 'supportive', label: 'Supportive (Pro)',        tooltip: 'Comic champions the subject — critics look petty or misguided.' },
  { value: 'critical',   label: 'Critical',               tooltip: 'Comic exposes flaws, hypocrisy, or failure in the subject.' },
  { value: 'neutral',    label: 'Neutral / Observational', tooltip: 'No side taken — the absurdity of the situation is the joke.' },
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

export const ILLUSTRATION_STYLE_OPTIONS: { value: string; label: string; description: string; tooltip: string }[] = [
  { 
    value: 'default-color', 
    label: 'Default Color Style',
    description: 'A standard full-color retro newspaper comic panel style with vibrant colors and clean lines.',
    tooltip: 'Classic full-color newspaper comic — vibrant palette, clean outlines.',
  },
  { 
    value: 'sunday-funnies', 
    label: 'Sunday Funnies',
    description: 'A charming, colorful style like classic newspaper funnies. Use a bright, simple palette, rounded shapes, and focus on clear character expressions over detailed backgrounds.',
    tooltip: 'Bright, cheerful, rounded — like classic newspaper comic pages.',
  },
  { 
    value: 'golden-age', 
    label: 'Golden Age Heroic',
    description: 'A style reminiscent of 1940s American superhero comics. Use a primary color palette (bold reds, yellows, blues), dynamic outlines, and a sense of action and drama.',
    tooltip: '1940s superhero drama — bold primary colors, dynamic action lines.',
  },
  { 
    value: 'ligne-claire', 
    label: 'Ligne Claire',
    description: 'A "clear line" European comic style. Use crisp, precise, unvarying line weights for all objects and characters. Employ flat, block colors with minimal shading.',
    tooltip: 'Crisp European clear-line style — precise outlines, flat block colors.',
  },
  { 
    value: 'magazine-gag', 
    label: 'Magazine Gag Cartoon',
    description: 'A witty, single-panel gag cartoon in the style of a classic magazine like The New Yorker. The final output will be a single large panel. Use a black and white aesthetic with a grayscale ink wash. The image should depict a single, static scene. The primary humor should come from a clever, dry, or satirical caption placed below the panel.',
    tooltip: 'New Yorker-style single-panel gag — black and white ink wash.',
  },
  { 
    value: 'modern-manga', 
    label: 'Modern Color Manga',
    description: 'A vibrant, modern manga style. Use dynamic, cinematic angles, expressive faces with large eyes, and a rich color palette with gradients and cell shading.',
    tooltip: 'Cinematic manga — expressive faces, rich gradients, cell shading.',
  },
  { 
    value: 'underground-comix', 
    label: 'Underground Comix',
    description: 'An exaggerated, psychedelic style inspired by 1960s underground comix. Use a wild, high-saturation color palette, distorted and rubbery character anatomy, and dense, intricate background details.',
    tooltip: 'Psychedelic 1960s underground — wild colors, rubbery anatomy.',
  },
];

export const IMAGE_MODEL_OPTIONS: {
  value: ImageModel;
  label: string;
  note: string;
  pricePerImage: number;
}[] = [
  {
    value: 'gemini-nano-banana-2.1',
    label: 'Nano Banana 2.1',
    note: 'Latest stable · 2K images · billing required',
    pricePerImage: 0.0504,
  },
  {
    value: 'gemini-2.5-flash-image',
    label: 'Flash Image 2.5',
    note: 'Legacy stable · 1K images · billing required',
    pricePerImage: 0.039,
  },
];