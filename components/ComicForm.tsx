import React, { useState, useRef, useEffect } from 'react';
import { ComicFormData, Stance, ComedicStyle, ReferenceImage, NewsStory } from '../types';
import { STANCE_OPTIONS, COMEDIC_STYLE_OPTIONS, ILLUSTRATION_STYLE_OPTIONS } from '../constants';
import { getTopStories } from '../services/newsService';
import SparklesIcon from './icons/SparklesIcon';
import NewspaperIcon from './icons/NewspaperIcon';
import NewsSelector from './NewsSelector';
import Tooltip from './Tooltip';

interface ComicFormProps {
  onSubmit: (formData: ComicFormData) => void;
  isLoading: boolean;
}

// Internal state type for managing file previews
interface ReferenceImageState extends ReferenceImage {
  previewUrl: string;
}

const ComicForm: React.FC<ComicFormProps> = ({ onSubmit, isLoading }) => {
  const [formData, setFormData] = useState<ComicFormData>({
    topic: '',
    stance: 'critical',
    comedicStyle: 'satirical',
    illustrationStyle: 'default-color',
    referenceImages: [],
    brainstormMode: false,
  });
  const [showFreeTextStance, setShowFreeTextStance] = useState(false);
  const [showFreeTextIllustrationStyle, setShowFreeTextIllustrationStyle] = useState(false);
  const [referenceImages, setReferenceImages] = useState<ReferenceImageState[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isNewsModalOpen, setIsNewsModalOpen] = useState(false);
  const [newsStories, setNewsStories] = useState<NewsStory[]>([]);
  const [isNewsLoading, setIsNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);
  
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
    if (value === 'custom') {
      setShowFreeTextStance(true);
      setFormData((prev) => ({ ...prev, stance: '' }));
    } else {
      setShowFreeTextStance(false);
      setFormData((prev) => ({ ...prev, stance: value as Stance }));
    }
  };
  
  const handleIllustrationStyleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { value } = e.target;
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
    onSubmit(formData);
  };

  const handleFetchNewsClick = async () => {
    setIsNewsModalOpen(true);
    setNewsError(null);
    if (newsStories.length > 0) return; // Don't re-fetch if we already have them

    setIsNewsLoading(true);
    try {
      const stories = await getTopStories();
      setNewsStories(stories);
    } catch (error: any) {
      setNewsError(error.message || "An unknown error occurred.");
    } finally {
      setIsNewsLoading(false);
    }
  };

  const handleSelectStory = (title: string) => {
    setFormData(prev => ({...prev, topic: title }));
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

      <form onSubmit={handleSubmit} className="w-full max-w-3xl mx-auto space-y-8 p-8 md:p-10 border-4 border-black bg-stone-100">
        
        <div>
          <Tooltip text="Describe the main subject, characters, or event for your comic strip.">
            <label htmlFor="topic" className="block text-lg font-bold mb-2 tracking-wide font-special-elite">
              Topic
            </label>
          </Tooltip>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              id="topic"
              name="topic"
              value={formData.topic}
              onChange={handleChange}
              className="w-full p-3 h-14 bg-stone-100 border-2 border-black text-lg font-special-elite focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-black rounded-none hover:bg-stone-200 transition-colors"
              placeholder="e.g., A senator questioning an AI"
              required
              minLength={5}
              maxLength={120}
            />
            <Tooltip text="Get ideas from the latest news">
              <button 
                type="button" 
                onClick={handleFetchNewsClick}
                className="flex-shrink-0 inline-flex items-center justify-center gap-2 px-4 h-14 bg-stone-100 text-black border-2 border-black hover:bg-stone-200 transition-colors rounded-none text-lg font-special-elite"
              >
                <NewspaperIcon className="w-5 h-5" />
                <span className="sm:hidden">Suggest from Headlines</span>
              </button>
            </Tooltip>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <Tooltip text="Choose the comic's message about the topic.">
              <label htmlFor="stance" className="block text-lg font-bold mb-2 tracking-wide font-special-elite">
                Stance
              </label>
            </Tooltip>
            <select
              id="stance"
              name="stance-select"
              value={showFreeTextStance ? 'custom' : formData.stance}
              onChange={handleStanceChange}
              className="w-full p-3 bg-stone-100 border-2 border-black text-lg font-special-elite focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-black rounded-none hover:bg-stone-200 transition-colors"
            >
              {STANCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
              <option value="custom">Write my own...</option>
            </select>
            {showFreeTextStance && (
              <input
                type="text"
                id="stance-custom"
                name="stance"
                value={typeof formData.stance === 'string' ? formData.stance : ''}
                onChange={handleChange}
                className="w-full p-3 mt-2 bg-stone-100 border-2 border-black text-lg font-special-elite focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-black rounded-none hover:bg-stone-200 transition-colors"
                placeholder="Your custom stance..."
                maxLength={160}
                autoFocus
              />
            )}
          </div>
          
          <div>
            <Tooltip text="Select the method for the comic's humor.">
              <label htmlFor="comedicStyle" className="block text-lg font-bold mb-2 tracking-wide font-special-elite">
                Comedic Style
              </label>
            </Tooltip>
            <select
              id="comedicStyle"
              name="comedicStyle"
              value={formData.comedicStyle}
              onChange={handleChange}
              className="w-full p-3 bg-stone-100 border-2 border-black text-lg font-special-elite focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-black rounded-none hover:bg-stone-200 transition-colors"
            >
              {COMEDIC_STYLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <Tooltip text="Select an emblematic style or describe your own to guide the visual tone.">
            <label htmlFor="illustrationStyle" className="block text-lg font-bold mb-2 tracking-wide font-special-elite">
              Illustration Style
            </label>
          </Tooltip>
          <select
            id="illustrationStyle"
            name="illustrationStyle-select"
            value={showFreeTextIllustrationStyle ? 'custom' : formData.illustrationStyle}
            onChange={handleIllustrationStyleChange}
            className="w-full p-3 bg-stone-100 border-2 border-black text-lg font-special-elite focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-black rounded-none hover:bg-stone-200 transition-colors"
          >
            {ILLUSTRATION_STYLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
            <option value="custom">Write my own...</option>
          </select>
          {showFreeTextIllustrationStyle && (
              <textarea
                id="illustrationStyle-custom"
                name="illustrationStyle"
                value={formData.illustrationStyle || ''}
                onChange={handleChange}
                className="w-full p-3 mt-2 bg-stone-100 border-2 border-black text-lg font-special-elite focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-black rounded-none hover:bg-stone-200 transition-colors h-24"
                placeholder="e.g., A minimalist style with thick outlines and a muted, pastel color palette..."
                maxLength={250}
                autoFocus
              />
            )}
        </div>

        <div>
          <Tooltip text="Upload images of characters, objects, or settings. The AI uses these as a strong visual guide to maintain consistency across panels.">
            <label className="block text-lg font-bold mb-2 tracking-wide font-special-elite">
              Reference Images (Encouraged for specific characters, comic style or settings)
            </label>
          </Tooltip>
          {referenceImages.length > 0 && (
            <div className="space-y-3 mb-3">
              {referenceImages.map((image, index) => (
                <div key={index} className="flex items-center gap-3 p-2 border-2 border-gray-300 bg-stone-50">
                  <img src={image.previewUrl} alt={`preview ${index}`} className="w-16 h-16 object-cover border-2 border-black" />
                  <div className="flex-grow">
                    <Tooltip text="Give this image a name or tag (e.g., 'Senator Higgins', 'The Oval Office'). The AI uses this to understand what the image represents.">
                      <input
                        type="text"
                        value={image.tag}
                        onChange={(e) => handleTagChange(index, e.target.value)}
                        placeholder="Tag (e.g., character, setting)"
                        className="w-full p-2 bg-stone-100 border-2 border-black text-sm font-special-elite focus:outline-none focus:ring-1 focus:ring-black rounded-none hover:bg-stone-200 transition-colors"
                      />
                    </Tooltip>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(index)}
                    className="px-2 py-1 text-xs font-bold text-red-700 hover:text-red-500"
                    aria-label={`Remove image ${index + 1}`}
                  >
                    REMOVE
                  </button>
                </div>
              ))}
            </div>
          )}
          <label htmlFor="file-upload" className="flex flex-col items-center justify-center w-full h-32 px-4 transition bg-stone-50 border-2 border-black border-dashed cursor-pointer hover:bg-stone-200">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <svg className="w-8 h-8 mb-2 text-gray-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                      <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
                  </svg>
                  <p className="mb-2 text-sm text-gray-700">
                    <span className="font-semibold">Click to add images</span> or drag and drop
                  </p>
                  <p className={`text-sm text-gray-600`}>
                    PNG, JPG, or WEBP (MAX. 2MB)
                  </p>
              </div>
              <input id="file-upload" ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} accept="image/png, image/jpeg, image/webp" multiple />
          </label>
        </div>

        <div className="pt-4 space-y-4">
            <div className="flex justify-center">
                <Tooltip text="Generate multiple distinct story ideas to choose from. This takes longer but offers more creative options.">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            name="brainstormMode"
                            checked={formData.brainstormMode}
                            onChange={handleChange}
                            className="h-5 w-5 rounded border-gray-300 text-black focus:ring-black"
                        />
                        <span className="text-lg font-special-elite">Brainstorm Multiple Story Ideas</span>
                    </label>
                </Tooltip>
            </div>

            <div className="text-center">
              <button
                type="submit"
                disabled={isLoading}
                className="generate-button inline-flex items-center justify-center gap-3 px-12 py-4 bg-black text-white font-bangers text-2xl tracking-wider border-2 border-black disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors rounded-none"
              >
                <SparklesIcon className="w-6 h-6" />
                Generate Comic
              </button>
            </div>
        </div>
      </form>
    </>
  );
};

export default ComicForm;