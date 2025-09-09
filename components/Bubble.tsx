
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BubbleData } from '../types';
import InvertColorsIcon from './icons/InvertColorsIcon';

interface BubbleProps {
  bubbleData: BubbleData;
  onUpdate: (updatedData: Partial<BubbleData>) => void;
  children: React.ReactNode;
}

const resolveValue = (value: number | string, max: number): number => {
    if (typeof value === 'string' && value.endsWith('%')) {
        return (parseFloat(value) / 100) * max;
    }
    return Number(value);
};

const DraggableHandle: React.FC<{
    position: { x: number; y: number };
    onDrag: (pos: { x: number; y: number }) => void;
    boundary: { width: number; height: number };
    inverted: boolean;
}> = ({ position, onDrag, boundary, inverted }) => {
    const handleRef = useRef<HTMLDivElement>(null);
    
    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const startX = e.clientX;
        const startY = e.clientY;
        const initialX = position.x;
        const initialY = position.y;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;
            let newX = initialX + dx;
            let newY = initialY + dy;
            
            // Allow tail to be dragged outside the bubble bounds for better flexibility
            newX = Math.max(-boundary.width * 0.5, Math.min(newX, boundary.width * 1.5));
            newY = Math.max(-boundary.height * 0.5, Math.min(newY, boundary.height * 1.5));
            
            onDrag({ x: newX, y: newY });
        };
        
        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    return (
        <div 
            ref={handleRef}
            className="tail-handle"
            style={{ 
              left: `${position.x}px`, 
              top: `${position.y}px`,
              borderColor: inverted ? 'black' : 'white',
            }}
            onMouseDown={handleMouseDown}
        />
    );
};

/**
 * Calculates the two points for the base of the speech bubble tail,
 * dynamically attaching it to the closest edge of the bubble.
 */
const getTailAttachment = (
    size: { width: number; height: number },
    tailPos: { x: number; y: number },
    padding: number,
    cornerRadius: number
) => {
    const { width, height } = size;
    const { x: tailX, y: tailY } = tailPos;

    const cx = width / 2;
    const cy = height / 2;
    const dx = tailX - cx;
    const dy = tailY - cy;

    const tailWidth = Math.min(width * 0.2, 20);
    let p1: { x: number, y: number }, p2: { x: number, y: number };

    // Determine edge by comparing normalized distances from center
    if (Math.abs(dx / width) > Math.abs(dy / height)) { // Left or Right edge
        if (dx > 0) { // Right edge
            const y = Math.max(cornerRadius, Math.min(tailY, height - cornerRadius));
            p1 = { x: width - padding, y: y - tailWidth / 2 };
            p2 = { x: width - padding, y: y + tailWidth / 2 };
        } else { // Left edge
            const y = Math.max(cornerRadius, Math.min(tailY, height - cornerRadius));
            p1 = { x: padding, y: y + tailWidth / 2 };
            p2 = { x: padding, y: y - tailWidth / 2 };
        }
    } else { // Top or Bottom edge
        if (dy > 0) { // Bottom edge
            const x = Math.max(cornerRadius, Math.min(tailX, width - cornerRadius));
            p1 = { x: x - tailWidth / 2, y: height - padding };
            p2 = { x: x + tailWidth / 2, y: height - padding };
        } else { // Top edge
            const x = Math.max(cornerRadius, Math.min(tailX, width - cornerRadius));
            p1 = { x: x + tailWidth / 2, y: padding };
            p2 = { x: x - tailWidth / 2, y: padding };
        }
    }
    return { p1, p2 };
};

/**
 * Generates the `d` attribute for a single, continuous SVG path that forms
 * a rounded rectangle with a seamlessly integrated speech tail.
 */
const generateBubblePath = (
    size: { width: number, height: number },
    tailPos: { x: number, y: number },
    cornerRadius: number,
    padding: number
) => {
    const { width, height } = size;
    const { x: tailX, y: tailY } = tailPos;

    const { p1, p2 } = getTailAttachment(size, tailPos, padding, cornerRadius);

    const w = width - padding * 2;
    const h = height - padding * 2;
    const r = Math.max(0, cornerRadius - padding); // Adjust radius for padding
    const p = padding;

    // Determine which edge the tail is on
    const cx = width / 2;
    const cy = height / 2;
    const dx = tailX - cx;
    const dy = tailY - cy;
    let edge: 'top' | 'right' | 'bottom' | 'left';
    if (Math.abs(dx / width) > Math.abs(dy / height)) {
        edge = dx > 0 ? 'right' : 'left';
    } else {
        edge = dy > 0 ? 'bottom' : 'top';
    }
    
    const parts: string[] = [];
    parts.push(`M ${p + r},${p}`); // Start at top-left after corner

    // Top edge
    if (edge === 'top') {
        parts.push(`L ${p2.x},${p2.y}`, `L ${tailPos.x},${tailPos.y}`, `L ${p1.x},${p1.y}`);
    }
    parts.push(`L ${p + w - r},${p}`);
    parts.push(`A ${r},${r} 0 0 1 ${p + w},${p + r}`); // Top-right corner

    // Right edge
    if (edge === 'right') {
        parts.push(`L ${p1.x},${p1.y}`, `L ${tailPos.x},${tailPos.y}`, `L ${p2.x},${p2.y}`);
    }
    parts.push(`L ${p + w},${p + h - r}`);
    parts.push(`A ${r},${r} 0 0 1 ${p + w - r},${p + h}`); // Bottom-right corner

    // Bottom edge
    if (edge === 'bottom') {
        parts.push(`L ${p2.x},${p2.y}`, `L ${tailPos.x},${tailPos.y}`, `L ${p1.x},${p1.y}`);
    }
    parts.push(`L ${p + r},${p + h}`);
    parts.push(`A ${r},${r} 0 0 1 ${p},${p + h - r}`); // Bottom-left corner

    // Left edge
    if (edge === 'left') {
        parts.push(`L ${p1.x},${p1.y}`, `L ${tailPos.x},${tailPos.y}`, `L ${p2.x},${p2.y}`);
    }
    parts.push(`L ${p},${p + r}`);
    parts.push(`A ${r},${r} 0 0 1 ${p + r},${p}`); // Top-left corner

    parts.push('Z');
    
    return parts.join(' ');
};

