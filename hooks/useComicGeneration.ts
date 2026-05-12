// hooks/useComicGeneration.ts
// The single source of truth for all comic generation state and logic.
// Drives a four-stage state machine: form → [story-swipe] → review → strip.
// Exposes stable callbacks (all wrapped in useCallback) so child components
// that receive them as props never cause unnecessary re-renders.
import { useState, useCallback, useRef, useEffect } from 'react';
import {
  AppStage,
  ComicFormData,
  ComicPlan,
  ComicStripData,
  ExplainerSource,
  PanelData,
  ProcessedReferenceImage,
  ReferenceImage,
  ReviewData,
} from '../types';
import { geminiService } from '../services/geminiService';
import { toBase64 } from '../utils/fileUtils';
import { layoutAdapter } from '../utils/layoutAdapter';

/**
 * Collects and deduplicates consistency tags across ALL panels in a plan.
 * Passing the full cross-panel tag set to every generation call means each
 * image knows about every recurring character, not just the ones its own
 * panel happens to mention.
 */
const poolConsistencyTags = (plan: ComicPlan): string[] =>
  [...new Set(plan.panels.flatMap(p => p.consistency_tags ?? []))];

/**
 * Builds a ProcessedReferenceImage tagged as the primary, user-approved style
 * sheet (always panel 0). Passed alongside the preceding-panel reference for
 * panels 3+ to re-anchor the model to the original character designs.
 */
const makePrimaryStyleRef = (base64: string): ProcessedReferenceImage => ({
  base64,
  mimeType: 'image/png',
  tag: `PRIMARY STYLE SHEET (panel 0 — user-approved): Use this image solely as a character design and art style reference. Match the art style, character faces, body types, hair, clothing, and colour palette exactly for any characters that appear in the new panel. Do NOT copy the scene composition, camera framing, props, or background from this image — each panel has its own unique description.`,
});

/**
 * Builds a ProcessedReferenceImage tagged as the immediately preceding panel.
 * Used to maintain art-style and character-design continuity only — not scene composition.
 */
const makeConsistencyRef = (
  base64: string,
  panelNumber: number,
  position: 'PREVIOUS' | 'NEXT' = 'PREVIOUS'
): ProcessedReferenceImage => ({
  base64,
  mimeType: 'image/png',
  tag: `${position} PANEL REFERENCE (panel ${panelNumber}): Use this image solely to match the art style, character designs, and colour palette. Do NOT copy or carry over the scene composition, camera angle, background layout, or specific poses/positions from this panel — each panel has its own unique visual description that must be followed independently.`,
});

/**
 * Curated starting positions for speech/thought bubbles — one per screen quadrant.
 * Each slot's tail points toward the opposite quadrant, where a character's mouth
 * would typically appear relative to their speech bubble.
 *
 *  Slot 0 — top-left,     tail → lower-right
 *  Slot 1 — top-right,    tail → lower-left
 *  Slot 2 — bottom-left,  tail → upper-right
 *  Slot 3 — bottom-right, tail → upper-left
 */
const BUBBLE_SLOTS = [
  { pos: { x: '2%',  y: '4%'  }, size: { width: '48%', height: '25%' }, tail: { x: '80%', y: '120%' } },
  { pos: { x: '50%', y: '4%'  }, size: { width: '48%', height: '25%' }, tail: { x: '20%', y: '120%' } },
  { pos: { x: '2%',  y: '68%' }, size: { width: '48%', height: '25%' }, tail: { x: '80%', y: '-20%' } },
  { pos: { x: '50%', y: '68%' }, size: { width: '48%', height: '25%' }, tail: { x: '20%', y: '-20%' } },
] as const;

