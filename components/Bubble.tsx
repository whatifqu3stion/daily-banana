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

    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
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
    
    // Get the container's position relative to the viewport
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;

    // Calculate new position relative to the container, not the viewport
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
  
  const getSpeechBubblePath = (width: number, height: number, tailX: number, tailY: number) => {
    const rx = Math.min(width * 0.15, 25);
    const ry = Math.min(height * 0.15, 25);
    
    const body = `M${rx},0 H${width - rx} A${rx},${ry} 0 0 1 ${width},${ry} V${height - ry} A${rx},${ry} 0 0 1 ${width - rx},${height} H${rx} A${rx},${ry} 0 0 1 0,${height - ry} V${ry} A${rx},${ry} 0 0 1 ${rx},0 Z`;

    const centerX = width / 2;
    const centerY = height / 2;
    const angle = Math.atan2(tailY - centerY, tailX - centerX);

    // Heuristic to find a point on the rounded rectangle's perimeter
    const effectiveRadiusX = width / 2 - rx/2;
    const effectiveRadiusY = height / 2 - ry/2;
    const intersectX = centerX + Math.cos(angle) * effectiveRadiusX;
    const intersectY = centerY + Math.sin(angle) * effectiveRadiusY;

    const tailWidthAtBase = 25;
    const p1x = intersectX + Math.cos(angle + Math.PI / 2) * tailWidthAtBase / 2;
    const p1y = intersectY + Math.sin(angle + Math.PI / 2) * tailWidthAtBase / 2;
    const p2x = intersectX - Math.cos(angle + Math.PI / 2) * tailWidthAtBase / 2;
    const p2y = intersectY - Math.sin(angle + Math.PI / 2) * tailWidthAtBase / 2;

    const tail = `M${p1x},${p1y} L${tailX},${tailY} L${p2x},${p2y}`;
    
    return { body, tail };
  };
  
  const getThoughtBubblePath = (width: number, height: number) => {
    const w = width;
    const h = height;
    const path = [
        `M ${w * 0.2},${h * 0.5}`,
        `C ${w * 0.05},${h * 0.25}, ${w * 0.3},${h * 0.1}, ${w * 0.5},${h * 0.1}`,
        `C ${w * 0.7},${h * 0.1}, ${w * 0.95},${h * 0.25}, ${w * 0.8},${h * 0.5}`,
        `C ${w * 0.95},${h * 0.75}, ${w * 0.7},${h * 0.9}, ${w * 0.5},${h * 0.9}`,
        `C ${w * 0.3},${h * 0.9}, ${w * 0.05},${h * 0.75}, ${w * 0.2},${h * 0.5}`,
        `Z`
    ].join(' ');
    return path;
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
        strokeLinejoin: 'round' as const,
        strokeLinecap: 'round' as const,
    };

    if (role === 'speech' && tailPosition) {
        const { body, tail } = getSpeechBubblePath(width, height, resolvedTailPos.x, resolvedTailPos.y);
        return (
            <>
                <path d={body} {...commonProps} />
                <path d={tail} {...commonProps} />
            </>
        )
    }

    if (role === 'thought') {
        const body = getThoughtBubblePath(width, height);
        const centerX = width / 2;
        const centerY = height * 0.7; // Start tail lower down
        
        const tailBubbles = [
            <circle key="t1" cx={resolvedTailPos.x} cy={resolvedTailPos.y} r={6} {...commonProps} />,
            <circle key="t2" cx={centerX * 0.3 + resolvedTailPos.x * 0.7} cy={centerY * 0.3 + resolvedTailPos.y * 0.7} r={10} {...commonProps} />,
            <circle key="t3" cx={centerX * 0.6 + resolvedTailPos.x * 0.4} cy={centerY * 0.6 + resolvedTailPos.y * 0.4} r={14} {...commonProps} />,
        ];

        return (
            <>
                <path d={body} {...commonProps} />
                {tailBubbles}
            </>
        )
    }
    
    // Default fallback (e.g., if speech bubble has no tail)
    return <rect x="2" y="2" width={width-4} height={height-4} rx="20" ry="20" {...commonProps} />;
  }
  
  let resolvedTailPos = { x: 0, y: 0 };
  if (tailPosition) {
    resolvedTailPos = resolvePosition(tailPosition, dimensions.width, dimensions.height);
  }
  
  return (
    <div ref={containerRef} className="relative w-full h-full group">
        <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
            className="absolute inset-0"
            style={{ overflow: 'visible' }}
        >
            {renderBubble()}
        </svg>

        <div className="absolute inset-2">
            {children}
        </div>

        {tailPosition && (
            <div
                onMouseDown={handleMouseDown}
                style={{
                    left: `${resolvedTailPos.x}px`,
                    top: `${resolvedTailPos.y}px`,
                }}
                className="absolute w-4 h-4 bg-black border-2 border-white rounded-full cursor-grab -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-20 active:cursor-grabbing"
            />
        )}
        
        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
          <Tooltip text={invertedColors ? "Switch to White Bubble" : "Switch to Black Bubble"}>
            <button
              onClick={handleInvertColors}
              className="p-1 bg-white/50 hover:bg-white rounded-full border border-black"
              aria-label="Invert bubble colors"
            >
              <InvertColorsIcon className="w-4 h-4 text-black" />
            </button>
          </Tooltip>
        </div>
    </div>
  );
};

export default Bubble;
