// types.ts — shared TypeScript interfaces and union types used across the app.
// Primitive types (Stance, ComedicStyle, ImageModel) use open-ended string
// unions (`string & {}`) so freetext custom values pass type-checking without
// widening to `string`.

// Defines the comic's message or argument about the topic.
export type Stance = 'supportive' | 'critical' | 'neutral' | (string & {});

// Defines the method or style of humor for the comic.
export type ComedicStyle = 'satirical' | 'ironic' | 'deadpan' | 'absurdist' | 'slapstick' | (string & {});

// Defines which Gemini image generation model to use for panel rendering.
export type ImageModel = 'gemini-3.1-flash-image-preview' | 'gemini-2.5-flash-preview-image-generation';

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
  newsContext?: string; // Full description of the news story, if one was selected from the picker
  stance: Stance;
  comedicStyle: ComedicStyle;
  illustrationStyle?: string;
  imageModel: ImageModel;
  referenceImages?: ReferenceImage[];
  brainstormMode: boolean;
  includeContext: boolean;
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


// Supported aspect ratios for panel display.
// 1:1 and 4:3 are square-ish; 16:9 is cinematic landscape; 9:16 is portrait.
export type AspectRatio = '1:1' | '16:9' | '4:3' | '9:16';

// Data for a single generated panel from the AI plan.
export interface PlanPanel {
    slug: string;
    comedic_role?: 'establish' | 'escalate' | 'punchline' | 'button';
    visual_prompt: string;
    // A single, unified array for all text elements.
    text_elements: {
        text: string;
        role: 'speech' | 'thought' | 'sfx' | 'caption';
    }[];
    consistency_tags: string[];
    // Layout hints from the AI — used by layoutAdapter to select a template.
    size: 'small' | 'medium' | 'large';
    aspect_ratio: AspectRatio;
}

// Data for the entire comic plan from the AI.
export interface ComicPlan {
    premise?: string; // Internal core-joke anchor used during generation
    title: string;
    summary: string;
    panels: PlanPanel[];
}

// Concrete layout props produced by layoutAdapter for each panel.
export interface LayoutProps {
  gridCols: number;
  aspectRatio: AspectRatio;
}

// Enriched data for a panel within the application state.
export interface PanelData {
  id: string;
  image: string; // base64 encoded image
  failed?: boolean; // true if image generation failed for this panel
  panelError?: string; // Human-readable error from the last failed operation on this panel
  visual_prompt: string;
  text_elements: TextElementData[];
  consistency_tags: string[];
  user_consistency_tags: string[]; // User-added tags for refinement (now an array)
  layoutProps: LayoutProps;
}

// Interface for the complete comic strip data used in the app.
export interface ComicStripData {
  title: string;
  panels: PanelData[];
  context?: string; // Optional AI-generated archivist note about the real-world context.
  contextSources?: ExplainerSource[]; // Sources cited in the grounded context explainer.
}

// A cited source returned alongside a grounded AI response.
export interface ExplainerSource {
  url: string;
  title: string;
}

// Interface for a single news story fetched from an RSS feed.
export interface NewsStory {
  title: string;
  description: string;
}

// Data passed from useComicGeneration to ReviewPlan after the first panel has
// been generated and approved. Kept here so both sides share the same type.
export interface ReviewData {
  plan: ComicPlan;
  /** Base64 PNG of the generated panel 0 image. */
  firstPanelImage: string;
  userProvidedImages: ProcessedReferenceImage[];
  panelLayouts: LayoutProps[];
}