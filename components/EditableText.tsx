import React, { forwardRef } from 'react';

interface EditableTextProps {
  initialText: string;
  onSave: (newText: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

const EditableText = forwardRef<HTMLParagraphElement, EditableTextProps>(
  ({ initialText, onSave, className, style }, ref) => {
    
    const handleBlur = (e: React.FocusEvent<HTMLParagraphElement>) => {
      const newText = e.currentTarget.textContent || '';
      // Only call onSave if text actually changed to avoid unnecessary re-renders.
      if (newText !== initialText) {
        onSave(newText);
      }
    };

    return (
      <p
        ref={ref}
        contentEditable
        suppressContentEditableWarning={true}
        onBlur={handleBlur}
        // Key is important! It forces React to re-render the component from scratch if the initialText prop changes.
        // This resets the internal state of the contentEditable element.
        key={initialText}
        className={`${className} focus:outline-none focus:ring-2 focus:ring-black focus:bg-white/20`}
        style={style}
      >
        {initialText}
      </p>
    );
  }
);

EditableText.displayName = 'EditableText';

export default EditableText;