// types.ts

// Defines the custom Point of View string type (keeps autocomplete but allows any string).
export type POV = 'pro' | 'critical' | 'neutral' | 'satirical' | (string & {});

// Defines the allowed Tone types for the comic.
export type Tone = 'satirical' | 'neutral' | 'ironic' | 'deadpan';

// Interface for a single, tagged reference image (file-based).
export interface ReferenceImage {
  file: File;
  tag: string;
}

// Interface for a processed, base64-encoded reference image used for API calls.
export interface ProcessedReferenceImage {
  base64: string;
  mimeType: string;
  tag: string;
}

// Interface for the comic generation form data.
export interface ComicFormData {
  topic: string;
  pov: POV;
  tone: Tone;
  illustrationStyle?: string;
  referenceImages?: ReferenceImage[];
}

// Interface for element positioning.
export interface ElementPosition {
  x: number | string;
  y: number | string;
}

// Interface for element sizing.
export interface ElementSize {
  width: number | string;
  height: number | string;
}

// A unified interface for all text-based elements in a panel.
export interface TextElementData {
  id: string;
  text: string;
  role: 'speech' | 'thought' | 'sfx' | 'caption';
  position: ElementPosition;
  size: ElementSize;
  // Tail position is optional and only used for speech/thought bubbles.
  tailPosition?: ElementPosition;
  // Color inversion state for bubbles.
  invertedColors?: boolean;
}
// The Bubble component receives data for 'speech' and 'thought' roles.
// This type enforces that only those roles can be passed to the Bubble component.
export type BubbleData = Omit<TextElementData, 'role'> & {
    role: 'speech' | 'thought';
};


// Data for a single generated panel from the AI plan.
export interface PlanPanel {
    slug: string;
    visual_prompt: string;
    // A single, unified array for all text elements.
    text_elements: {
        text: string;
        role: 'speech' | 'thought' | 'sfx' | 'caption';
        position: ElementPosition;
        size: ElementSize;
    }[];
    consistency_tags: string[];
    // Direct layout hints from the AI.
    size: 'small' | 'medium' | 'large';
    aspect_ratio: '1:1';
}

// Data for the entire comic plan from the AI.
export interface ComicPlan {
    title: string;
    panels: PlanPanel[];
}

// Enriched data for a panel within the application state.
export interface PanelData {
  id: string;
  image: string; // base64 encoded image
  visual_prompt: string;
  text_elements: TextElementData[];
  consistency_tags: string[];
  user_consistency_tags: string[]; // User-added tags for refinement (now an array)
  // The final, calculated layout properties are stored here.
  layoutProps: {
      gridCols: number;
      aspectRatio: PlanPanel['aspect_ratio'];
  };
}

// Interface for the complete comic strip data used in the app.
export interface ComicStripData {
  title: string;
  panels: PanelData[];
}

// Interface for a single news story fetched from an RSS feed.
export interface NewsStory {
  title: string;
  description: string;
}
