// components/TextScaler.tsx
import React, { useState, useRef, useLayoutEffect, ReactElement } from 'react';

// FIX: Define a more specific type for the `children` prop to ensure type safety.
// This allows accessing `initialText` and `style` from the child's props,
// and correctly types `React.cloneElement` to accept a `ref`. Although `ref` is
// not a standard prop, this typing is a pragmatic way to satisfy the type checker
// for ref-forwarding components.
interface TextScalerProps {
  children: ReactElement<{
    initialText: string;
    style?: React.CSSProperties;
    ref?: React.Ref<HTMLElement>;
  }>;
}

const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 80;
const ITERATIONS = 8; // Binary search iterations, 8 is plenty for precision

const TextScaler: React.FC<TextScalerProps> = ({ children }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const [fontSize, setFontSize] = useState<number>(16);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;

    if (!container || !content) return;

    const observer = new ResizeObserver(() => {
      // Don't scale if the element is not visible
      if (container.offsetParent === null) return;
      
      // Reset styles for measurement
      content.style.fontSize = '';

      let low = MIN_FONT_SIZE;
      let high = MAX_FONT_SIZE;

      // Binary search for the optimal font size
      for (let i = 0; i < ITERATIONS; i++) {
        const mid = (low + high + 1) / 2;
        content.style.fontSize = `${mid}px`;
        // Check for overflow
        if (content.scrollHeight > container.clientHeight || content.scrollWidth > container.clientWidth) {
          high = mid - 1;
        } else {
          low = mid;
        }
      }
      setFontSize(low);
    });

    observer.observe(container);
    // Also trigger manually for initial render and text changes
    observer.observe(content);

    return () => {
      observer.disconnect();
    };
  }, [children.props.initialText]); // Rerun when the text content changes

  // Clone the child to attach our ref and apply the dynamic font size
  const childWithRef = React.cloneElement(children, {
    ref: contentRef,
    style: {
      ...children.props.style,
      fontSize: `${fontSize}px`,
      // Ensure the element doesn't collapse during measurement
      margin: 0,
      padding: 0,
      lineHeight: 1.2,
      // Important: Allow wrapping
      whiteSpace: 'normal', 
      // Prevents strange visual bugs during rapid resizing
      backfaceVisibility: 'hidden',
    },
  });

  return (
    <div ref={containerRef} className="w-full h-full flex items-center justify-center">
      {childWithRef}
    </div>
  );
};

export default TextScaler;