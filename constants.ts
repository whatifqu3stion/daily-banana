
import { POV, Tone } from './types';

export const POV_OPTIONS: { value: POV; label: string }[] = [
  { value: 'pro', label: 'Pro' },
  { value: 'critical', label: 'Critical' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'satirical', label: 'Satirical' },
];

export const TONE_OPTIONS: { value: Tone; label: string }[] = [
  { value: 'satirical', label: 'Satirical' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'ironic', label: 'Ironic' },
  { value: 'deadpan', label: 'Deadpan' },
];

export const ILLUSTRATION_STYLE_OPTIONS: { value: string; label: string; description: string }[] = [
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
    value: 'modern-manga', 
    label: 'Modern Color Manga',
    description: 'A vibrant, modern manga style. Use dynamic, cinematic angles, expressive faces with large eyes, and a rich color palette with gradients and cell shading.'
  },
  { 
    value: 'underground-comix', 
    label: 'Underground Comix',
    description: 'An exaggerated, psychedelic style inspired by 1960s underground comix. Use a wild, high-saturation color palette, distorted and rubbery character anatomy, and dense, intricate background details.'
  },
  { 
    value: 'default-color', 
    label: 'Default Color Style',
    description: 'A standard full-color retro newspaper comic panel style with vibrant colors and clean lines.'
  },
];