import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ElementPosition, ElementSize } from '../types';

interface TransformableProps {
  children: React.ReactNode;
  initialPosition: ElementPosition;
  initialSize: ElementSize;
  onPositionChange: (position: ElementPosition) => void;
  onSizeChange: (size: ElementSize) => void;
  boundaryRef: React.RefObject<HTMLElement>;
}

const Transformable: React.FC<TransformableProps> = ({ children, initialPosition, initialSize, onPositionChange, onSizeChange, boundaryRef }) => {
  const [position, setPosition] = useState(initialPosition);
  const [size, setSize] = useState(initialSize);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  
  const dragStartPos = useRef({ x: 0, y: 0 });
  const resizeStartInfo = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPosition(initialPosition);
  }, [initialPosition]);

  useEffect(() => {
    setSize(initialSize);
  }, [initialSize]);
  
  // This effect runs on mount and when initial props change, to ensure the element is within bounds.
  useEffect(() => {
    // A timeout is used to ensure the boundary element has been rendered and has a valid size.
    const timer = setTimeout(() => {
        if (!boundaryRef.current) return;

        const boundaryRect = boundaryRef.current.getBoundingClientRect();
        if (boundaryRect.width === 0 || boundaryRect.height === 0) return;

        let clampedWidth = Math.min(initialSize.width, boundaryRect.width);
        let clampedHeight = Math.min(initialSize.height, boundaryRect.height);

        let clampedX = Math.max(0, Math.min(initialPosition.x, boundaryRect.width - clampedWidth));
        let clampedY = Math.max(0, Math.min(initialPosition.y, boundaryRect.height - clampedHeight));
        
        // Check if clamping actually changed anything to prevent unnecessary re-renders.
        const sizeHasChanged = clampedWidth !== initialSize.width || clampedHeight !== initialSize.height;
        const positionHasChanged = clampedX !== initialPosition.x || clampedY !== initialPosition.y;

        if (sizeHasChanged) {
            onSizeChange({ width: clampedWidth, height: clampedHeight });
        }
        if (positionHasChanged) {
            onPositionChange({ x: clampedX, y: clampedY });
        }
    }, 0);

    return () => clearTimeout(timer);
  }, [initialPosition, initialSize, boundaryRef, onPositionChange, onSizeChange]);

  const handleDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!elementRef.current) return;
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
      
      newX = Math.max(0, Math.min(newX, boundaryRect.width - size.width));
      newY = Math.max(0, Math.min(newY, boundaryRect.height - size.height));

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

export default Transformable;