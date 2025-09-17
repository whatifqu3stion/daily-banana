// components/EditableText.tsx
import React, { useState, useRef, useEffect, forwardRef } from 'react';

interface EditableTextProps {
  initialText: string;
  onSave: (newText: string) => void;
  className?: string;
  textareaClassName?: string;
  style?: React.CSSProperties;
  onEditingChange?: (isEditing: boolean) => void;
}

const EditableText = forwardRef<HTMLParagraphElement, EditableTextProps>(
  ({ initialText, onSave, className, textareaClassName, style, onEditingChange }, ref) => {
    const [isEditing, setIsEditing] = useState(false);
    const [text, setText] = useState(initialText);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
      setText(initialText);
    }, [initialText]);

    useEffect(() => {
      if (isEditing && textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.select();
        adjustTextareaHeight();
      }
    }, [isEditing]);

    const setEditing = (editing: boolean) => {
      setIsEditing(editing);
      onEditingChange?.(editing);
    };

    const adjustTextareaHeight = () => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      }
    };

    const handleSave = () => {
      setEditing(false);
      if (text.trim() !== initialText.trim()) {
        onSave(text.trim());
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSave();
      } else if (e.key === 'Escape') {
        setEditing(false);
        setText(initialText);
      }
    };

    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setText(e.target.value);
      adjustTextareaHeight();
    };
    
    const handleMouseDown = (e: React.MouseEvent) => {
      if (isEditing) {
        e.stopPropagation();
      }
    }

    if (isEditing) {
      return (
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          onMouseDown={handleMouseDown}
          className={`w-full h-full p-0 m-0 bg-transparent border-none resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 rounded-sm ${textareaClassName}`}
          style={style}
          aria-label="Editable text field"
        />
      );
    }

    return (
      <p
        ref={ref} // Attach the forwarded ref here
        onClick={() => setEditing(true)}
        className={`cursor-pointer hover:bg-gray-100 rounded-sm ${className}`}
        style={style}
        title="Click to edit"
      >
        {text || <span className="text-gray-400 italic">...</span>}
      </p>
    );
  }
);

EditableText.displayName = 'EditableText';

export default EditableText;
