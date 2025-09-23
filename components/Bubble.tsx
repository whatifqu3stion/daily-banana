// components/Bubble.tsx
import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { BubbleData, ElementPosition } from '../types';
import InvertColorsIcon from './icons/InvertColorsIcon';
import Tooltip from './Tooltip';

interface BubbleProps {
  bubbleData: BubbleData;
  onUpdate: (updatedData: Partial<BubbleData>) => void;
  children: React.ReactNode;
}

const Bubble: React.FC<BubbleProps> = ({ bubbleData, onUpdate, children }) => {
  const { role, tailPosition, invertedColors } = bubbleData;
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    let animationFrameId: number;

    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        // By wrapping the state update in requestAnimationFrame, we prevent the
        // "ResizeObserver loop completed with undelivered notifications" error.
        // This decouples the state update from the synchronous execution of the observer.
        animationFrameId = requestAnimationFrame(() => {
            setDimensions({
              width: entry.contentRect.width,
              height: entry.contentRect.height,
            });
        });
      }
    });

    observer.observe(container);
    return () => {
        observer.disconnect();
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }
    };
  }, []);

  const resolvePosition = useCallback((pos: ElementPosition, containerWidth: number, containerHeight: number): { x: number; y: number } => {
    const resolve = (val: string | number, max: number) => {
      if (typeof val === 'string' && val.endsWith('%')) {
        return (parseFloat(val) / 100) * max;
      }
      return Number(val);
    };
    return {
      x: resolve(pos.x, containerWidth),
      y: resolve(pos.y, containerHeight),
    };
  }, []);
  
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!tailPosition) return;
    setIsDragging(true);
    const { width, height } = dimensions;
    const currentTailPos = resolvePosition(tailPosition, width, height);
    dragStart.current = {
      x: e.clientX - currentTailPos.x,
      y: e.clientY - currentTailPos.y,
    };
    e.preventDefault();
    e.stopPropagation();
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    const { width, height } = dimensions;
    if (width === 0 || height === 0) return;
    
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;

    const newX = e.clientX - containerRect.left - (dragStart.current.x - resolvePosition(tailPosition!, width, height).x);
    const newY = e.clientY - containerRect.top - (dragStart.current.y - resolvePosition(tailPosition!, width, height).y);

    onUpdate({
      tailPosition: {
        x: `${(newX / width) * 100}%`,
        y: `${(newY / height) * 100}%`,
      }
    });
  }, [isDragging, onUpdate, dimensions, tailPosition, resolvePosition]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const handleInvertColors = () => {
    onUpdate({ invertedColors: !invertedColors });
  };
  
  /**
   * FIX: This function has been re-engineered to return a single, continuous SVG path string.
   * By creating a compound path (the body and the tail as one shape), we solve two problems:
   * 1. The tail is now correctly filled because it's part of the main shape.
   * 2. Visual glitches and seams are eliminated because there's only one path to render.
   */
  const getSpeechBubblePath = (width: number, height: number, tailX: number, tailY: number): string => {
    const rx = Math.min(width * 0.15, 25);
    const ry = Math.min(height * 0.15, 25);
    
    // Main bubble body path
    const body = `M${rx},0 H${width - rx} A${rx},${ry} 0 0 1 ${width},${ry} V${height - ry} A${rx},${ry} 0 0 1 ${width - rx},${height} H${rx} A${rx},${ry} 0 0 1 0,${height - ry} V${ry} A${rx},${ry} 0 0 1 ${rx},0 Z`;

    // Calculate tail connection points
    const centerX = width / 2;
    const centerY = height / 2;
    const angle = Math.atan2(tailY - centerY, tailX - centerX);

    const effectiveRadiusX = width / 2 - rx/2;
    const effectiveRadiusY = height / 2 - ry/2;
    const intersectX = centerX + Math.cos(angle) * effectiveRadiusX;
    const intersectY = centerY + Math.sin(angle) * effectiveRadiusY;

    // Create a closed triangular path for the tail
    const tailWidthAtBase = 25;
    const p1x = intersectX + Math.cos(angle + Math.PI / 2) * tailWidthAtBase / 2;
    const p1y = intersectY + Math.sin(angle + Math.PI / 2) * tailWidthAtBase / 2;
    const p2x = intersectX - Math.cos(angle + Math.PI / 2) * tailWidthAtBase / 2;
    const p2y = intersectY - Math.sin(angle + Math.PI / 2) * tailWidthAtBase / 2;

    const tail = `M${p1x},${p1y} L${tailX},${tailY} L${p2x},${p2y} Z`;
    
    // Return both paths as a single string to create a compound path
    return body + ' ' + tail;
  };
  
  const getThoughtBubblePath = (width: number, height: number) => {
    const rx = Math.min(width * 0.15, 25);
    const ry = Math.min(height * 0.15, 25);
    // A standard SVG path for a rounded rectangle. This provides a much better
    // container for text than the previous cloud shape.
    return `M${rx},0 H${width - rx} A${rx},${ry} 0 0 1 ${width},${ry} V${height - ry} A${rx},${ry} 0 0 1 ${width - rx},${height} H${rx} A${rx},${ry} 0 0 1 0,${height - ry} V${ry} A${rx},${ry} 0 0 1 ${rx},0 Z`;
  };
  
  const renderBubble = () => {
    const { width, height } = dimensions;
    if (width === 0 || height === 0) return null;

    let resolvedTailPos = { x: width / 2, y: height * 1.2 };
    if (tailPosition) {
      resolvedTailPos = resolvePosition(tailPosition, width, height);
    }
    
    const commonProps = {
        strokeWidth: 4,
        stroke: 'black',
        fill: invertedColors ? 'black' : 'white',
    };

    if (role === 'thought') {
      const path = getThoughtBubblePath(width, height);
      const tailX = width / 2;
      const tailY = height * 0.9;
      return (
        <>
            <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
                <path d={path} {...commonProps} />
                <circle cx={tailX} cy={tailY + 10} r="5" {...commonProps} />
                <circle cx={tailX - 10} cy={tailY + 25} r="3" {...commonProps} />
            </svg>
            <Tooltip text="Invert Colors">
                <button onClick={handleInvertColors} className="absolute top-1 right-1 p-1.5 bg-white/60 hover:bg-white/90 rounded-full transition-colors opacity-0 group-hover:opacity-100">
                    <InvertColorsIcon className="w-5 h-5" />
                </button>
            </Tooltip>
        </>
      );
    }
    
    if (role === 'speech') {
        const path = getSpeechBubblePath(width, height, resolvedTailPos.x, resolvedTailPos.y);
        return (
            <>
                <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
                    <path d={path} {...commonProps} />
                    <circle
                        cx={resolvedTailPos.x}
                        cy={resolvedTailPos.y}
                        r="10"
                        fill="rgba(0,0,0,0.5)"
                        onMouseDown={handleMouseDown}
                        className="cursor-move opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                </svg>
                <Tooltip text="Invert Colors">
                    <button onClick={handleInvertColors} className="absolute top-1 right-1 p-1.5 bg-white/60 hover:bg-white/90 rounded-full transition-colors opacity-0 group-hover:opacity-100">
                        <InvertColorsIcon className="w-5 h-5" />
                    </button>
                </Tooltip>
            </>
        );
    }

    return null;
  };

  return (
    <div ref={containerRef} className="w-full h-full relative group">
      {renderBubble()}
      <div className="absolute inset-0 p-4">
        {children}
      </div>
    </div>
  );
};

export default Bubble;