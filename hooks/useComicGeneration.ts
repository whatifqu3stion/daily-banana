// hooks/useComicGeneration.ts
import { useState, useCallback, useRef } from 'react';
import {
  AppStage,
  ComicFormData,
  ComicPlan,
  ComicStripData,
  PanelData,
  ProcessedReferenceImage,
  ReferenceImage,
  LayoutProps,
} from '../types';
import { geminiService } from '../services/geminiService';
import { toBase64 } from '../utils/fileUtils';
import { layoutAdapter } from '../utils/layoutAdapter';

interface ReviewData {
  plan: ComicPlan;
  firstPanelImage: string;
  userProvidedImages: ProcessedReferenceImage[];
  panelLayouts: LayoutProps[];
}

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

  const _setError = useCallback((errorMessage: string | null) => {
    setError(errorMessage);
    setIsLoading(false);
    setProgress(null);
  }, []);

  const handleStartNew = useCallback(() => {
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
    setLoadingMessages(['Generating style preview...']);
    setError(null);

    try {
      const userImages = await processReferenceImages(currentFormData.referenceImages);
      activeComicReferences.current = userImages;
      
      const firstPanelPlan = plan.panels[0];
      const firstPanelImage = await geminiService.generatePanelImageWithReferences(
        firstPanelPlan.visual_prompt,
        firstPanelPlan.consistency_tags,
        currentFormData.illustrationStyle,
        currentFormData.comedicStyle,
        userImages
      );
      
      const panelLayouts = layoutAdapter(plan.panels);

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
    setAppStage('form'); // Stay on form page but show loader

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
    if (!reviewData) {
      _setError("Review data is missing. Cannot continue.");
      return;
    }

    setIsLoading(true);
    setLoadingMessages(['Generating your comic strip...', 'Inking the panels...', 'Adding the color...']);
    setError(null);
    setProgress({ current: 0, total: reviewData.plan.panels.length - 1 });

    try {
      // The first image is already generated
      let panelImages = [reviewData.firstPanelImage];
      
      // Auto-consistency: if no user refs, use the first panel as a ref.
      if (activeComicReferences.current.length === 0) {
          activeComicReferences.current = [{
              base64: reviewData.firstPanelImage,
              mimeType: 'image/png',
              tag: 'auto-generated style reference'
          }];
      }

      const remainingPanels = reviewData.plan.panels.slice(1);
      
      const imagePromises = remainingPanels.map((panel, index) => 
        geminiService.generatePanelImageWithReferences(
          panel.visual_prompt,
          panel.consistency_tags,
          formDataCache?.illustrationStyle,
          formDataCache?.comedicStyle,
          activeComicReferences.current
        ).then(image => {
          setProgress(prev => ({ current: (prev?.current || 0) + 1, total: remainingPanels.length }));
          return image;
        })
      );

      const remainingImages = await Promise.all(imagePromises);
      panelImages = [...panelImages, ...remainingImages];
      
      const finalPanels: PanelData[] = reviewData.plan.panels.map((planPanel, index) => {
        // FIX: Add a defensive check to prevent a crash if the AI omits text_elements.
        // This ensures the .map function is always called on a valid array.
        const textElements = (planPanel.text_elements || []).map(te => ({
          ...te,
          id: crypto.randomUUID(),
          position: { x: '50%', y: te.role === 'caption' ? '85%' : '20%' },
          size: { width: '80%', height: '30%' },
          tailPosition: { x: '50%', y: '110%' },
          invertedColors: false,
        }));
        
        return {
          id: crypto.randomUUID(),
          image: panelImages[index],
          visual_prompt: planPanel.visual_prompt,
          text_elements: textElements,
          // FIX: Add a defensive check for consistency_tags as well.
          consistency_tags: planPanel.consistency_tags || [],
          user_consistency_tags: [],
          layoutProps: reviewData.panelLayouts[index],
        };
      });

      setComicStripData({ title: reviewData.plan.title, panels: finalPanels });
      setAppStage('strip');

    } catch (err: any) {
      _setError(err.message || "Failed to generate the full comic strip.");
    } finally {
      setIsLoading(false);
      setProgress(null);
    }
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
    
    setPanelLoadingState(prev => new Set(prev).add(panelIndex));
    try {
      const panel = comicStripData.panels[panelIndex];
      const allConsistencyTags = [...panel.consistency_tags, ...panel.user_consistency_tags];
      
      const newImage = await geminiService.generatePanelImageWithReferences(
        panel.visual_prompt,
        allConsistencyTags,
        formDataCache.illustrationStyle,
        formDataCache.comedicStyle,
        activeComicReferences.current
      );
      handleUpdatePanel(panelIndex, { image: newImage });
    } catch (err: any) {
      _setError(err.message || `Failed to regenerate panel ${panelIndex + 1}.`);
    } finally {
      setPanelLoadingState(prev => {
        const newSet = new Set(prev);
        newSet.delete(panelIndex);
        return newSet;
      });
    }
  }, [comicStripData, formDataCache, handleUpdatePanel, _setError]);

  const handleRefinePanelImage = useCallback(async (panelIndex: number) => {
    if (!comicStripData || !formDataCache) return;
    
    setPanelLoadingState(prev => new Set(prev).add(panelIndex));
    try {
      const panel = comicStripData.panels[panelIndex];
      const refinementPrompt = panel.user_consistency_tags.join(', ');
      
      if (!refinementPrompt) {
          throw new Error("Please add tags to describe the change you want to make.");
      }
      
      const newImage = await geminiService.refinePanelImage(
        panel.image,
        refinementPrompt,
        formDataCache.illustrationStyle,
        formDataCache.comedicStyle,
        activeComicReferences.current
      );
      handleUpdatePanel(panelIndex, { image: newImage });
    } catch (err: any) {
      _setError(err.message || `Failed to refine panel ${panelIndex + 1}.`);
    } finally {
       setPanelLoadingState(prev => {
        const newSet = new Set(prev);
        newSet.delete(panelIndex);
        return newSet;
      });
    }
  }, [comicStripData, formDataCache, handleUpdatePanel, _setError]);

  const onRegenerateConcept = useCallback(() => {
    if (formDataCache) {
      const newFormData = {...formDataCache, brainstormMode: false};
      handleFormSubmit(newFormData);
    }
  }, [formDataCache, handleFormSubmit]);
  
  const onRegenerateIdeas = useCallback(() => {
    if (formDataCache) {
      const newFormData = {...formDataCache, brainstormMode: true};
      handleFormSubmit(newFormData);
    }
  }, [formDataCache, handleFormSubmit]);
  
  const onUpdateReviewImage = useCallback((newImage: string) => {
    setReviewData(prev => prev ? { ...prev, firstPanelImage: newImage } : null);
  }, []);
  
  const onReturnFromSwiper = useCallback(() => {
    setAppStage('form');
    setComicPlans([]);
  }, []);
  
  const onReturnFromReview = useCallback(() => {
    if(formDataCache?.brainstormMode) {
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