const SpeechBubble: React.FC<{ children: React.ReactNode; size: { width: number, height: number }, tailPos: {x: number, y: number}, inverted: boolean }> = ({ children, size, tailPos, inverted }) => {
    const { width, height } = size;
    if (width === 0 || height === 0) return null;

    const strokeWidth = 2;
    const padding = strokeWidth / 2;
    const cornerRadius = Math.min(width, height) * 0.15;

    const bubblePath = generateBubblePath(size, tailPos, cornerRadius, padding);
    const fill = inverted ? 'black' : 'white';
    const stroke = inverted ? 'white' : 'black';
    const textColor = inverted ? 'text-white' : 'text-black';
    
    return (
        <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
            <path
                d={bubblePath}
                fill={fill}
                stroke={stroke}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
            />
            <foreignObject x="0" y="0" width="100%" height="100%">
                 <div className={`w-full h-full flex items-center justify-center p-4 box-border text-base ${textColor}`}
                      style={{ lineHeight: '1.2' }}
                 >
                    {children}
                </div>
            </foreignObject>
        </svg>
    );
};


const ThoughtBubble: React.FC<{ children: React.ReactNode; size: { width: number, height: number }, inverted: boolean }> = ({ children, size, inverted }) => {
    if (size.width === 0 || size.height === 0) return null;

    const fill = inverted ? 'black' : 'white';
    const stroke = inverted ? 'white' : 'black';
    const textColor = inverted ? 'text-white' : 'text-black';
    
    return (
        <div className="relative w-full h-full">
            <svg
                className="absolute inset-0 w-full h-full"
                viewBox="0 0 1 1"
                preserveAspectRatio="none"
                style={{ overflow: 'visible' }}
            >
                <use href="#thought-bubble-symbol" fill={fill} stroke={stroke} />
            </svg>
            
            <div 
                className={`absolute inset-[15%] flex items-center justify-center text-center text-base ${textColor}`}
                style={{ lineHeight: '1.2' }}
            >
                {children}
            </div>
        </div>
    );
};

const Bubble: React.FC<BubbleProps> = ({ bubbleData, onUpdate, children }) => {
  const { role, tailPosition, invertedColors = false } = bubbleData;
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [resolvedSize, setResolvedSize] = useState({ width: 0, height: 0 });
  const [resolvedTailPos, setResolvedTailPos] = useState({ x: 0, y: 0 });
  const isDraggingTailRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !tailPosition) return;

    const observer = new ResizeObserver(entries => {
      if (isDraggingTailRef.current) return; // Prevent observer firing during drag
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setResolvedSize({ width, height });
          setResolvedTailPos({
            x: resolveValue(tailPosition.x, width),
            y: resolveValue(tailPosition.y, height),
          });
        }
      }
    });

    observer.observe(container);

    // Initial check for size in case ResizeObserver is slow to fire
    const rect = container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
        setResolvedSize({ width: rect.width, height: rect.height });
        setResolvedTailPos({
            x: resolveValue(tailPosition.x, rect.width),
            y: resolveValue(tailPosition.y, rect.height),
        });
    }


    return () => {
      observer.disconnect();
    };
  }, [tailPosition]);

  const handleTailDrag = useCallback((newPos: { x: number; y: number }) => {
    isDraggingTailRef.current = true;
    setResolvedTailPos(newPos);
    onUpdate({ tailPosition: newPos });
    // Use a timeout to signal that dragging has ended
    setTimeout(() => { isDraggingTailRef.current = false; }, 50);
  }, [onUpdate]);

  const handleToggleInvert = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdate({ invertedColors: !invertedColors });
  };


  if (!tailPosition && role !== 'thought') {
    // Safeguard for elements that might not have a tail
    return <div className="w-full h-full">{children}</div>;
  }

  return (
    <div ref={containerRef} className="w-full h-full relative group no-export">
      {resolvedSize.width > 0 ? (
        <>
          {role === 'thought' ? (
             <ThoughtBubble size={resolvedSize} inverted={invertedColors}>
                {children}
            </ThoughtBubble>
          ) : (
            <SpeechBubble size={resolvedSize} tailPos={resolvedTailPos} inverted={invertedColors}>
                {children}
            </SpeechBubble>
          )}
          {role !== 'thought' && tailPosition && (
             <DraggableHandle 
                  position={resolvedTailPos}
                  onDrag={handleTailDrag}
                  boundary={resolvedSize}
                  inverted={invertedColors}
              />
          )}
        </>
      ) : null}
      <button
          onClick={handleToggleInvert}
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute -right-1 -top-1 w-6 h-6 bg-white border-2 border-black rounded-full flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity z-20"
          title="Invert Colors"
          aria-label="Invert bubble colors"
      >
        <InvertColorsIcon className="w-4 h-4 text-black" />
      </button>
    </div>
  );
};

export default Bubble;