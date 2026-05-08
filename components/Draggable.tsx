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

  // Keep callback refs current without adding them to the effect dep array.
  // This prevents the sync effect from re-firing on every parent re-render
  // just because inline arrow functions were recreated.
  const onPositionChangeRef = useRef(onPositionChange);
  const onSizeChangeRef = useRef(onSizeChange);
  useEffect(() => { onPositionChangeRef.current = onPositionChange; });
  useEffect(() => { onSizeChangeRef.current = onSizeChange; });

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
            onSizeChangeRef.current({ width: clampedWidth, height: clampedHeight });
        }
        if (needsPositionUpdate) {
            onPositionChangeRef.current({ x: clampedX, y: clampedY });
        }
    }, 0);

    return () => clearTimeout(timer);
  // Intentionally omit onPositionChangeRef/onSizeChangeRef — they are stable
  // refs whose .current is kept up-to-date above. Only re-run when the actual
  // initial values or boundary change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPosition, initialSize, boundaryRef]);


  const handleDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!elementRef.current || disableDrag) return;
    // Capture the pointer so move/up events keep firing even outside the element.
    // This is what makes touch dragging work correctly on mobile.
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    const rect = elementRef.current.getBoundingClientRect();
    dragStartPos.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    e.preventDefault();
    e.stopPropagation();
  };

  const handleResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
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
  
  const handlePointerMove = useCallback((e: PointerEvent) => {
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
      onPositionChangeRef.current(newPosition);
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
       onSizeChangeRef.current(newSize);
    }
  // onPositionChangeRef and onSizeChangeRef are stable refs — kept current above.
  // Removing them from deps prevents handlePointerMove from being recreated on
  // every parent re-render during drag, which was re-attaching the document
  // listener on every pointermove event.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging, isResizing, boundaryRef, size, position]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isDragging || isResizing) {
      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
    } else {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    }

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging, isResizing, handlePointerMove, handlePointerUp]);

  return (
    <div
      ref={elementRef}
      onPointerDown={handleDragStart}
      className="absolute z-10 group"
      style={{ 
        left: `${position.x}px`, 
        top: `${position.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
        touchAction: 'none', // Prevent browser scroll/zoom from stealing touch events
      }}
    >
      <div className="w-full h-full cursor-move">
        {children}
      </div>
      <div
        onPointerDown={handleResizeStart}
        className="absolute -right-1.5 -bottom-1.5 w-5 h-5 bg-black border-2 border-white rounded-full cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ touchAction: 'none' }}
      />
    </div>
  );
};

export default Draggable;
