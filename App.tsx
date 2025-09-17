

import React, { useState, useCallback } from 'react';
import { ComicStripData, ComicFormData, PanelData, ComicPlan, PlanPanel, TextElementData, ProcessedReferenceImage, AppStage } from './types';
import { geminiService } from './services/geminiService';
import { toBase64 } from './utils/fileUtils';
import ComicForm from './components/ComicForm';
import LoadingState from './components/LoadingState';
import ComicStrip from './components/ComicStrip';
import StorySwiper from './components/StorySwiper'; // New component for story selection
import ReviewPlan from './components/ReviewPlan';
import { layoutAdapter, LayoutProps } from './utils/layoutAdapter';
import BananaIcon from './components/icons/BananaIcon';

const getFriendlyErrorMessage = (error: unknown): string => {
    let message = 'An unexpected error occurred. Please check the console.';
    if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
        message = error.message;
    }

    if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED') || message.includes('rate limit')) {
        let quotaType = 'API request';
        const lowerCaseMessage = message.toLowerCase();

        if (lowerCaseMessage.includes('requests per minute') || lowerCaseMessage.includes('rpm')) {
            quotaType = 'Requests Per Minute (RPM)';
        } else if (lowerCaseMessage.includes('requests per day') || lowerCaseMessage.includes('rpd') || lowerCaseMessage.includes('daily')) {
            quotaType = 'Requests Per Day (RPD)';
        } else if (lowerCaseMessage.includes('token')) {
            quotaType = 'Tokens Per Minute (TPM)';
        }
        
        return `You've exceeded the ${quotaType} limit. Please wait a moment and try again.`;
    }
    if (message.includes('500')) {
        return "The AI server encountered an error. Please try again later.";
    }

    return message;
};

// Type for the intermediate review data
interface ReviewData {
  plan: ComicPlan;
  firstPanelImage: string; // base64
  userProvidedImages: ProcessedReferenceImage[];
  panelLayouts: LayoutProps[];
}

const STORY_BRAINSTORM_MESSAGES = [
    "Drafting witty story concepts...",
    "Structuring hilarious panel layouts...",
    "Polishing the perfect punchlines...",
    "Fact-checking the absurdity...",
    "Finalizing the narrative arcs..."
];

