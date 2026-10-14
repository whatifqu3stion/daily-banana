import React, { useEffect, useRef } from 'react';
import GeminiConnection from './GeminiConnection';

interface ApiKeySettingsProps {
  disabled?: boolean;
  onClose: () => void;
}

const ApiKeySettings: React.FC<ApiKeySettingsProps> = ({ disabled = false, onClose }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="api-settings-title"
      onClose={() => { if (!dialogRef.current?.open) onClose(); }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const controls = Array.from<HTMLElement>(event.currentTarget.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), a[href], [tabindex="0"]',
        )).filter(element => element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      className="m-auto max-h-[min(92dvh,48rem)] w-[calc(100%-1.5rem)] max-w-2xl overflow-y-auto border-2 border-black bg-paper-light p-0 text-black shadow-xl backdrop:bg-black/60"
    >
      <div className="flex items-center justify-between gap-4 border-b-2 border-black px-4 py-3.5 sm:px-6">
        <h2 id="api-settings-title" className="font-special-elite text-2xl font-bold leading-tight sm:text-3xl">
          API settings
        </h2>
        <button
          type="button"
          aria-label="Close API settings"
          onClick={() => dialogRef.current?.close()}
          className="min-h-11 shrink-0 border-2 border-black bg-paper-light px-3 py-2 font-open-sans text-base font-bold hover:bg-banana focus:outline-none focus-visible:ring-2 focus-visible:ring-black"
        >
          Close
        </button>
      </div>
      <div className="px-4 py-5 sm:px-6 sm:py-6">
        <GeminiConnection disabled={disabled} onConnected={() => dialogRef.current?.close()} />
      </div>
    </dialog>
  );
};

export default ApiKeySettings;
