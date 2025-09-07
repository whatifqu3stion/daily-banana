import React, { useState, useCallback } from 'react';
import { ComicStripData, FormData, PanelData, ComicPlan, PlanPanel } from './types';
import { geminiService } from './services/geminiService';
import { toBase64 } from './utils/fileUtils';
import ComicForm from './components/ComicForm';
import LoadingState from './components/LoadingState';
import ComicStrip from './components/ComicStrip';

const getFriendlyErrorMessage = (error: unknown): string => {
    let message = 'An unexpected error occurred. Please check the console.';
    if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
        message = error.message;
    } else if (error instanceof Error) {
        message = error.message;
    }

    if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED')) {
        return "You've exceeded the API request limit. Please wait a minute and try again.";
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

  const [formDataCache, setFormDataCache] = useState<FormData | null>(null);

  const generateInitialPositions = (panel: PlanPanel): Omit<PanelData, 'image'> => {
    // A simple function to generate some default positions and sizes
    const basePanelWidth = 500; // Assuming a standard panel width for calculation
    const basePanelHeight = 500;

    const getPosition = (hint?: string) => {
      switch (hint) {
        case 'top-left': return { x: 20, y: 20 };
        case 'top-right': return { x: basePanelWidth - 170, y: 20 };
        case 'bottom-left': return { x: 20, y: basePanelHeight - 80 };
        case 'bottom-right': return { x: basePanelWidth - 170, y: basePanelHeight - 80 };
        case 'center': return { x: basePanelWidth / 2 - 75, y: basePanelHeight / 2 - 30 };
        default: return { x: Math.random() * (basePanelWidth - 150), y: Math.random() * (basePanelHeight - 60) };
      }
    };
    
    const size = { width: 150, height: 60 };

    return {
      id: Math.random(),
      visual_prompt: panel.visual_prompt,
      caption: {
        id: Math.random().toString(),
        text: panel.caption || '',
        position: { x: 10, y: basePanelHeight - 40 },
        size: { width: basePanelWidth - 20, height: 30 },
      },
      bubbles: panel.bubbles?.map(b => ({
        id: Math.random().toString(),
        text: b.text,
        position: getPosition(b.positionHint),
        size: size,
        positionHint: b.positionHint,
      })) || [],
      sfx: panel.sfx?.map(s => ({
        id: Math.random().toString(),
        text: s.text,
        position: getPosition(s.positionHint),
        size: { width: 120, height: 50 },
        positionHint: s.positionHint,
      })) || [],
      layout: panel.layout,
      consistency_tags: panel.consistency_tags || [],
      user_consistency_tags: '',
    };
  };

  const handleFormSubmit = async (formData: FormData) => {
    setIsLoading(true);
    setError(null);
    setComicStrip(null);
    setFormDataCache(formData);

    try {
      setLoadingMessage('Processing reference images...');
      const referenceImages = formData.referenceImages ? await Promise.all(Array.from(formData.referenceImages).map(toBase64)) : [];
      
      setLoadingMessage('Generating comic plan from your brilliant idea...');
      const plan: ComicPlan = await geminiService.generateComicPlan(formData, referenceImages);

      let panelStructs = plan.panels.map(p => generateInitialPositions(p));
      const finalPanels: PanelData[] = [];
      const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

      for (let i = 0; i < plan.panels.length; i++) {
        setLoadingMessage(`Generating image for panel ${i + 1} of ${plan.panels.length}...`);
        const panelPlan = plan.panels[i];
        const panelScaffold = panelStructs[i];
        
        const image = await geminiService.generatePanelImage(
          panelPlan.visual_prompt,
          referenceImages,
          panelPlan.consistency_tags
        );

        finalPanels.push({ ...panelScaffold, image });
        
        // Add a longer delay between requests to avoid hitting rate limits
        if (i < plan.panels.length - 1) {
            setLoadingMessage('Pausing for a few seconds to respect API limits...');
            await delay(5000); // 5 second delay
        }
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
    }
  };

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
      const referenceImages = formDataCache.referenceImages ? await Promise.all(Array.from(formDataCache.referenceImages).map(toBase64)) : [];
      const userTags = panel.user_consistency_tags.split(',').map(t => t.trim()).filter(Boolean);
      
      const image = await geminiService.generatePanelImage(
        panel.visual_prompt,
        referenceImages,
        [...panel.consistency_tags, ...userTags]
      );
      
      handleUpdatePanel(panelIndex, { image });

    } catch (err) {
       console.error(err);
       setError(getFriendlyErrorMessage(err));
    } finally {
      setRegeneratingPanel(null);
    }
  }, [comicStrip, formDataCache, handleUpdatePanel]);


  const handleStartNew = () => {
    setComicStrip(null);
    setError(null);
    setIsLoading(false);
    setFormDataCache(null);
  };

  return (
    <div className="min-h-screen font-special-elite text-black">
      <header className="py-8">
        <div className="container mx-auto px-4 text-center">
            <div className="inline-block border-y-4 border-black py-2 px-6">
                <h1 className="font-special-elite text-5xl font-bold tracking-widest uppercase">
                    The Daily Banana
                </h1>
            </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {!comicStrip && !isLoading && (
          <ComicForm onSubmit={handleFormSubmit} isLoading={isLoading} />
        )}

        {isLoading && <LoadingState message={loadingMessage} />}

        {error && (
           <div className="text-center my-8 p-4 bg-transparent border-2 border-dashed border-black max-w-2xl mx-auto">
            <h2 className="font-bold text-lg mb-2">Oops, something went wrong!</h2>
            <p>{error}</p>
          </div>
        )}

        {comicStrip && !isLoading && (
          <ComicStrip
            comicData={comicStrip}
            onUpdatePanel={handleUpdatePanel}
            onRegeneratePanelImage={handleRegeneratePanelImage}
            onStartNew={handleStartNew}
            isPanelLoading={(panelIndex) => regeneratingPanel === panelIndex}
          />
        )}
      </main>

       <footer className="text-center py-6 text-gray-700 text-sm font-special-elite">
        <p>Powered by Gemini.</p>
      </footer>
    </div>
  );
}

export default App;