function App() {
  const [appStage, setAppStage] = useState<AppStage>('form');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState<string[]>([]);
  const [comicStrip, setComicStrip] = useState<ComicStripData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regeneratingPanel, setRegeneratingPanel] = useState<number | null>(null);
  const [refiningPanel, setRefiningPanel] = useState<number | null>(null);
  const [loadingProgress, setLoadingProgress] = useState<{ current: number; total: number } | null>(null);
  
  const [formDataCache, setFormDataCache] = useState<ComicFormData | null>(null);
  const [activeComicReferences, setActiveComicReferences] = useState<ProcessedReferenceImage[]>([]);
  const [storyPlans, setStoryPlans] = useState<ComicPlan[] | null>(null);
  const [reviewData, setReviewData] = useState<ReviewData | null>(null);


  const todaysDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Footer content, defined once for consistency.
  const footerCredit="Powered by Gemini. Made with 💛 by ";
  const footerLinkText="@SummitSatoshi";
  const footerLinkHref="https://x.com/SummitSatoshi";
  const footerDisclaimer="content is AI-generated & subject to Google TOS • not the creators’ views • not political advice.";


  const generateInitialPositions = (panel: PlanPanel, layoutProps: LayoutProps): Omit<PanelData, 'image'> => {
    const textElements: TextElementData[] = (panel.text_elements || []).map(te => {
        return {
            id: crypto.randomUUID(),
            text: te.text,
            role: te.role,
            position: te.position,
            size: te.size,
            tailPosition: te.role === 'speech' ? { x: '50%', y: '115%' } : undefined,
        }
    });

    return {
      id: crypto.randomUUID(),
      visual_prompt: panel.visual_prompt,
      text_elements: textElements,
      consistency_tags: panel.consistency_tags || [],
      user_consistency_tags: [],
      layoutProps,
    };
  };

  // Phase 1: Generate one or more story plans based on user choice
  const handleFormSubmit = useCallback(async (formData: ComicFormData) => {
    setIsLoading(true);
    setError(null);
    setComicStrip(null);
    setFormDataCache(formData);
    setStoryPlans(null);
    setReviewData(null);
    setActiveComicReferences([]);

    try {
      setLoadingMessages(['Processing reference images...']);
      const userProvidedImages: ProcessedReferenceImage[] = formData.referenceImages ? await Promise.all(
        Array.from(formData.referenceImages).map(async (refImg) => {
          const { base64, mimeType } = await toBase64(refImg.file);
          return { base64, mimeType, tag: refImg.tag };
        })
      ) : [];
      
      setActiveComicReferences(userProvidedImages);
      
      setLoadingMessages(STORY_BRAINSTORM_MESSAGES);
      
      if (formData.brainstormMode) {
        // Multi-idea mode
        const plans: ComicPlan[] = await geminiService.generateMultipleComicPlans(formData, userProvidedImages);
        setStoryPlans(plans);
        setAppStage('story-swipe');
      } else {
        // Single-idea (default) mode
        const plan: ComicPlan = await geminiService.generateSingleComicPlan(formData, userProvidedImages);
        // Skip the swiper and go directly to image preview generation
        await handleStorySelected(plan);
      }

    } catch (err) {
      console.error(err);
      setError(getFriendlyErrorMessage(err));
      setAppStage('form'); // Go back to form on error
    } finally {
      // Don't set isLoading to false if we successfully chained into handleStorySelected
      if (appStage !== 'review') {
          setIsLoading(false);
          setLoadingMessages([]);
      }
    }
  }, [appStage]); // Add appStage dependency to avoid stale state in finally block

  // Phase 2: User selects a story (or it's auto-selected), now generate the first panel image
  const handleStorySelected = useCallback(async (selectedPlan: ComicPlan) => {
    if (!formDataCache) return;

    setIsLoading(true);
    setError(null);
    setLoadingMessages(['Generating a preview image for the first panel...']);
    setAppStage('review'); // Transition to show loading state

    try {
      const firstPanelPlan = selectedPlan.panels[0];
      const firstPanelImage = await geminiService.generatePanelImageWithReferences(
            firstPanelPlan.visual_prompt,
            firstPanelPlan.consistency_tags,
            formDataCache.illustrationStyle,
            formDataCache.comedicStyle,
            activeComicReferences
      );

      const panelsForLayout = selectedPlan.panels.map(p => ({ ...p, aspect_ratio: '1:1' as const }));
      const panelLayouts = layoutAdapter(panelsForLayout);

      setReviewData({ plan: selectedPlan, firstPanelImage, userProvidedImages: activeComicReferences, panelLayouts });

    } catch (err) {
      console.error(err);
      setError(getFriendlyErrorMessage(err));
      setAppStage(formDataCache.brainstormMode ? 'story-swipe' : 'form'); // Go back to appropriate previous step
    } finally {
      setIsLoading(false);
      setLoadingMessages([]);
    }
  }, [formDataCache, activeComicReferences]);


  // Phase 3: Generate the rest of the comic from the approved plan
  const handleContinueGeneration = useCallback(async () => {
    if (!reviewData || !formDataCache) return;

    setIsLoading(true);
    setAppStage('strip'); // Show loading state over a blank screen
    setError(null);
    setLoadingProgress({ current: 0, total: reviewData.plan.panels.length - 1});
    
    try {
      const { plan, firstPanelImage, userProvidedImages, panelLayouts } = reviewData;
      
      let currentGenerationRefs = [...userProvidedImages];
      // AUTO-CONSISTENCY: Use the first panel's (potentially refined) image as a reference
      if (userProvidedImages.length === 0) {
        const styleRef = { base64: firstPanelImage, mimeType: 'image/png', tag: 'auto-generated style reference' };
        currentGenerationRefs.push(styleRef);
      }
      setActiveComicReferences(currentGenerationRefs);

      const firstPanelScaffold = generateInitialPositions(plan.panels[0], panelLayouts[0]);
      const finalPanels: PanelData[] = [{ ...firstPanelScaffold, image: firstPanelImage }];

      const remainingPanels = plan.panels.slice(1);
      
      setLoadingMessages([`Generating remaining ${remainingPanels.length} panel images...`]);

      // Generate remaining images in parallel
      const imagePromises = remainingPanels.map((panelPlan) => 
        geminiService.generatePanelImageWithReferences(
            panelPlan.visual_prompt,
            panelPlan.consistency_tags,
            formDataCache.illustrationStyle,
            formDataCache.comedicStyle,
            currentGenerationRefs
        )
      );

      const remainingImages = await Promise.all(imagePromises);

      remainingImages.forEach((image, i) => {
        const panelIndex = i + 1;
        const panelScaffold = generateInitialPositions(plan.panels[panelIndex], panelLayouts[panelIndex]);
        finalPanels.push({ ...panelScaffold, image });
      });

      const comicStripData: ComicStripData = { title: plan.title, panels: finalPanels };
      setComicStrip(comicStripData);

    } catch (err) {
        console.error(err);
        setError(getFriendlyErrorMessage(err));
    } finally {
        setIsLoading(false);
        setLoadingMessages([]);
        setLoadingProgress(null);
    }

  }, [reviewData, formDataCache]);


  const handleUpdatePanel = useCallback((panelIndex: number, updatedData: Partial<PanelData>) => {
    setComicStrip(prev => {
      if (!prev) return null;
      const newPanels = [...prev.panels];
      newPanels[panelIndex] = { ...newPanels[panelIndex], ...updatedData };
      return { ...prev, panels: newPanels };
    });
  }, []);

  const handleRegeneratePanelImage = useCallback(async (panelIndex: number) => {
    if (!comicStrip || !formDataCache) return;
    
    setRegeneratingPanel(panelIndex);
    setError(null);
    
    try {
      const panel = comicStrip.panels[panelIndex];
      const illustrationStyle = formDataCache?.illustrationStyle;
      const comedicStyle = formDataCache?.comedicStyle;
      
      const image = await geminiService.generatePanelImageWithReferences(
        panel.visual_prompt,
        [...panel.consistency_tags, ...panel.user_consistency_tags],
        illustrationStyle,
        comedicStyle,
        activeComicReferences
      );
      
      handleUpdatePanel(panelIndex, { image });

    } catch (err) {
       console.error(err);
       setError(getFriendlyErrorMessage(err));
    } finally {
      setRegeneratingPanel(null);
    }
  }, [comicStrip, formDataCache, handleUpdatePanel, activeComicReferences]);

  const handleRefinePanelImage = useCallback(async (panelIndex: number) => {
    if (!comicStrip || !formDataCache) return;
    
    setRefiningPanel(panelIndex);
    setError(null);

    try {
      const panel = comicStrip.panels[panelIndex];
      if (panel.user_consistency_tags.length === 0) {
        setError("Please add refinement details to describe the change you want to make.");
        setRefiningPanel(null);
        return;
      }
      
      const illustrationStyle = formDataCache?.illustrationStyle;
      const comedicStyle = formDataCache?.comedicStyle;
      const refinementPrompt = panel.user_consistency_tags.join(', ');
      const image = await geminiService.refinePanelImage(
        panel.image, 
        refinementPrompt, 
        illustrationStyle, 
        comedicStyle, 
        activeComicReferences
      );
      handleUpdatePanel(panelIndex, { image });

    // FIX: Corrected a malformed try...catch...finally block. Added braces to the catch block and removed a stray closing brace before the finally block.
    } catch (err) {
      console.error(err);
      setError(getFriendlyErrorMessage(err));
    } finally {
      setRefiningPanel(null);
    }
  }, [comicStrip, formDataCache, handleUpdatePanel, activeComicReferences]);


  const handleStartNew = () => {
    setComicStrip(null);
    setError(null);
    setIsLoading(false);
    setFormDataCache(null);
    setActiveComicReferences([]);
    setStoryPlans(null);
    setReviewData(null);
    setAppStage('form');
  };

  const handleRegenerateConcept = useCallback(() => {
    if (formDataCache) {
      handleFormSubmit(formDataCache);
    }
  }, [formDataCache, handleFormSubmit]);

  const handleUpdateReviewImage = useCallback((newImage: string) => {
    setReviewData(prev => prev ? ({ ...prev, firstPanelImage: newImage }) : null);
  }, []);


  const headerContainerClass = comicStrip ? 'max-w-5xl' : 'max-w-3xl';

  const renderContent = () => {
    if (isLoading) {
      return <LoadingState messages={loadingMessages} progress={loadingProgress} />;
    }

    switch (appStage) {
      case 'story-swipe':
        return storyPlans && (
          <StorySwiper 
            storyPlans={storyPlans}
            onSelectStory={handleStorySelected}
            onRegenerate={handleRegenerateConcept}
            onReturnToForm={handleStartNew}
          />
        );
      case 'review':
        // The review stage might show a loader if the image is still generating
        if (!reviewData) {
           return <LoadingState messages={loadingMessages} progress={loadingProgress} />;
        }
        return formDataCache && (
          <ReviewPlan 
            reviewData={reviewData}
            formData={formDataCache}
            onContinue={handleContinueGeneration}
            onReturnToForm={() => formDataCache.brainstormMode ? setAppStage('story-swipe') : handleStartNew() }
            onRegenerateConcept={handleRegenerateConcept}
            onUpdateReviewImage={handleUpdateReviewImage}
          />
        );
      case 'strip':
        return comicStrip ? (
          <>
            {error && (
              <div className="text-center my-8 p-4 max-w-2xl mx-auto">
                <p className="text-red-800 font-bold text-lg">{error}</p>
              </div>
            )}
            <ComicStrip
              comicData={comicStrip}
              onUpdatePanel={handleUpdatePanel}
              onRegeneratePanelImage={handleRegeneratePanelImage}
              onRefinePanelImage={handleRefinePanelImage}
              onStartNew={handleStartNew}
              onRegenerateComic={handleRegenerateConcept}
              isPanelLoading={(panelIndex) => regeneratingPanel === panelIndex || refiningPanel === panelIndex}
              footerCredit={footerCredit}
              footerLinkText={footerLinkText}
              footerLinkHref={footerLinkHref}
              footerDisclaimer={footerDisclaimer}
            />
          </>
        ) : (
           <>
            {/* This case handles when generation finishes but there's an error */}
            {error && (
              <div className="text-center my-8 p-4 max-w-2xl mx-auto">
                <p className="text-red-800 font-bold text-lg">{error}</p>
                <button onClick={handleStartNew} className="mt-4 px-4 py-2 bg-black text-white font-bold rounded">Start Over</button>
              </div>
            )}
           </>
        );
      case 'form':
      default:
        return (
          <>
            <ComicForm onSubmit={handleFormSubmit} isLoading={isLoading} />
            {error && (
              <div className="text-center my-8 p-4 max-w-2xl mx-auto">
                <p className="text-red-800 font-bold text-lg">{error}</p>
              </div>
            )}
          </>
        );
    }
  };

  return (
    <div className="min-h-screen font-special-elite text-black flex flex-col">
      <header className="py-8">
        <div className={`container mx-auto px-4 ${headerContainerClass}`}>
          <div className="border-y-4 border-black py-4 text-center relative">
              <h1 className="font-special-elite text-5xl font-bold tracking-widest uppercase flex justify-center items-center gap-2">
                  <BananaIcon className="-mt-1" />
                  <span>The Daily Banana</span>
              </h1>
              <div className="flex justify-center items-center flex-wrap gap-x-4 mt-2 text-base font-lora px-2">
                <span>{todaysDate}</span>
                <span className="text-gray-500 hidden md:inline">•</span>
                <p className="italic w-full md:w-auto">"Comics today, profitability tomorrow(ish)."</p>
              </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {renderContent()}
      </main>
      
      {/* Global footer, hidden on the final strip page to avoid duplication */}
      {appStage !== 'strip' && (
        <footer className="text-center py-8 mt-auto font-special-elite text-base container mx-auto px-4">
          <div className="border-t-2 border-black pt-4">
            <p>
              {footerCredit}
              <a href={footerLinkHref} target="_blank" rel="noopener noreferrer" className="underline">
                {footerLinkText}
              </a>
            </p>
            <p className="text-sm text-gray-600 mt-1">{footerDisclaimer}</p>
          </div>
        </footer>
      )}
    </div>
  );
}

export default App;