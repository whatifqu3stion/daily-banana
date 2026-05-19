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
 * Bubble slot layouts chosen by pre-counting how many speech/thought elements
 * are in the panel, so each count gets the most visually balanced arrangement.
 *
 * SINGLE (1 bubble):
 *   Slot 0 — upper-centre, 70% wide.  Tail → bottom-centre.
 *
 * MULTI (2+ bubbles) — true left/right split with vertical separation:
 *   Slot 0 — upper-left.   Tail → lower-right.
 *   Slot 1 — lower-right.  Tail → upper-left.
 *   Slot 2 — upper-right.  Tail → lower-left.
 *   Slot 3 — lower-left.   Tail → upper-right.
 */
const BUBBLE_SLOTS_SINGLE = [
  { pos: { x: '15%', y: '5%'  }, size: { width: '70%', height: '30%' }, tail: { x: '50%', y: '120%' } },
] as const;

/**
 * Narrower single-bubble slot for full-width (col-span-6) 16:9 cinematic panels.
 * 70% width dominates a landscape composition; 50% keeps the bubble proportionate.
 */
const BUBBLE_SLOTS_SINGLE_WIDE = [
  { pos: { x: '25%', y: '5%'  }, size: { width: '50%', height: '30%' }, tail: { x: '50%', y: '120%' } },
] as const;

