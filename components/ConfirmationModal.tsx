// components/ConfirmationModal.tsx
// A generic, accessible confirmation dialog.
// Rendered as a fixed overlay; clicking the backdrop or pressing Escape cancels.
import React, { useEffect } from 'react';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Continue',
  cancelText = 'Cancel',
}) => {
  // Close on Escape key for keyboard accessibility.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmation-title"
    >
      <div
        className="bg-paper-light border-3 border-black rounded-lg shadow-xl w-full max-w-lg p-8 relative"
        onClick={e => e.stopPropagation()}
        role="document"
      >
        <h3 id="confirmation-title" className="text-2xl font-bold mb-4 font-special-elite text-center text-red-800">
          {title}
        </h3>
        <div className="text-base font-lora text-black space-y-3 text-center">
          {message}
        </div>
        <div className="mt-8 flex justify-center gap-4">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-white text-black font-bold border-2 border-black hover:bg-gray-100 transition-colors rounded-md"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-banana text-black font-bold border-2 border-black hover:bg-yellow-500 transition-colors rounded-md"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
