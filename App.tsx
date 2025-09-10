
import React, { useState, useCallback } from 'react';
import { ComicStripData, ComicFormData, PanelData, ComicPlan, PlanPanel, TextElementData, ProcessedReferenceImage } from './types';
import { geminiService } from './services/geminiService';
import { toBase64 } from './utils/fileUtils';
import ComicForm from './components/ComicForm';
import LoadingState from './components/LoadingState';
import ComicStrip from './components/ComicStrip';
import { layoutAdapter, LayoutProps } from './utils/layoutAdapter';
import BananaIcon from './components/icons/BananaIcon';

const getFriendlyErrorMessage = (error: unknown): string => {
    let message = 'An unexpected error occurred. Please check the console.';
    if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
        message = error.message;
    } else if (error instanceof Error) {
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

function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [comicStrip, setComicStrip] = useState<ComicStripData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regeneratingPanel, setRegeneratingPanel] = useState<number | null>(null);
  const [refiningPanel, setRefiningPanel] = useState<number | null>(null);
  const [loadingProgress, setLoadingProgress] = useState<{ current: number; total: number } | null>(null);
  
  const [formDataCache, setFormDataCache] = useState<ComicFormData | null>(null);
  const [cachedReferenceImages, setCachedReferenceImages] = useState<ProcessedReferenceImage[]>([]);

  const todaysDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const generateInitialPositions = (panel: PlanPanel, layoutProps: LayoutProps): Omit<PanelData, 'image'> => {
    const textElements: TextElementData[] = (panel.text_elements || []).map(te => {
        return {
            id: Math.random().toString(),
            text: te.text,
            role: te.role,
            position: te.position, // Directly from AI plan
            size: te.size,         // Directly from AI plan
            // Speech bubbles get a default tail pointing down, which can be dragged.
            tailPosition: te.role === 'speech' ? { x: '50%', y: '115%' } : undefined,
        }
    });

    return {
      id: Math.random(),
      visual_prompt: panel.visual_prompt,
      text_elements: textElements,
      consistency_tags: panel.consistency_tags || [],
      user_consistency_tags: [],
      layoutProps,
    };
  };

  const handleFormSubmit = useCallback(async (formData: ComicFormData) => {
    setIsLoading(true);
    setError(null);
    setLoadingProgress(null);
    setComicStrip(null);
    setFormDataCache(formData);
    setCachedReferenceImages([]);

    try {
      setLoadingMessage('Processing reference images...');
      const referenceImagesWithTags: ProcessedReferenceImage[] = formData.referenceImages ? await Promise.all(
        Array.from(formData.referenceImages).map(async (refImg) => {
          const { base64, mimeType } = await toBase64(refImg.file);
          return { base64, mimeType, tag: refImg.tag };
        })
      ) : [];
      
      setCachedReferenceImages(referenceImagesWithTags);
      
      setLoadingMessage('Generating comic plan from your brilliant idea...');
      const plan: ComicPlan = await geminiService.generateComicPlan(formData, referenceImagesWithTags);

      let panelsForLayout = plan.panels;
      if (formData.useImageReferencesForInitialGeneration && referenceImagesWithTags.length > 0) {
        // If using image references for generation, force all panels to be 1:1 aspect ratio.
        panelsForLayout = plan.panels.map(p => ({ ...p, aspect_ratio: '1:1' }));
        setLoadingMessage("Using references for generation... all panels will be square.");
        await new Promise(resolve => setTimeout(resolve, 1500)); // Give user time to read message
      }
      
      const panelLayouts = layoutAdapter(panelsForLayout);
      const panelStructs = panelsForLayout.map((p, i) => generateInitialPositions(p, panelLayouts[i]));
      
      const finalPanels: PanelData[] = [];
      setLoadingProgress({ current: 0, total: plan.panels.length });

      for (let i = 0; i < plan.panels.length; i++) {
        setLoadingMessage(`Generating image for panel ${i + 1} of ${plan.panels.length}...`);
        const panelPlan = plan.panels[i]; // Original plan for prompts
        const panelScaffold = panelStructs[i];
        
        let image: string;

        if (formData.useImageReferencesForInitialGeneration && referenceImagesWithTags.length > 0) {
            image = await geminiService.generatePanelImageWithReferences(
                panelPlan.visual_prompt,
                panelPlan.consistency_tags,
                formData.illustrationStyle,
                formData.tone,
                referenceImagesWithTags
            );
        } else {
            image = await geminiService.generatePanelImage(
              panelPlan.visual_prompt,
              panelScaffold.layoutProps.aspectRatio, // Use aspect ratio from scaffold
              panelPlan.consistency_tags,
              formData.illustrationStyle,
              formData.tone
            );
        }

        finalPanels.push({ ...panelScaffold, image });
        setLoadingProgress({ current: i + 1, total: plan.panels.length });
      }

      const comicStripData: ComicStripData = {
        title: plan.title,
        panels: finalPanels,
      };

      setComicStrip(comicStripData);

    } catch (err) {
      console.error(err);
      setError(getFriendlyErrorMessage(err));
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
      setLoadingProgress(null);
    }
  }, []);

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
      const tone = formDataCache?.tone;
      
      const image = await geminiService.generatePanelImage(
        panel.visual_prompt,
        panel.layoutProps.aspectRatio,
        [...panel.consistency_tags, ...panel.user_consistency_tags],
        illustrationStyle,
        tone
      );
      
      handleUpdatePanel(panelIndex, { image });

    } catch (err) {
       console.error(err);
       setError(getFriendlyErrorMessage(err));
    } finally {
      setRegeneratingPanel(null);
    }
  }, [comicStrip, formDataCache, handleUpdatePanel]);

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
      const tone = formDataCache?.tone;
      const refinementPrompt = panel.user_consistency_tags.join(', ');
      const image = await geminiService.refinePanelImage(panel.image, refinementPrompt, illustrationStyle, tone, cachedReferenceImages);
      handleUpdatePanel(panelIndex, { image });

    } catch (err) {
      console.error(err);
      setError(getFriendlyErrorMessage(err));
    } finally {
      setRefiningPanel(null);
    }
  }, [comicStrip, formDataCache, handleUpdatePanel, cachedReferenceImages]);


  const handleStartNew = () => {
    setComicStrip(null);
    setError(null);
    setIsLoading(false);
    setFormDataCache(null);
    setCachedReferenceImages([]);
  };

  const handleRegenerateComic = useCallback(() => {
    if (formDataCache) {
      handleFormSubmit(formDataCache);
    } else {
      setError("Could not regenerate comic: original settings not found. Please create a new one.");
    }
  }, [formDataCache, handleFormSubmit]);

  const headerContainerClass = comicStrip ? 'max-w-5xl' : 'max-w-3xl';

  return (
    <div className="min-h-screen font-special-elite text-black">
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
        {isLoading ? (
          <LoadingState message={loadingMessage} progress={loadingProgress} />
        ) : comicStrip ? (
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
              onRegenerateComic={handleRegenerateComic}
              isPanelLoading={(panelIndex) => regeneratingPanel === panelIndex || refiningPanel === panelIndex}
              footerCredit="Powered by Gemini. Made with 💛 by "
              footerLinkText="@SummitSatoshi"
              footerLinkHref="https://x.com/SummitSatoshi"
              footerDisclaimer="content is AI-generated & subject to Google TOS • not the creators’ views • not political advice."
            />
          </>
        ) : (
          <>
            <ComicForm onSubmit={handleFormSubmit} isLoading={isLoading} />
            {error && (
              <div className="text-center my-8 p-4 max-w-2xl mx-auto">
                <p className="text-red-800 font-bold text-lg">{error}</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
