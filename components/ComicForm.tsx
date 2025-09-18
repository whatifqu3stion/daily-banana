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
                <span className="hidden sm:inline">Suggest from Headlines</span>
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
            name="illustrationStyle"
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
            <input
              type="text"
              id="illustrationStyle-custom"
              name="illustrationStyle"
              value={formData.illustrationStyle || ''}
              onChange={handleChange}
              className="w-full p-3 mt-2 bg-stone-100 border-2 border-black text-lg font-special-elite focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-black rounded-none hover:bg-stone-200 transition-colors"
              placeholder="Describe your custom style..."
              maxLength={160}
              autoFocus
            />
          )}
        </div>
        
        <div>
          <Tooltip text="Upload reference images for characters, objects, or styles (optional).">
            <label htmlFor="referenceImages" className="block text-lg font-bold mb-2 tracking-wide font-special-elite">
              Reference Images (Optional)
            </label>
          </Tooltip>
          <div className="mt-2 p-4 border-2 border-dashed border-black">
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
              className="w-full p-4 bg-gray-200 hover:bg-gray-300 transition-colors text-black font-special-elite"
            >
              Click to Upload Images
            </button>
            {referenceImages.length > 0 && (
              <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {referenceImages.map((image, index) => (
                  <div key={index} className="relative border border-black">
                    <img src={image.previewUrl} alt={`Reference ${index + 1}`} className="w-full h-24 object-cover" />
                    <input
                      type="text"
                      value={image.tag}
                      onChange={(e) => handleTagChange(index, e.target.value)}
                      placeholder="Tag (e.g., 'main character')"
                      className="w-full text-xs p-1 border-t border-black focus:outline-none focus:ring-1 focus:ring-black"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(index)}
                      className="absolute top-0 right-0 m-1 bg-black/50 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold hover:bg-black"
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
              <span className="text-lg font-bold tracking-wide font-special-elite">Brainstorm Mode</span>
            </label>
          </Tooltip>
        </div>

        <div className="pt-4 border-t-4 border-black">
          <button
            type="submit"
            disabled={isLoading}
            className="w-full inline-flex items-center justify-center gap-3 px-8 py-4 bg-black text-white font-bangers text-2xl tracking-wider border-2 border-black hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <SparklesIcon className={`w-6 h-6 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Generating...' : 'Generate Comic Plan'}
          </button>
        </div>
      </form>
    </>
  );
};

export default ComicForm;