export default function useComicGeneration() {
  const [appStage, setAppStage] = useState<AppStage>('form');
  const [formDataCache, setFormDataCache] = useState<ComicFormData | null>(null);
  const [comicPlans, setComicPlans] = useState<ComicPlan[]>([]);
  const [reviewData, setReviewData] = useState<ReviewData | null>(null);
  const [comicStripData, setComicStripData] = useState<ComicStripData | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [panelLoadingState, setPanelLoadingState] = useState<Set<number>>(new Set());
  const activeComicReferences = useRef<ProcessedReferenceImage[]>([]);

  // Speculative background generation: pre-build panels 2+ while user reviews panel 1.
  // Indexed from 0 = panel[1], 1 = panel[2], etc.
  // null means the speculative attempt failed; undefined means not yet attempted.
  const speculativePanelsRef = useRef<(string | null)[]>([]);
  const speculativeAbortRef = useRef<boolean>(false);

  // Kick off speculative generation whenever the user enters the Review stage
  // (or when they refine/regenerate panel 1, since reviewData changes).
  useEffect(() => {
    if (!reviewData || !formDataCache) {
      speculativeAbortRef.current = true;
      return;
    }

    // Reset state for new speculative run
    speculativeAbortRef.current = false;
    speculativePanelsRef.current = [];

    const { plan, firstPanelImage, userProvidedImages, panelLayouts } = reviewData;
    const { illustrationStyle, comedicStyle, imageModel } = formDataCache;

    if (plan.panels.length <= 1) return;

    const globalTags = poolConsistencyTags(plan);

    (async () => {
      let prevImage = firstPanelImage;
      for (let i = 1; i < plan.panels.length; i++) {
        if (speculativeAbortRef.current) return;
        const panel = plan.panels[i];
        const prevRef = makeConsistencyRef(prevImage, i);
        // For panels 3+, re-anchor to the user-approved panel 0 as the
        // primary style sheet, then add the preceding panel for local continuity.
        const refs: ProcessedReferenceImage[] = [
          ...userProvidedImages,
          ...(i > 1 ? [makePrimaryStyleRef(firstPanelImage)] : []),
          prevRef,
        ];
        try {
          const img = await geminiService.generatePanelImageWithReferences(
            panel.visual_prompt,
            globalTags,
            illustrationStyle,
            comedicStyle,
            refs,
            imageModel,
            formDataCache.stance,
            panelLayouts[i]?.aspectRatio,
            panel.text_elements?.map(el => el.text) ?? [],
          );
          if (speculativeAbortRef.current) return;
          speculativePanelsRef.current[i - 1] = img;
          prevImage = img;
        } catch {
          if (!speculativeAbortRef.current) {
            speculativePanelsRef.current[i - 1] = null;
          }
        }
      }
    })();

    return () => {
      speculativeAbortRef.current = true;
    };
  }, [reviewData, formDataCache]);

  const _setError = useCallback((errorMessage: string | null) => {
    setError(errorMessage);
    setIsLoading(false);
    setProgress(null);
  }, []);

  const handleStartNew = useCallback(() => {
    speculativeAbortRef.current = true;
    speculativePanelsRef.current = [];
    setAppStage('form');
    setFormDataCache(null);
    setComicPlans([]);
    setReviewData(null);
    setComicStripData(null);
    setIsLoading(false);
    setError(null);
    setProgress(null);
    activeComicReferences.current = [];
  }, []);

  const isPanelLoading = useCallback((panelIndex: number) => {
    return panelLoadingState.has(panelIndex);
  }, [panelLoadingState]);

  const processReferenceImages = useCallback(async (images: ReferenceImage[] = []): Promise<ProcessedReferenceImage[]> => {
    return Promise.all(
      images.map(async (img) => {
        const { base64, mimeType } = await toBase64(img.file);
        return { base64, mimeType, tag: img.tag };
      })
    );
  }, []);

  const handleSelectStory = useCallback(async (plan: ComicPlan, formDataOverride?: ComicFormData) => {
    const currentFormData = formDataOverride || formDataCache;
    if (!currentFormData) {
      _setError("Missing form data. Please start over.");
      return;
    }

    if (!plan || !plan.panels || plan.panels.length === 0) {
      _setError("The AI generated an empty story plan. Please try regenerating your ideas.");
      setAppStage(currentFormData.brainstormMode ? 'story-swipe' : 'form');
      return;
    }

    setIsLoading(true);
    setLoadingMessages([
      "Sketching the first panel...",
      "Finding the perfect art style...",
      "Consulting the style guide...",
      "Dipping the brush in digital ink...",
      "Setting the scene for panel one...",
      "Casting the main character...",
      "Blocking out the first shot...",
    ]);
    setError(null);

    try {
      const userImages = await processReferenceImages(currentFormData.referenceImages);
      activeComicReferences.current = userImages;

      const firstPanelPlan = plan.panels[0];
      const globalTags = poolConsistencyTags(plan);
      const panelLayouts = layoutAdapter(plan.panels);
      const firstPanelImage = await geminiService.generatePanelImageWithReferences(
        firstPanelPlan.visual_prompt,
        globalTags,
        currentFormData.illustrationStyle,
        currentFormData.comedicStyle,
        userImages,
        currentFormData.imageModel,
        currentFormData.stance,
        panelLayouts[0]?.aspectRatio,
        firstPanelPlan.text_elements?.map(el => el.text) ?? [],
      );

      setReviewData({ plan, firstPanelImage, userProvidedImages: userImages, panelLayouts });
      setAppStage('review');
    } catch (err: any) {
      _setError(err.message || 'Failed to generate the first panel image.');
    } finally {
      setIsLoading(false);
    }
  }, [formDataCache, _setError, processReferenceImages]);

  const handleFormSubmit = useCallback(async (formData: ComicFormData) => {
    setIsLoading(true);
    setError(null);
    setFormDataCache(formData);
    setAppStage('form');

    try {
      const userImages = await processReferenceImages(formData.referenceImages);
      activeComicReferences.current = userImages;

      if (formData.brainstormMode) {
        setLoadingMessages(['Brainstorming story concepts...', 'Crafting witty dialogue...', 'Polishing the punchlines...']);
        const plans = await geminiService.generateMultipleComicPlans(formData, userImages);
        if (plans.length === 0) {
          throw new Error("The AI couldn't generate any story ideas. Please try a different topic.");
        }
        setComicPlans(plans);
        setAppStage('story-swipe');
      } else {
        setLoadingMessages(['Drafting a story concept...', 'Structuring the panels...', 'Finalizing the narrative...']);
        const plan = await geminiService.generateSingleComicPlan(formData, userImages);
        await handleSelectStory(plan, formData);
      }
    } catch (err: any) {
      _setError(err.message || 'An unexpected error occurred during planning.');
    } finally {
      setIsLoading(false);
    }
  }, [processReferenceImages, _setError, handleSelectStory]);

  const handleContinueGeneration = useCallback(async () => {
    if (!reviewData || !formDataCache) {
      _setError("Review data is missing. Cannot continue.");
      return;
    }

    // Stop any still-running speculative generation — results are no longer needed.
    speculativeAbortRef.current = true;

    setIsLoading(true);
    setError(null);
    setProgress(null);

    const totalPanels = reviewData.plan.panels.length;
    const panelImages: string[] = [reviewData.firstPanelImage];
    const userReferences = [...activeComicReferences.current];
    const remainingPanels = reviewData.plan.panels.slice(1);
    const globalTags = poolConsistencyTags(reviewData.plan);

    // Initial progress
    setProgress({ current: 1, total: totalPanels });
    setLoadingMessages(["Inking the final panels..."]);

    // Track whether the speculative chain is still valid.
    // If any panel was not speculatively generated, all subsequent ones are invalidated
    // (since they were built on that missing link in the chain).
    let speculativeChainValid = true;

    for (const [index, panel] of remainingPanels.entries()) {
      const panelNumber = index + 2;
      const speculativeImg = speculativeChainValid
        ? speculativePanelsRef.current[index]
        : undefined;

      if (speculativeImg !== undefined && speculativeImg !== null) {
        // Lucky — this panel was pre-built in the background
        panelImages.push(speculativeImg);
        setProgress({ current: panelNumber, total: totalPanels });
        setLoadingMessages([`Panel ${panelNumber} of ${totalPanels} ready (pre-built)...`]);
        continue;
      }

      // Speculative result unavailable or failed — generate now
      speculativeChainValid = false;
      setLoadingMessages([`Generating panel ${panelNumber} of ${totalPanels}...`]);

      const previousImageAsRef = makeConsistencyRef(panelImages[panelImages.length - 1], panelNumber - 1);
      // For panels 3+, prepend the user-approved panel 0 as a primary style sheet
      // so character drift from the immediately preceding panel can't compound.
      const refs: ProcessedReferenceImage[] = [
        ...userReferences,
        ...(panelImages.length > 1 ? [makePrimaryStyleRef(panelImages[0])] : []),
        previousImageAsRef,
      ];

      try {
        const newImage = await geminiService.generatePanelImageWithReferences(
          panel.visual_prompt,
          globalTags,
          formDataCache.illustrationStyle,
          formDataCache.comedicStyle,
          refs,
          formDataCache.imageModel,
          formDataCache.stance,
          reviewData.panelLayouts[index + 1]?.aspectRatio,
          panel.text_elements?.map(el => el.text) ?? [],
        );
        panelImages.push(newImage);
      } catch {
        // Partial failure: mark this panel as failed but keep going
        panelImages.push('');
      }

      setProgress({ current: panelNumber, total: totalPanels });
    }

    // Build context explainer in parallel with the last panel if needed
    let contextText: string | undefined = undefined;
    let contextSources: ExplainerSource[] = [];
    if (formDataCache.includeContext) {
      setLoadingMessages(["Checking the archives for context..."]);
      const explainerResult = await geminiService.generateContextExplainer(
        reviewData.plan.title,
        reviewData.plan.summary,
        formDataCache.newsContext,
      );
      contextText = explainerResult.text;
      contextSources = explainerResult.sources;
    }

    const finalPanels: PanelData[] = reviewData.plan.panels.map((planPanel, index) => {
      const image = panelImages[index] ?? '';
      const failed = image === '';

      let bubbleSlot = 0;
      const textElements = (planPanel.text_elements || []).map(te => {
        if (te.role === 'caption') {
          return {
            ...te,
            id: crypto.randomUUID(),
            position: { x: '5%', y: '83%' },
            size: { width: '90%', height: '14%' },
            tailPosition: { x: '50%', y: '50%' },
            invertedColors: false,
          };
        }
        if (te.role === 'sfx') {
          return {
            ...te,
            id: crypto.randomUUID(),
            position: { x: '25%', y: '35%' },
            size: { width: '50%', height: '22%' },
            tailPosition: { x: '50%', y: '50%' },
            invertedColors: false,
          };
        }
        // speech / thought — assign next slot
        const slot = BUBBLE_SLOTS[bubbleSlot % BUBBLE_SLOTS.length];
        bubbleSlot++;
        return {
          ...te,
          id: crypto.randomUUID(),
          position: slot.pos,
          size: slot.size,
          tailPosition: slot.tail,
          invertedColors: false,
        };
      });

      return {
        id: crypto.randomUUID(),
        image,
        failed,
        visual_prompt: planPanel.visual_prompt,
        text_elements: textElements,
        consistency_tags: planPanel.consistency_tags || [],
        user_consistency_tags: [],
        layoutProps: reviewData.panelLayouts[index],
      };
    });

    setComicStripData({
      title: reviewData.plan.title,
      panels: finalPanels,
      context: contextText,
      contextSources: contextSources.length > 0 ? contextSources : undefined,
    });
    setAppStage('strip');
    setIsLoading(false);
    setProgress(null);
  }, [reviewData, formDataCache, _setError]);

  const handleUpdatePanel = useCallback((panelIndex: number, updatedData: Partial<PanelData>) => {
    setComicStripData(prev => {
      if (!prev) return null;
      const newPanels = [...prev.panels];
      newPanels[panelIndex] = { ...newPanels[panelIndex], ...updatedData };
      return { ...prev, panels: newPanels };
    });
  }, []);

  const handleRegeneratePanelImage = useCallback(async (panelIndex: number) => {
    if (!comicStripData || !formDataCache) return;

    // Clear any previous per-panel error and start loading.
    handleUpdatePanel(panelIndex, { panelError: undefined });
    setPanelLoadingState(prev => new Set(prev).add(panelIndex));
    try {
      const panel = comicStripData.panels[panelIndex];

      // Pool tags from every panel so the regenerated image knows about all
      // recurring characters, not just the ones this panel's own tags mention.
      const globalTags = [
        ...new Set(comicStripData.panels.flatMap(p => [...p.consistency_tags, ...p.user_consistency_tags])),
      ];

      // Build reference list:
      //  1. User-uploaded character images (always first)
      //  2. Panel 0 as primary style sheet — unless we ARE regenerating panel 0
      //  3. The nearest successfully-generated neighbour for local continuity
      const panel0 = comicStripData.panels[0];
      const primaryRef: ProcessedReferenceImage[] =
        panelIndex > 0 && panel0?.image
          ? [makePrimaryStyleRef(panel0.image)]
          : [];

      const neighbourPanel = panelIndex > 0
        ? comicStripData.panels[panelIndex - 1]
        : comicStripData.panels[panelIndex + 1];
      const neighbourRefs: ProcessedReferenceImage[] = neighbourPanel?.image
        ? [makeConsistencyRef(
            neighbourPanel.image,
            panelIndex > 0 ? panelIndex : panelIndex + 2,
            panelIndex > 0 ? 'PREVIOUS' : 'NEXT'
          )]
        : [];

      const newImage = await geminiService.generatePanelImageWithReferences(
        panel.visual_prompt,
        globalTags,
        formDataCache.illustrationStyle,
        formDataCache.comedicStyle,
        [...activeComicReferences.current, ...primaryRef, ...neighbourRefs],
        formDataCache.imageModel,
        formDataCache.stance,
        panel.layoutProps.aspectRatio,
        panel.text_elements?.map(el => el.text) ?? [],
      );
      handleUpdatePanel(panelIndex, { image: newImage, failed: false, panelError: undefined });
    } catch (err: any) {
      // Surface as a per-panel error — do NOT use _setError which would destroy the
      // entire comic strip with a global ErrorState and force the user to start over.
      handleUpdatePanel(panelIndex, {
        panelError: err.message || `Failed to regenerate panel ${panelIndex + 1}.`,
      });
    } finally {
      setPanelLoadingState(prev => {
        const newSet = new Set(prev);
        newSet.delete(panelIndex);
        return newSet;
      });
    }
  }, [comicStripData, formDataCache, handleUpdatePanel]);

  const handleRefinePanelImage = useCallback(async (panelIndex: number, refinementPrompt: string) => {
    if (!comicStripData || !formDataCache) return;

    const panel = comicStripData.panels[panelIndex];

    // Validate BEFORE entering loading state so we don't flash a spinner for input errors.
    // These are per-panel errors — never global ErrorState.
    if (!refinementPrompt.trim()) {
      handleUpdatePanel(panelIndex, { panelError: 'Add some details in the field above first.' });
      return;
    }
    if (!panel.image || panel.failed) {
      handleUpdatePanel(panelIndex, { panelError: 'No image to refine — use the Regenerate button instead.' });
      return;
    }

    handleUpdatePanel(panelIndex, { panelError: undefined });
    setPanelLoadingState(prev => new Set(prev).add(panelIndex));
    try {
      const globalTags = [
        ...new Set(comicStripData.panels.flatMap(p => [...p.consistency_tags, ...p.user_consistency_tags])),
      ];

      const newImage = await geminiService.refinePanelImage(
        panel.image,
        refinementPrompt,
        panel.visual_prompt,
        globalTags,
        formDataCache.illustrationStyle,
        formDataCache.comedicStyle,
        activeComicReferences.current,
        formDataCache.imageModel,
        formDataCache.stance,
        panel.layoutProps.aspectRatio,
        panel.text_elements?.map(el => el.text) ?? [],
      );
      handleUpdatePanel(panelIndex, { image: newImage, failed: false, panelError: undefined });
    } catch (err: any) {
      // Per-panel error — do NOT use _setError (would destroy the comic strip).
      handleUpdatePanel(panelIndex, {
        panelError: err.message || `Failed to refine panel ${panelIndex + 1}.`,
      });
    } finally {
      setPanelLoadingState(prev => {
        const newSet = new Set(prev);
        newSet.delete(panelIndex);
        return newSet;
      });
    }
  }, [comicStripData, formDataCache, handleUpdatePanel]);

  const onRegenerateConcept = useCallback(() => {
    if (formDataCache) {
      const newFormData = { ...formDataCache, brainstormMode: false };
      handleFormSubmit(newFormData);
    }
  }, [formDataCache, handleFormSubmit]);

  const onRegenerateIdeas = useCallback(() => {
    if (formDataCache) {
      const newFormData = { ...formDataCache, brainstormMode: true };
      handleFormSubmit(newFormData);
    }
  }, [formDataCache, handleFormSubmit]);

  const onUpdateReviewImage = useCallback((newImage: string) => {
    setReviewData(prev => prev ? { ...prev, firstPanelImage: newImage } : null);
    // The useEffect watching reviewData will automatically restart speculative generation.
  }, []);

  const onReturnFromSwiper = useCallback(() => {
    setAppStage('form');
    setComicPlans([]);
  }, []);

  const onReturnFromReview = useCallback(() => {
    speculativeAbortRef.current = true;
    speculativePanelsRef.current = [];
    if (formDataCache?.brainstormMode) {
      setAppStage('story-swipe');
    } else {
      setAppStage('form');
    }
    setReviewData(null);
  }, [formDataCache]);

  return {
    appStage,
    formData: formDataCache,
    comicPlans,
    reviewData,
    comicStripData,
    isLoading,
    loadingMessages,
    progress,
    error,
    isPanelLoading,
    handleFormSubmit,
    handleSelectStory,
    handleContinueGeneration,
    handleUpdatePanel,
    handleRegeneratePanelImage,
    handleRefinePanelImage,
    handleStartNew,
    onRegenerateConcept,
    onRegenerateIdeas,
    onUpdateReviewImage,
    onReturnFromSwiper,
    onReturnFromReview,
  };
}
