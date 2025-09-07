// types.ts

// Defines the custom Point of View string type.
export type POV = 'Pro' | 'Critical' | 'Neutral' | 'Satirical' | string;

// Defines the allowed Tone types for the comic.
export type Tone = 'satirical' | 'neutral' | 'ironic' | 'deadpan';

// Defines the layout size for a panel.
export type PanelLayout = 'standard' | 'large' | 'double-width';

// Interface for the comic generation form data.
export interface FormData {
  topic: string;
  pov: POV;
  tone: Tone;
  referenceImages?: File[];
}

// Interface for element positioning.
export interface ElementPosition {
  x: number;
  y: number;
}

// Interface for element sizing.
export interface ElementSize {
  width: number;
  height: number;
}

// Data for a speech bubble.
export interface BubbleData {
  id: string;
  text: string;
  position: ElementPosition;
  size: ElementSize;
  positionHint?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
}

// Data for a sound effect.
export interface SfxData {
  id: string;
  text: string;
  position: ElementPosition;
  size: ElementSize;
  positionHint?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
}

// Data for a single generated panel from the AI plan.
export interface PlanPanel {
    slug: string;
    visual_prompt: string;
    caption: string;
    bubbles: { text: string; positionHint?: BubbleData['positionHint'] }[];
    sfx: { text: string; positionHint?: SfxData['positionHint'] }[];
    consistency_tags: string[];
    layout: PanelLayout;
}

// Data for the entire comic plan from the AI.
export interface ComicPlan {
    title: string;
    panels: PlanPanel[];
}

// Enriched data for a panel within the application state.
export interface PanelData {
  id: number;
  image: string; // base64 encoded image
  visual_prompt: string;
  caption: {
    id: string;
    text: string;
    position: ElementPosition;
    size: ElementSize;
  };
  bubbles: BubbleData[];
  sfx: SfxData[];
  layout: PanelLayout;
  consistency_tags: string[];
  user_consistency_tags: string; // User-added tags for refinement
}

// Interface for the complete comic strip data used in the app.
export interface ComicStripData {
  title: string;
  panels: PanelData[];
}
