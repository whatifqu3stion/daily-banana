// components/TextScaler.tsx
import React, { useState, useRef, useLayoutEffect, ReactElement } from 'react';

/**
 * Constrains `children` to an element whose props expose `initialText` and
 * `style`, enabling the binary-search font scaler to measure text length and
 * attach a ref for live DOM measurement. The explicit `ref` field is a
 * pragmatic typing shim for `React.cloneElement` with ref-forwarding components.
 */
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

    let animationFrameId: number;

    const calculateOptimalFontSize = (): number => {
      if (container.offsetParent === null) return fontSize; // Use current font size if not visible
      
      content.style.fontSize = '';

      let low = MIN_FONT_SIZE;
      let high = MAX_FONT_SIZE;

      for (let i = 0; i < ITERATIONS; i++) {
        const mid = (low + high + 1) / 2;
        content.style.fontSize = `${mid}px`;
        if (content.scrollHeight > container.clientHeight || content.scrollWidth > container.clientWidth) {
          high = mid - 1;
        } else {
          low = mid;
        }
      }
      return low;
    };

    const observer = new ResizeObserver(() => {
      animationFrameId = requestAnimationFrame(() => {
        setFontSize(calculateOptimalFontSize());
      });
    });

    // Only observe the container. Observing the content while modifying it causes the loop.
    observer.observe(container);

    // Initial calculation on mount and on text change.
    setFontSize(calculateOptimalFontSize());

    return () => {
      observer.disconnect();
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [children.props.initialText]);

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