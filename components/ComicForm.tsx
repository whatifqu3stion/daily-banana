// components/ComicForm.tsx
// The primary input form. Collects topic, stance, comedic style, illustration
// style, image model, optional reference images, and an optional news context
// string sourced from the NewsSelector modal. Handles a sensitive-topic
// gate (ConfirmationModal) before submitting to the parent's onSubmit handler.
import React, { useState, useRef, useEffect } from 'react';
import { ComicFormData, Stance, ComedicStyle, ImageModel, ReferenceImage, NewsStory } from '../types';
import { STANCE_OPTIONS, COMEDIC_STYLE_OPTIONS, ILLUSTRATION_STYLE_OPTIONS, IMAGE_MODEL_OPTIONS } from '../constants';
import { getTopStories } from '../services/newsService';
import SparklesIcon from './icons/SparklesIcon';
import NewspaperIcon from './icons/NewspaperIcon';
import NewsSelector from './NewsSelector';
import Tooltip from './Tooltip';
import CustomSelect from './CustomSelect';
import UploadIcon from './icons/UploadIcon';
import ConfirmationModal from './ConfirmationModal'; // Import the new modal

interface ComicFormProps {
  onSubmit: (formData: ComicFormData) => void;
  isLoading: boolean;
}

// Internal state type for managing file previews
interface ReferenceImageState extends ReferenceImage {
  previewUrl: string;
}

// Topics that are likely to trip the AI safety filters before a useful comic
// can be generated. Uses whole-word regex matching to avoid false positives
// (e.g. "salt" shouldn't match "assault").
const SENSITIVE_KEYWORDS = [
  'shooting', 'shot', 'gun violence', 'massacre', 'killing', 'killed',
  'attack', 'bombing', 'terrorist', 'terrorism',
  'suicide', 'self-harm',
  'tragedy', 'disaster', 'crash',
  'assault', 'murder', 'homicide', 'slaughter',
  'war', 'invasion', 'genocide',
];

const checkForSensitiveContent = (topic: string): boolean => {
  const lowerCaseTopic = topic.toLowerCase();
  // Use a regex to match whole words to avoid false positives on words like "assault" in "salt"
  return SENSITIVE_KEYWORDS.some(keyword =>
    new RegExp(`\\b${keyword}\\b`).test(lowerCaseTopic)
  );
};


const STORAGE_KEY = 'dailyBanana_formState';

