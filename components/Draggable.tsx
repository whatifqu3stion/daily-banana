import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ElementPosition, ElementSize } from '../types';

interface DraggableProps {
  children: React.ReactNode;
  initialPosition: ElementPosition;
  initialSize: ElementSize;
  onPositionChange: (position: { x: number; y: number; }) => void;
  onSizeChange: (size: { width: number; height: number; }) => void;
  boundaryRef: React.RefObject<HTMLElement>;
  disableDrag?: boolean;
}

const Draggable: React.FC<DraggableProps> = ({ children, initialPosition, initialSize, onPositionChange, onSizeChange, boundaryRef, disableDrag = false }) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  
  const dragStartPos = useRef({ x: 0, y: 0 });
  const resizeStartInfo = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const elementRef = useRef<HTMLDivElement>(null);
  
  // This effect syncs, resolves, and clamps the element's position and size.
  useEffect(() => {
    // A timeout is used to ensure the boundary element has been rendered and has a valid size.
    const timer = setTimeout(() => {
        if (!boundaryRef.current) return;

        const boundaryRect = boundaryRef.current.getBoundingClientRect();
        if (boundaryRect.width === 0 || boundaryRect.height === 0) return;

        const resolveValue = (value: number | string, max: number): number => {
            if (typeof value === 'string' && value.endsWith('%')) {
                return (parseFloat(value) / 100) * max;
            }
            return Number(value); // Coerce to handle string numbers without '%'
        };
        
        const resolvedPos = {
            x: resolveValue(initialPosition.x, boundaryRect.width),
            y: resolveValue(initialPosition.y, boundaryRect.height),
        };
        const resolvedSize = {
            width: resolveValue(initialSize.width, boundaryRect.width),
            height: resolveValue(initialSize.height, boundaryRect.height),
        };

        let clampedWidth = Math.min(resolvedSize.width, boundaryRect.width);
        let clampedHeight = Math.min(resolvedSize.height, boundaryRect.height);

        let clampedX = Math.max(0, Math.min(resolvedPos.x, boundaryRect.width - clampedWidth));
        let clampedY = Math.max(0, Math.min(resolvedPos.y, boundaryRect.height - clampedHeight));
        
        // Update local state for rendering
        setPosition({ x: clampedX, y: clampedY });
        setSize({ width: clampedWidth, height: clampedHeight });

        // If the initial values were percentages or clamping was needed, we must update the parent state with pixel values.
        const needsPositionUpdate = clampedX !== initialPosition.x || clampedY !== initialPosition.y;
        const needsSizeUpdate = clampedWidth !== initialSize.width || clampedHeight !== initialSize.height;

        if (needsSizeUpdate) {
            onSizeChange({ width: clampedWidth, height: clampedHeight });
        }
        if (needsPositionUpdate) {
            onPositionChange({ x: clampedX, y: clampedY });
        }
    }, 0);

    return () => clearTimeout(timer);
  }, [initialPosition, initialSize, boundaryRef, onPositionChange, onSizeChange]);


  const handleDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!elementRef.current || disableDrag) return;
    setIsDragging(true);
    const rect = elementRef.current.getBoundingClientRect();
    dragStartPos.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    e.preventDefault();
    e.stopPropagation();
  };

  const handleResizeStart = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsResizing(true);
    resizeStartInfo.current = {
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height,
    };
    e.preventDefault();
    e.stopPropagation();
  };
  
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging && !isResizing) return;

    if (isDragging) {
      if (!boundaryRef.current || !elementRef.current) return;

      const boundaryRect = boundaryRef.current.getBoundingClientRect();
      let newX = e.clientX - boundaryRect.left - dragStartPos.current.x;
      let newY = e.clientY - boundaryRect.top - dragStartPos.current.y;
      
      // Allow element to be dragged partially outside its container.
      // The element can go up to half its own size outside the boundary on any side.
      const overlapFactor = 0.5;
      const minX = -size.width * overlapFactor;
      const maxX = boundaryRect.width - size.width * (1 - overlapFactor);
      const minY = -size.height * overlapFactor;
      const maxY = boundaryRect.height - size.height * (1 - overlapFactor);

      newX = Math.max(minX, Math.min(newX, maxX));
      newY = Math.max(minY, Math.min(newY, maxY));

      const newPosition = { x: newX, y: newY };
      setPosition(newPosition);
      onPositionChange(newPosition);
    }

    if (isResizing) {
       if (!boundaryRef.current) return;

       const boundaryRect = boundaryRef.current.getBoundingClientRect();
       const dx = e.clientX - resizeStartInfo.current.x;
       const dy = e.clientY - resizeStartInfo.current.y;

       let newWidth = resizeStartInfo.current.width + dx;
       let newHeight = resizeStartInfo.current.height + dy;

       // Clamp size
       newWidth = Math.max(50, Math.min(newWidth, boundaryRect.width - position.x));
       newHeight = Math.max(40, Math.min(newHeight, boundaryRect.height - position.y));

       const newSize = { width: newWidth, height: newHeight };
       setSize(newSize);
       onSizeChange(newSize);
    }
  }, [isDragging, isResizing, boundaryRef, onPositionChange, onSizeChange, size, position]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isDragging || isResizing) {
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
  }, [isDragging, isResizing, handleMouseMove, handleMouseUp]);

  return (
    <div
      ref={elementRef}
      onMouseDown={handleDragStart}
      className="absolute z-10 group"
      style={{ 
        left: `${position.x}px`, 
        top: `${position.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
      }}
    >
      <div className="w-full h-full cursor-move">
        {children}
      </div>
      <div
        onMouseDown={handleResizeStart}
        className="absolute -right-1 -bottom-1 w-4 h-4 bg-black border-2 border-white rounded-full cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity"
      />
    </div>
  );
};

export default Draggable;