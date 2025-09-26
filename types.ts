// types.ts

// Defines the comic's message or argument about the topic.
export type Stance = 'supportive' | 'critical' | 'neutral' | (string & {});

// Defines the method or style of humor for the comic.
export type ComedicStyle = 'satirical' | 'ironic' | 'deadpan' | 'absurdist' | 'slapstick' | (string & {});

// Defines the stages of the application's UI flow.
export type AppStage = 'form' | 'story-swipe' | 'review' | 'strip';

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
  stance: Stance;
  comedicStyle: ComedicStyle;
  illustrationStyle?: string;
  referenceImages?: ReferenceImage[];
  brainstormMode: boolean;
  includeContext: boolean; // New feature: Add context explainer
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
    // FIX: Removed position and size from the AI's responsibility to improve reliability.
    text_elements: {
        text: string;
        role: 'speech' | 'thought' | 'sfx' | 'caption';
    }[];
    consistency_tags: string[];
    // Direct layout hints from the AI.
    size: 'small' | 'medium' | 'large';
    aspect_ratio: '1:1';
}

// Data for the entire comic plan from the AI.
export interface ComicPlan {
    title: string;
    summary: string; // A new field for a quick, digestible summary.
    panels: PlanPanel[];
}

// FIX: Define LayoutProps here as the single source of truth for panel layout data.
// This resolves import errors and improves type consistency.
export interface LayoutProps {
  gridCols: number;
  aspectRatio: PlanPanel['aspect_ratio'];
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
  // FIX: Use the centralized LayoutProps type.
  layoutProps: LayoutProps;
}

// Interface for the complete comic strip data used in the app.
export interface ComicStripData {
  title: string;
  panels: PanelData[];
  context?: string; // New feature: Optional context explainer text
}

// Interface for a single news story fetched from an RSS feed.
export interface NewsStory {
  title: string;
  description: string;
}