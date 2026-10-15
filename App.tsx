// App.tsx — root layout component.
// Owns the masthead, footer, and top-level stage rendering.
// All comic generation state and logic lives in useComicGeneration().
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import useComicGeneration from './hooks/useComicGeneration';
import ComicForm from './components/ComicForm';
import LoadingState from './components/LoadingState';
import StorySwiper from './components/StorySwiper';
import ReviewPlan from './components/ReviewPlan';
import ComicStrip from './components/ComicStrip';
import ErrorState from './components/ErrorState';
import ConfirmationModal from './components/ConfirmationModal';
import ApiKeySettings from './components/ApiKeySettings';
import { hasGeminiKey, subscribeGeminiConnection } from './services/geminiConnection';

const App: React.FC = () => {
  const hasApiKey = useSyncExternalStore(subscribeGeminiConnection, hasGeminiKey, () => false);
  const [isDiscardConfirmationOpen, setIsDiscardConfirmationOpen] = useState(false);
  const [isApiSettingsOpen, setIsApiSettingsOpen] = useState(false);
  const {
    appStage,
    formData,
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
    onUpdateSetDescription,
    onUpdateStory,
    onReturnFromSwiper,
    onReturnFromReview,
  } = useComicGeneration();

  // Safety net: if appStage ever reaches an unexpected value, reset to form.
  // Done in an effect rather than as a render side-effect to keep renderContent pure.
  useEffect(() => {
    const validStages = ['form', 'story-swipe', 'review', 'strip'];
    if (!validStages.includes(appStage)) {
      handleStartNew();
    }
  }, [appStage, handleStartNew]);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const stageMeta = {
    form: { label: '01 · File the idea', title: 'Start with the story' },
    'story-swipe': { label: '02 · Choose the angle', title: 'Choose the angle' },
    review: { label: '03 · Proof the first panel', title: 'Proof the first panel' },
    strip: { label: '04 · Make the edition', title: 'Your comic is ready' },
  } as const;
  const currentStage = stageMeta[appStage as keyof typeof stageMeta] ?? stageMeta.form;
  const isSetup = appStage === 'form' && !isLoading;
  const requestNewComic = () => setIsDiscardConfirmationOpen(true);
  const confirmNewComic = () => {
    setIsDiscardConfirmationOpen(false);
    handleStartNew();
  };

  const renderContent = () => {
    if (isLoading && appStage !== 'strip') {
      return <LoadingState messages={loadingMessages} progress={progress} showDots={appStage !== 'review'} />;
    }

    if (error) {
      return (
        <ErrorState error={error} onStartOver={handleStartNew} onOpenApiSettings={() => setIsApiSettingsOpen(true)} />
      );
    }

    switch (appStage) {
      case 'form':
        return <ComicForm onSubmit={handleFormSubmit} isLoading={isLoading} hasApiKey={hasApiKey} onOpenApiSettings={() => setIsApiSettingsOpen(true)} />;
      case 'story-swipe':
        return (
          <StorySwiper
            storyPlans={comicPlans}
            onSelectStory={handleSelectStory}
            onUpdateStory={onUpdateStory}
            onRegenerate={formData?.brainstormMode ? onRegenerateIdeas : onRegenerateConcept}
            onReturnToForm={onReturnFromSwiper}
            onCustomPremise={handleCustomPremise}
            isCustomPremiseLoading={isCustomPremiseLoading}
            customPremiseError={customPremiseError}
          />
        );
      case 'review':
        if (!reviewData) return <ErrorState error="No review data available. Please start over." onStartOver={handleStartNew} onOpenApiSettings={() => setIsApiSettingsOpen(true)} />;
        return (
          <ReviewPlan
            reviewData={reviewData}
            formData={formData}
            onContinue={handleContinueGeneration}
            onReturnToForm={onReturnFromReview}
            onRegenerateConcept={onRegenerateConcept}
            onUpdateReviewImage={onUpdateReviewImage}
            onUpdateSetDescription={onUpdateSetDescription}
          />
        );
      case 'strip':
        if (!comicStripData) return <ErrorState error="No comic data available. Please start over." onStartOver={handleStartNew} onOpenApiSettings={() => setIsApiSettingsOpen(true)} />;
        return (
          <ComicStrip
            comicData={comicStripData}
            onUpdatePanel={handleUpdatePanel}
            onRegeneratePanelImage={handleRegeneratePanelImage}
            onRefinePanelImage={handleRefinePanelImage}
            onStartNew={requestNewComic}
            onRegenerateComic={onRegenerateConcept}
            isPanelLoading={isPanelLoading}
            footerDisclaimer="AI-generated satire. All characters &amp; events are fictional. Any resemblance to reality is coincidental and hilarious."
          />
        );
      default:
        // The useEffect above will call handleStartNew() on the next tick.
        return <ComicForm onSubmit={handleFormSubmit} isLoading={isLoading} hasApiKey={hasApiKey} onOpenApiSettings={() => setIsApiSettingsOpen(true)} />;
    }
  };

  return (
    <div className="min-h-[100dvh] px-3 py-3 sm:px-6 sm:py-6 font-sans">
      <header className={`mx-auto w-full max-w-6xl ${isSetup ? 'mb-10 sm:mb-14' : 'mb-6'}`}>
        {!isSetup && (
          <div className="compact-masthead grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 border-y-2 border-black py-2.5 sm:py-3 lg:gap-5">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <img src="/banana-boy-mascot.png" alt="" className="h-9 w-auto flex-shrink-0 sm:h-12 md:h-14 lg:h-16" />
              <span className="whitespace-nowrap font-masthead text-xl leading-none sm:text-2xl md:text-3xl lg:text-4xl">The Daily Banana</span>
            </div>
            <span className="text-right text-xs font-bold font-special-elite uppercase tracking-wide text-gray-900 sm:text-sm md:text-base lg:text-lg">{today}</span>
          </div>
        )}
        {isSetup && <div className="text-center">
        <div className="w-full max-w-6xl mx-auto h-1 bg-black mb-2"></div>
        <div className="flex justify-center max-w-6xl mx-auto">
          <div className="inline-flex flex-col md:flex-row items-center gap-1 md:gap-2">
          <img src="/banana-boy-mascot.png" alt="Banana Boy mascot" className="h-20 sm:h-28 md:h-36 lg:h-44 w-auto flex-shrink-0" />
          <div className="text-center min-w-0">
            <p className="text-xs sm:text-lg md:text-2xl font-special-elite text-gray-800 tracking-wide md:tracking-extrawidest">
              {today}
            </p>
            <h1 className="masthead-title font-masthead font-black mt-1" data-text="The Daily Banana">
              The Daily Banana
            </h1>
            <p className="text-xs sm:text-base md:text-xl font-special-elite text-gray-800 mt-1 md:mt-2">
              The news makes us want to cry, but we choose to laugh.
            </p>
          </div>
          </div>
        </div>
        <div className="w-full max-w-6xl mx-auto h-0.5 bg-black mt-2"></div>
        </div>}
      </header>
      <main>
        <div className="mx-auto mb-6 flex w-full max-w-5xl items-center gap-3" aria-label={`Current stage: ${currentStage.label}`}>
          <span className="shrink-0 text-xs font-bold uppercase tracking-[0.14em] text-gray-600">{currentStage.label}</span>
          <div className="h-1 flex-1 bg-black/15" role="progressbar" aria-valuemin={1} aria-valuemax={4} aria-valuenow={['form','story-swipe','review','strip'].indexOf(appStage) + 1}>
            <div className="h-full bg-black transition-[width] duration-300" style={{ width: `${((['form','story-swipe','review','strip'].indexOf(appStage) + 1) / 4) * 100}%` }} />
          </div>
        </div>
        {renderContent()}
      </main>
      <footer className="text-center mt-12 font-special-elite text-gray-800">
          <p className="text-lg">
            Built with Google Nano Banana, made by <a href="https://x.com/SummitSatoshi" target="_blank" rel="noopener noreferrer" className="underline hover:text-black">SummitSatoshi</a>
          </p>
          <p className="text-xs mt-2 max-w-3xl mx-auto">
            All content is the sole view of the creator, not the tool owner, by using this service you agree to comply with Google’s T.O.S. and all other applicable laws.
          </p>
          {hasApiKey && isSetup && (
            <div className="mt-4 flex justify-center">
              <ApiSettingsButton connected={hasApiKey} onClick={() => setIsApiSettingsOpen(true)} />
            </div>
          )}
      </footer>
      <ConfirmationModal
        isOpen={isDiscardConfirmationOpen}
        title="Start a new comic?"
        message={<p>Your generated comic and any unsaved panel edits will be discarded. Your saved setup choices will remain available.</p>}
        confirmText="Discard and start new"
        cancelText="Keep editing"
        onConfirm={confirmNewComic}
        onCancel={() => setIsDiscardConfirmationOpen(false)}
      />
      {isApiSettingsOpen && (
        <ApiKeySettings
          disabled={isLoading || isCustomPremiseLoading || [0, 1, 2, 3].some(isPanelLoading)}
          onClose={() => {
            setIsApiSettingsOpen(false);
            // Connecting removes the error launcher. Restore a useful focus
            // target when the dialog's original opener no longer exists.
            requestAnimationFrame(() => {
              if (document.activeElement === document.body) {
                document.getElementById('generate-comic-plan')?.focus();
              }
            });
          }}
        />
      )}
    </div>
  );
};

interface ApiSettingsButtonProps {
  connected: boolean;
  onClick: () => void;
}

const ApiSettingsButton: React.FC<ApiSettingsButtonProps> = ({ connected, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={`API settings. ${connected ? 'Connected' : 'Not connected'}.`}
    className="inline-flex items-center gap-2 border-2 border-black bg-paper-light px-2.5 py-2 text-[0.65rem] font-bold uppercase tracking-wide hover:bg-banana focus:outline-none focus-visible:ring-2 focus-visible:ring-black sm:px-3 sm:text-xs"
  >
    <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full border border-black ${connected ? 'bg-black' : 'bg-transparent'}`} />
    <span className="sm:hidden">API</span>
    <span className="hidden sm:inline">API settings</span>
    <span className="hidden text-[0.6rem] tracking-normal sm:inline">{connected ? 'Connected' : 'Not connected'}</span>
  </button>
);

export default App;