const loadSavedForm = (): Partial<ComicFormData> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const ComicForm: React.FC<ComicFormProps> = ({ onSubmit, isLoading }) => {
  const [formData, setFormData] = useState<ComicFormData>(() => {
    const saved = loadSavedForm();
    return {
      topic: saved.topic ?? '',
      stance: saved.stance ?? 'critical',
      comedicStyle: saved.comedicStyle ?? 'satirical',
      illustrationStyle: saved.illustrationStyle ?? 'default-color',
      imageModel: (IMAGE_MODEL_OPTIONS.some(o => o.value === saved.imageModel)
        ? saved.imageModel
        : 'gemini-3.1-flash-image-preview') as ImageModel,
      newsContext: saved.newsContext,
      referenceImages: [],
      brainstormMode: saved.brainstormMode ?? false,
      includeContext: saved.includeContext ?? false,
    };
  });
  const [showFreeTextStance, setShowFreeTextStance] = useState(false);
  const [showFreeTextComedicStyle, setShowFreeTextComedicStyle] = useState(false);
  const [showFreeTextIllustrationStyle, setShowFreeTextIllustrationStyle] = useState(false);
  const [customStanceError, setCustomStanceError] = useState<string | null>(null);
  const [customStyleError, setCustomStyleError] = useState<string | null>(null);
  const [customIllustrationError, setCustomIllustrationError] = useState<string | null>(null);
  const [referenceImages, setReferenceImages] = useState<ReferenceImageState[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isNewsModalOpen, setIsNewsModalOpen] = useState(false);
  const [newsStories, setNewsStories] = useState<NewsStory[]>([]);
  const [isNewsLoading, setIsNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);
  // Whether the Background Context textarea is expanded.
  // Persisted independently so "expanded but empty" survives reload.
  const [showContextField, setShowContextField] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem('dailyBanana_showContext');
      if (v !== null) return JSON.parse(v) as boolean;
    } catch { /* ignore */ }
    // Fall back: auto-expand if there is saved context
    return !!(loadSavedForm().newsContext);
  });

  // Pre-fetch headlines in the background, but only once the browser is idle
  // after the initial paint so we don't compete with page-load resources.
  const newsPrefetchRef = useRef<Promise<NewsStory[]> | null>(null);
  useEffect(() => {
    let cancelled = false;

    const startPrefetch = () => {
      if (cancelled) return;
      const p = getTopStories();
      p.catch(() => {}); // suppress unhandled-rejection during silent prefetch
      newsPrefetchRef.current = p;
    };

    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(startPrefetch, { timeout: 4000 });
      return () => { cancelled = true; window.cancelIdleCallback(id); };
    } else {
      // Fallback: short delay so at minimum the first paint finishes first
      const id = setTimeout(startPrefetch, 300);
      return () => { cancelled = true; clearTimeout(id); };
    }
  }, []);
  
  // State for the new confirmation modal
  const [isConfirmationModalOpen, setIsConfirmationModalOpen] = useState(false);
  
  // Persist form state to localStorage on every change (excluding File objects)
  useEffect(() => {
    try {
      const { referenceImages: _skip, ...saveable } = formData;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saveable));
    } catch { /* ignore storage errors */ }
  }, [formData]);

  // Persist showContextField so "expanded but empty" state survives reload
  useEffect(() => {
    try {
      localStorage.setItem('dailyBanana_showContext', JSON.stringify(showContextField));
    } catch { /* ignore storage errors */ }
  }, [showContextField]);

  // Effect to revoke object URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      referenceImages.forEach(image => URL.revokeObjectURL(image.previewUrl));
    };
  }, [referenceImages]);

  const updateFormData = (newImages: ReferenceImage[]) => {
    setFormData(prev => ({ ...prev, referenceImages: newImages }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newImages = Array.from(files).map(file => ({
        file,
        tag: '',
        previewUrl: URL.createObjectURL(file),
      }));
      const updatedImages = [...referenceImages, ...newImages];
      setReferenceImages(updatedImages);
      updateFormData(updatedImages.map(({file, tag}) => ({file, tag})));
    }
    // Reset the input value to allow re-selecting the same file
    if (e.target) {
      e.target.value = '';
    }
  };
  
  const handleRemoveImage = (indexToRemove: number) => {
    const imageToRemove = referenceImages[indexToRemove];
    URL.revokeObjectURL(imageToRemove.previewUrl);
    const updatedImages = referenceImages.filter((_, index) => index !== indexToRemove);
    setReferenceImages(updatedImages);
    updateFormData(updatedImages.map(({file, tag}) => ({file, tag})));
  };
  
  const handleTagChange = (indexToUpdate: number, tag: string) => {
    const updatedImages = referenceImages.map((image, index) => 
      index === indexToUpdate ? { ...image, tag } : image
    );
    setReferenceImages(updatedImages);
    updateFormData(updatedImages.map(({file, tag}) => ({file, tag})));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
        const { checked } = e.target as HTMLInputElement;
        setFormData((prev) => ({ ...prev, [name]: checked }));
    } else {
        setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleStanceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { value } = e.target;
    setCustomStanceError(null);
    if (value === 'custom') {
      setShowFreeTextStance(true);
      setFormData((prev) => ({ ...prev, stance: '' }));
    } else {
      setShowFreeTextStance(false);
      setFormData((prev) => ({ ...prev, stance: value as Stance }));
    }
  };
  
  const handleComedicStyleChange = (value: string) => {
    setCustomStyleError(null);
    if (value === 'custom') {
      setShowFreeTextComedicStyle(true);
      setFormData((prev) => ({ ...prev, comedicStyle: '' }));
    } else {
      setShowFreeTextComedicStyle(false);
      setFormData((prev) => ({ ...prev, comedicStyle: value as ComedicStyle }));
    }
  };

  const handleIllustrationStyleChange = (value: string) => {
    setCustomIllustrationError(null);
    if (value === 'custom') {
      setShowFreeTextIllustrationStyle(true);
      setFormData((prev) => ({ ...prev, illustrationStyle: '' }));
    } else {
      setShowFreeTextIllustrationStyle(false);
      setFormData((prev) => ({ ...prev, illustrationStyle: value }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Validate custom free-text fields before proceeding
    if (showFreeTextStance && !formData.stance.trim()) {
      setCustomStanceError('Please describe your custom stance.');
      return;
    }
    if (showFreeTextComedicStyle && !formData.comedicStyle.trim()) {
      setCustomStyleError('Please describe your custom comedic style.');
      return;
    }
    if (showFreeTextIllustrationStyle && !formData.illustrationStyle?.trim()) {
      setCustomIllustrationError('Please describe your custom illustration style.');
      return;
    }
    if (checkForSensitiveContent(formData.topic)) {
      setIsConfirmationModalOpen(true);
    } else {
      onSubmit(formData);
    }
  };
  
  const handleConfirmSensitive = () => {
    setIsConfirmationModalOpen(false);
    onSubmit(formData);
  };
  
  const handleCancelSensitive = () => {
    setIsConfirmationModalOpen(false);
  };

  const handleFetchNewsClick = async () => {
    setIsNewsModalOpen(true);
    setNewsError(null);
    setNewsStories([]);
    setIsNewsLoading(true);
    try {
      // Reuse the background prefetch if it's in-flight or already done;
      // fall back to a fresh call only if no prefetch exists.
      const promise = newsPrefetchRef.current ?? getTopStories();
      newsPrefetchRef.current = null; // next open will fetch fresh headlines
      const stories = await promise;
      setNewsStories(stories);
    } catch (error: any) {
      setNewsError(error.message || "An unknown error occurred.");
    } finally {
      setIsNewsLoading(false);
    }
  };

  const handleSelectStory = (title: string, description?: string) => {
    setFormData(prev => ({ ...prev, topic: title, newsContext: description ?? '' }));
    setShowContextField(true);
    setIsNewsModalOpen(false);
  };


  return (
    <>
      {isNewsModalOpen && (
        <NewsSelector 
          stories={newsStories}
          isLoading={isNewsLoading}
          error={newsError}
          onSelectStory={handleSelectStory}
          onClose={() => setIsNewsModalOpen(false)}
        />
      )}
      
      <ConfirmationModal
        isOpen={isConfirmationModalOpen}
        title="Sensitive Topic Warning"
        onConfirm={handleConfirmSensitive}
        onCancel={handleCancelSensitive}
        confirmText="Proceed Anyway"
        cancelText="Edit Topic"
        message={
            <>
                <p>Your topic contains terms related to sensitive real-world events (like violence or tragedy).</p>
                <p>To maintain safety, the AI may generate a comic that is thematically related but avoids depicting the sensitive aspects directly. This can sometimes feel like a 'deflection'.</p>
                <p className="mt-4 font-bold">Do you wish to continue?</p>
            </>
        }
      />

      <form onSubmit={handleSubmit} className="w-full max-w-3xl mx-auto space-y-8 p-8 md:p-10 border-3 border-black bg-paper-light shadow-xl rounded-lg">
        
        {/* ── Topic: two-path entry point ─────────────────────────────── */}
        <div className="space-y-0">
          {/* Path A — type / paste your own */}
          <div>
            <Tooltip text="Describe the main subject, characters, or event for your comic strip. Keep it concise — use the Background Context field below for longer notes.">
              <label htmlFor="topic" className="block text-lg font-bold mb-1 tracking-wide font-special-elite text-black">
                Topic
              </label>
            </Tooltip>
            <p className="text-xs font-special-elite text-gray-500 mb-2">
              Start with your own idea, or pull from today's headlines below.
            </p>
            <textarea
              id="topic"
              name="topic"
              value={formData.topic}
              onChange={handleChange}
              className="w-full p-3 bg-white border-2 border-black text-lg font-special-elite text-black placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-black rounded-lg hover:bg-stone-200 transition-colors resize-none"
              placeholder="e.g., A senator questioning an AI"
              required
              minLength={5}
              maxLength={150}
              rows={2}
            />
          </div>

          {/* ── Counter row + Background Context toggle ── */}
          <div className="flex items-center justify-between mt-1">
            {!showContextField ? (
              <Tooltip text="Paste an article, quotes, or key facts you want the AI to reference — without redirecting your topic or angle.">
                <button
                  type="button"
                  onClick={() => setShowContextField(true)}
                  className="text-sm font-special-elite text-gray-500 hover:text-black transition-colors underline underline-offset-2 decoration-dotted"
                >
                  + Add background context
                </button>
              </Tooltip>
            ) : (
              <span />
            )}
            <p className="text-xs font-special-elite text-gray-400">
              {formData.topic.length}/150
            </p>
          </div>

          {/* ── Background Context (collapsible) — grouped with topic ── */}
          {showContextField && (
            <div className="pt-1">
              <Tooltip text="Paste an article, quote, or key details. The AI draws on these facts to enrich the story without changing your topic or angle.">
                <label htmlFor="newsContext" className="block text-base font-bold mb-1 tracking-wide font-special-elite text-black">
                  Background Context <span className="font-normal text-gray-500 text-sm">(optional)</span>
                </label>
              </Tooltip>
              <textarea
                id="newsContext"
                name="newsContext"
                value={formData.newsContext ?? ''}
                onChange={handleChange}
                className="w-full p-3 bg-white border-2 border-black text-base font-special-elite text-black placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-black rounded-lg hover:bg-stone-200 transition-colors resize-y"
                placeholder="Paste article text, quotes, key facts, or anything the AI should know..."
                maxLength={3000}
                rows={4}
              />
              <div className="flex justify-between items-center mt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowContextField(false);
                    setFormData(prev => ({ ...prev, newsContext: undefined }));
                  }}
                  className="text-xs font-special-elite text-gray-400 hover:text-black transition-colors"
                >
                  Remove
                </button>
                <p className="text-xs font-special-elite text-gray-400">
                  {(formData.newsContext?.length ?? 0)}/3000
                </p>
              </div>
            </div>
          )}

          {/* "or" divider */}
          <div className="relative flex items-center py-3">
            <div className="flex-grow border-t border-gray-300" />
            <span className="flex-shrink mx-3 text-xs font-special-elite text-gray-500 tracking-wider uppercase">
              or pull from today's headlines
            </span>
            <div className="flex-grow border-t border-gray-300" />
          </div>

          {/* Path B — news picker */}
          <button
            type="button"
            onClick={handleFetchNewsClick}
            className="w-full flex items-center justify-center gap-2 p-3 bg-white text-black border-2 border-black hover:bg-stone-200 transition-colors rounded-lg font-special-elite text-base"
          >
            <NewspaperIcon className="w-5 h-5 flex-shrink-0" />
            Get ideas from recent news
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <Tooltip text="Choose the comic's message about the topic.">
              <label htmlFor="stance" className="block text-lg font-bold mb-2 tracking-wide font-special-elite text-black">
                Stance
              </label>
            </Tooltip>
            <select
              id="stance"
              name="stance-select"
              value={showFreeTextStance ? 'custom' : formData.stance}
              onChange={handleStanceChange}
              className="w-full p-3 h-14 bg-white border-2 border-black text-lg font-special-elite text-gray-500 focus:text-black focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-black rounded-lg hover:bg-stone-200 transition-colors"
            >
              {STANCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
              <option value="custom">Write my own...</option>
            </select>
            {showFreeTextStance && (
              <>
                <input
                  type="text"
                  id="stance-custom"
                  name="stance"
                  value={typeof formData.stance === 'string' ? formData.stance : ''}
                  onChange={(e) => { setCustomStanceError(null); handleChange(e); }}
                  className={`w-full p-3 mt-2 h-14 bg-white border-2 text-lg font-special-elite text-black placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-black rounded-lg hover:bg-stone-200 transition-colors ${customStanceError ? 'border-red-500' : 'border-black'}`}
                  placeholder="Your custom stance..."
                  maxLength={160}
                  autoFocus
                />
                {customStanceError && (
                  <p className="mt-1 text-xs font-special-elite text-red-600">{customStanceError}</p>
                )}
              </>
            )}
          </div>
          
          <div>
            <Tooltip text="Select the method for the comic's humor.">
              <label htmlFor="comedicStyle" className="block text-lg font-bold mb-2 tracking-wide font-special-elite text-black">
                Comedic Style
              </label>
            </Tooltip>
            <CustomSelect
              id="comedicStyle"
              value={showFreeTextComedicStyle ? 'custom' : formData.comedicStyle}
              options={COMEDIC_STYLE_OPTIONS}
              extraOption={{ value: 'custom', label: 'Write my own…' }}
              onChange={handleComedicStyleChange}
            />
            {showFreeTextComedicStyle && (
              <>
                <input
                  type="text"
                  id="comedicStyle-custom"
                  name="comedicStyle"
                  value={formData.comedicStyle}
                  onChange={(e) => { setCustomStyleError(null); handleChange(e); }}
                  className={`w-full p-3 mt-2 h-14 bg-white border-2 text-lg font-special-elite text-black placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-black rounded-lg hover:bg-stone-200 transition-colors ${customStyleError ? 'border-red-500' : 'border-black'}`}
                  placeholder="Your custom comedic style..."
                  maxLength={160}
                  autoFocus
                />
                {customStyleError && (
                  <p className="mt-1 text-xs font-special-elite text-red-600">{customStyleError}</p>
                )}
              </>
            )}
            {formData.comedicStyle === 'dark-comedy' && !showFreeTextComedicStyle && (
              <p className="mt-2 text-xs font-special-elite text-amber-800 bg-amber-50 border border-amber-300 rounded px-3 py-2">
                Stays within editorial-cartoon bounds — think cynical and nihilistic, not graphic or shocking. Topics involving violence or tragedy may be blocked by content filters.
              </p>
            )}
          </div>
        </div>

        <div>
          <Tooltip text="Select an emblematic style or describe your own to guide the visual tone.">
            <label htmlFor="illustrationStyle" className="block text-lg font-bold mb-2 tracking-wide font-special-elite text-black">
              Illustration Style
            </label>
          </Tooltip>
          <CustomSelect
            id="illustrationStyle"
            value={showFreeTextIllustrationStyle ? 'custom' : formData.illustrationStyle}
            options={ILLUSTRATION_STYLE_OPTIONS}
            extraOption={{ value: 'custom', label: 'Write my own…' }}
            onChange={handleIllustrationStyleChange}
          />
          {showFreeTextIllustrationStyle && (
            <>
              <input
                type="text"
                id="illustrationStyle-custom"
                name="illustrationStyle"
                value={formData.illustrationStyle || ''}
                onChange={(e) => { setCustomIllustrationError(null); handleChange(e); }}
                className={`w-full p-3 mt-2 h-14 bg-white border-2 text-lg font-special-elite text-black placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-black rounded-lg hover:bg-stone-200 transition-colors ${customIllustrationError ? 'border-red-500' : 'border-black'}`}
                placeholder="Describe your custom illustration style..."
                maxLength={160}
                autoFocus
              />
              {customIllustrationError && (
                <p className="mt-1 text-xs font-special-elite text-red-600">{customIllustrationError}</p>
              )}
            </>
          )}
        </div>
        
        <div>
          <Tooltip text="Choose which AI image model renders your panels. Higher quality models produce better results but cost more per image.">
            <label className="block text-lg font-bold mb-2 tracking-wide font-special-elite text-black">
              Image Model
            </label>
          </Tooltip>
          <div className="flex flex-col sm:flex-row gap-3">
            {IMAGE_MODEL_OPTIONS.map((opt) => {
              const selected = formData.imageModel === opt.value;
              const minCost = (opt.pricePerImage * 2).toFixed(2);
              const maxCost = (opt.pricePerImage * 4).toFixed(2);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, imageModel: opt.value }))}
                  className={`flex-1 flex items-stretch border-2 text-left transition-colors rounded-lg overflow-hidden ${
                    selected
                      ? 'border-black bg-black text-white'
                      : 'border-black bg-white text-black hover:bg-stone-100'
                  }`}
                >
                  <div className="flex-1 flex flex-col gap-0.5 p-3">
                    <span className="font-bangers text-lg tracking-wide leading-none">{opt.label}</span>
                    <span className={`text-xs font-special-elite leading-snug ${selected ? 'text-stone-300' : 'text-gray-500'}`}>{opt.note}</span>
                  </div>
                  <div className={`w-px self-stretch ${selected ? 'bg-stone-600' : 'bg-stone-300'}`} />
                  <div className="flex flex-col items-center justify-center gap-0.5 px-3 py-2 min-w-[72px]">
                    <span className={`font-bangers text-base tracking-wide leading-none ${selected ? 'text-yellow-300' : 'text-black'}`}>${minCost}–${maxCost}</span>
                    <span className={`text-[10px] font-special-elite text-center leading-tight ${selected ? 'text-stone-400' : 'text-gray-400'}`}>2–4 panels est.</span>
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-[10px] font-special-elite text-gray-400 mt-1.5">
            Prices are estimates based on Google's published rates as of May 2026 and may have changed. <a href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">Check current pricing.</a>
          </p>
        </div>

        <div>
          <Tooltip text="Upload reference images for characters, objects, or styles. This is highly encouraged for better results!">
            <label htmlFor="referenceImages" className="block text-lg font-bold mb-2 tracking-wide font-special-elite text-black">
              Reference Images (Encouraged)
            </label>
          </Tooltip>
          <div className="mt-2 border-2 border-dashed border-black p-4 bg-white flex flex-col gap-4">
            <input
              type="file"
              id="referenceImages"
              name="referenceImages"
              ref={fileInputRef}
              onChange={handleFileChange}
              multiple
              accept="image/png, image/jpeg, image/webp"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-2 p-4 hover:bg-stone-100 transition-colors text-gray-500 font-special-elite rounded-lg"
            >
              <UploadIcon className="w-8 h-8" />
              <span>{referenceImages.length > 0 ? 'Upload More Images' : 'Click to Upload Images'}</span>
              <span className="text-xs text-gray-400 mt-1">(PNG, JPG, WEBP accepted)</span>
            </button>
            {referenceImages.length > 0 && (
              <div className="flex flex-col gap-4">
                {referenceImages.map((image, index) => (
                  <div key={index} className="relative flex items-stretch border-2 border-black bg-white">
                    <img
                      src={image.previewUrl}
                      alt={`Reference ${index + 1}`}
                      className="w-24 h-24 object-cover flex-shrink-0"
                    />
                    <textarea
                      value={image.tag}
                      onChange={(e) => handleTagChange(index, e.target.value)}
                      placeholder="Tag this image (e.g., 'main character', 'grumpy cat')"
                      className="w-full flex-grow text-base p-3 border-l-2 border-black focus:outline-none focus:ring-2 focus:ring-inset focus:ring-black font-special-elite bg-transparent resize-none text-black placeholder:text-gray-500"
                      rows={3}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(index)}
                      className="absolute top-1 right-1 bg-black/70 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold hover:bg-black transition-colors"
                      aria-label={`Remove image ${index + 1}`}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Tooltip text="Generate 3 different story ideas to choose from instead of just one.">
            <label htmlFor="brainstormMode" className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                id="brainstormMode"
                name="brainstormMode"
                checked={formData.brainstormMode}
                onChange={handleChange}
                className="h-5 w-5 accent-black"
              />
              <span className="text-lg font-bold tracking-wide font-special-elite text-black">Brainstorm Mode</span>
            </label>
          </Tooltip>
          <Tooltip text="Add a brief explanation of the real-world context to the final comic.">
            <label htmlFor="includeContext" className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                id="includeContext"
                name="includeContext"
                checked={formData.includeContext}
                onChange={handleChange}
                className="h-5 w-5 accent-black"
              />
              <span className="text-lg font-bold tracking-wide font-special-elite text-black">Add Explainer</span>
            </label>
          </Tooltip>
        </div>

        <div className="pt-4 border-t-4 border-black">
          <button
            type="submit"
            disabled={isLoading}
            className="w-full group inline-flex items-center justify-center gap-3 px-8 py-4 bg-banana text-black font-bangers text-2xl tracking-wider border-2 border-t-black border-l-black border-r-black border-b-8 border-b-black hover:-translate-y-0.5 active:border-b-2 active:translate-y-0 active:mt-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed rounded-md"
          >
            <SparklesIcon className={`w-6 h-6 ${isLoading ? 'animate-spin' : 'group-hover:animate-spin-once'}`} />
            {isLoading ? 'Generating...' : 'Generate Comic Plan'}
          </button>
        </div>
      </form>
    </>
  );
};

export default ComicForm;