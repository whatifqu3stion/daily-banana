import React, { useState, useRef } from 'react';
import { FormData, POV, Tone } from '../types';
import { POV_OPTIONS, TONE_OPTIONS } from '../constants';
import SparklesIcon from './icons/SparklesIcon';
import Tooltip from './Tooltip';

interface ComicFormProps {
  onSubmit: (formData: FormData) => void;
  isLoading: boolean;
}

const ComicForm: React.FC<ComicFormProps> = ({ onSubmit, isLoading }) => {
  const [formData, setFormData] = useState<FormData>({
    topic: '',
    pov: 'Satirical',
    tone: 'satirical',
  });
  const [showFreeTextPov, setShowFreeTextPov] = useState(false);
  const [fileCount, setFileCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handlePovChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { value } = e.target;
    if (value === 'custom') {
      setShowFreeTextPov(true);
      setFormData((prev) => ({ ...prev, pov: '' })); // Clear POV for custom input
    } else {
      setShowFreeTextPov(false);
      setFormData((prev) => ({ ...prev, pov: value as POV }));
    }
  };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setFormData((prev) => ({ ...prev, referenceImages: Array.from(files) }));
      setFileCount(files.length);
    } else {
      setFormData((prev) => ({...prev, referenceImages: undefined}));
      setFileCount(0);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-3xl mx-auto space-y-8 p-8 md:p-10 border-4 border-black bg-transparent">
      
      <div>
        <label htmlFor="topic" className="block text-lg font-bold mb-2 tracking-wide font-special-elite">
          Topic
        </label>
        <input
          type="text"
          id="topic"
          name="topic"
          value={formData.topic}
          onChange={handleChange}
          className="w-full p-3 bg-stone-100 border-2 border-black text-lg font-special-elite focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-black rounded-none"
          placeholder="e.g., A senator questioning an AI"
          required
          minLength={5}
          maxLength={120}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
           <Tooltip text="Choose the perspective or message for the comic.">
            <label htmlFor="pov" className="block text-lg font-bold mb-2 tracking-wide font-special-elite">
              Point of View
            </label>
          </Tooltip>
          <select
            id="pov"
            name="pov-select"
            value={showFreeTextPov ? 'custom' : formData.pov}
            onChange={handlePovChange}
            className="w-full p-3 bg-stone-100 border-2 border-black text-lg font-special-elite focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-black rounded-none"
          >
            {POV_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
            <option value="custom">Write my own...</option>
          </select>
          {showFreeTextPov && (
             <input
              type="text"
              id="pov-custom"
              name="pov"
              value={typeof formData.pov === 'string' ? formData.pov : ''}
              onChange={handleChange}
              className="w-full p-3 mt-2 bg-stone-100 border-2 border-black text-lg font-special-elite focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-black rounded-none"
              placeholder="Your custom point of view..."
              maxLength={160}
              autoFocus
            />
          )}
        </div>
        
        <div>
           <Tooltip text="Select the overall tone of the comic's humor and narrative.">
            <label htmlFor="tone" className="block text-lg font-bold mb-2 tracking-wide font-special-elite">
              Tone
            </label>
          </Tooltip>
          <select
            id="tone"
            name="tone"
            value={formData.tone}
            onChange={handleChange}
            className="w-full p-3 bg-stone-100 border-2 border-black text-lg font-special-elite focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-black rounded-none"
          >
            {TONE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-lg font-bold mb-2 tracking-wide font-special-elite">
          Reference Images (Highly suggested)
        </label>
         <label htmlFor="file-upload" className="flex flex-col items-center justify-center w-full h-32 px-4 transition bg-stone-50 border-2 border-black border-dashed cursor-pointer hover:bg-stone-100">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <svg className="w-8 h-8 mb-2 text-gray-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                    <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
                </svg>
                <p className="mb-2 text-sm text-gray-700">
                  <span className="font-semibold">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-gray-600">{fileCount > 0 ? `${fileCount} file(s) selected` : 'PNG, JPG, or WEBP (MAX. 2MB)'}</p>
            </div>
            <input id="file-upload" ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} accept="image/png, image/jpeg, image/webp" multiple />
        </label>
      </div>

      <div className="text-center pt-4">
        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex items-center justify-center gap-3 px-12 py-4 bg-black text-white font-bangers text-2xl tracking-wider border-2 border-black hover:bg-gray-800 disabled:bg-gray-500 disabled:cursor-not-allowed transition-colors rounded-none"
        >
          <SparklesIcon className="w-6 h-6" />
          Generate Comic
        </button>
      </div>
    </form>
  );
};

export default ComicForm;