const BUBBLE_SLOTS_MULTI = [
  { pos: { x: '2%',  y: '5%'  }, size: { width: '48%', height: '30%' }, tail: { x: '80%', y: '120%' } },
  { pos: { x: '50%', y: '58%' }, size: { width: '48%', height: '30%' }, tail: { x: '20%', y: '-20%' } },
  { pos: { x: '50%', y: '5%'  }, size: { width: '48%', height: '30%' }, tail: { x: '20%', y: '120%' } },
  { pos: { x: '2%',  y: '58%' }, size: { width: '48%', height: '30%' }, tail: { x: '80%', y: '-20%' } },
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

  // Per-card loading/error state for "Write Your Own" custom premise generation.
  // Distinct from the global isLoading so the StorySwiper card shows an inline
  // spinner rather than replacing the whole screen with LoadingState.
  const [isCustomPremiseLoading, setIsCustomPremiseLoading] = useState(false);
  const [customPremiseError, setCustomPremiseError] = useState<string | null>(null);

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
            { premise: plan.premise, comedicRole: panel.comedic_role, panelIndex: i, totalPanels: plan.panels.length },
            plan.panels[i - 1]?.scene_state,
            plan.set_description,
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
    setIsCustomPremiseLoading(false);
    setCustomPremiseError(null);
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
        { premise: plan.premise, comedicRole: firstPanelPlan.comedic_role, panelIndex: 0, totalPanels: plan.panels.length },
        undefined,
        plan.set_description,
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
        // Non-brainstorm mode: route through StorySwiper so the user can review
        // the AI concept or switch to the "Write Your Own Angle" card.
        setLoadingMessages(['Drafting a story concept...', 'Structuring the panels...', 'Finalizing the narrative...']);
        const plan = await geminiService.generateSingleComicPlan(formData, userImages);
        setComicPlans([plan]);
        setAppStage('story-swipe');
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
          { premise: reviewData.plan.premise, comedicRole: panel.comedic_role, panelIndex: index + 1, totalPanels: reviewData.plan.panels.length },
          reviewData.plan.panels[index]?.scene_state,
          reviewData.plan.set_description,
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

      // Pre-count speech/thought elements so we can choose the right slot set.
      // 1 bubble on a square panel → wide centred single slot (70%).
      // 1 bubble on a full-width 16:9 panel → narrower centred slot (50%) to avoid dominating.
      // 2+ bubbles → left/right split with vertical separation.
      const speechCount = (planPanel.text_elements || []).filter(
        te => te.role === 'speech' || te.role === 'thought'
      ).length;
      const panelLayout = reviewData.panelLayouts[index];
      const isWidePanel = panelLayout?.gridCols === 6 && panelLayout?.aspectRatio === '16:9';
      const bubbleSlots = speechCount <= 1
        ? (isWidePanel ? BUBBLE_SLOTS_SINGLE_WIDE : BUBBLE_SLOTS_SINGLE)
        : BUBBLE_SLOTS_MULTI;
      let bubbleSlot = 0;
      const textElements = (planPanel.text_elements || []).map(te => {
        if (te.role === 'caption') {
          return {
            ...te,
            id: crypto.randomUUID(),
            position: { x: '3%', y: '79%' },
            size: { width: '94%', height: '18%' },
            tailPosition: { x: '50%', y: '50%' },
            invertedColors: false,
          };
        }
        if (te.role === 'sfx') {
          return {
            ...te,
            id: crypto.randomUUID(),
            position: { x: '20%', y: '28%' },
            size: { width: '60%', height: '28%' },
            tailPosition: { x: '50%', y: '50%' },
            invertedColors: false,
          };
        }
        // speech / thought — assign next slot
        const slot = bubbleSlots[bubbleSlot % bubbleSlots.length];
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
        comedic_role: planPanel.comedic_role,
        scene_state: planPanel.scene_state,
      };
    });

    setComicStripData({
      title: reviewData.plan.title,
      premise: reviewData.plan.premise,
      set_description: reviewData.plan.set_description,
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
        { premise: comicStripData.premise, comedicRole: panel.comedic_role, panelIndex, totalPanels: comicStripData.panels.length },
        panelIndex > 0 ? comicStripData.panels[panelIndex - 1]?.scene_state : undefined,
        comicStripData.set_description,
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
        { premise: comicStripData.premise, comedicRole: panel.comedic_role, panelIndex, totalPanels: comicStripData.panels.length },
        panelIndex > 0 ? comicStripData.panels[panelIndex - 1]?.scene_state : undefined,
        comicStripData.set_description,
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

  /**
   * Generates a new single plan using the user's typed premise as a hard
   * constraint, then transitions to the review stage via handleSelectStory.
   * Uses per-card loading state (isCustomPremiseLoading) rather than the
   * global isLoading so StorySwiper shows an inline spinner, not a full screen.
   */
  const handleCustomPremise = useCallback(async (premise: string) => {
    if (!formDataCache) return;
    setIsCustomPremiseLoading(true);
    setCustomPremiseError(null);
    try {
      const customFormData = { ...formDataCache, customPremise: premise };
      // Persist customFormData so downstream operations (speculative gen,
      // handleContinueGeneration, regenerate, refine) all see the right
      // form settings AND so onReturnFromReview restores the correct state.
      setFormDataCache(customFormData);
      const plan = await geminiService.generateSingleComicPlan(customFormData, activeComicReferences.current);
      // handleSelectStory takes over from here with the global loading screen
      // (it generates the panel 0 image before transitioning to review).
      await handleSelectStory(plan, customFormData);
    } catch (err: any) {
      setCustomPremiseError(err.message || 'Failed to generate from your premise. Please try again.');
    } finally {
      setIsCustomPremiseLoading(false);
    }
  }, [formDataCache, handleSelectStory]);

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
    // Both brainstorm and non-brainstorm now use StorySwiper, so "go back"
    // from review always returns to story-swipe rather than the raw form.
    setAppStage('story-swipe');
    setReviewData(null);
  }, []);

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
    isCustomPremiseLoading,
    customPremiseError,
    isPanelLoading,
    handleFormSubmit,
    handleSelectStory,
    handleContinueGeneration,
    handleUpdatePanel,
    handleRegeneratePanelImage,
    handleRefinePanelImage,
    handleStartNew,
    handleCustomPremise,
    onRegenerateConcept,
    onRegenerateIdeas,
    onUpdateReviewImage,
    onReturnFromSwiper,
    onReturnFromReview,
  };
}
