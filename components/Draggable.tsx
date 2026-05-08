import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { ElementPosition, ElementSize } from '../types';

interface DraggableProps {
  children: React.ReactNode;
  initialPosition: ElementPosition;
  initialSize: ElementSize;
  onPositionChange: (position: ElementPosition) => void;
  onSizeChange: (size: ElementSize) => void;
  boundaryRef: React.RefObject<HTMLElement>;
  disableDrag?: boolean;
}

const resolveValue = (value: number | string, max: number): number => {
  if (typeof value === 'string' && value.endsWith('%')) {
    return (parseFloat(value) / 100) * max;
  }
  return Number(value);
};

const toPct = (n: number, max: number): string =>
  `${Math.round((n / max) * 10000) / 100}%`;

const isPct = (v: number | string): boolean =>
  typeof v === 'string' && (v as string).endsWith('%');

const Draggable: React.FC<DraggableProps> = ({
  children,
  initialPosition,
  initialSize,
  onPositionChange,
  onSizeChange,
  boundaryRef,
  disableDrag = false,
}) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [boundarySize, setBoundarySize] = useState({ width: 0, height: 0 });

  const dragStartPos = useRef({ x: 0, y: 0 });
  const resizeStartInfo = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const elementRef = useRef<HTMLDivElement>(null);

  // Keep callback refs current without adding them to the effect dep array.
  const onPositionChangeRef = useRef(onPositionChange);
  const onSizeChangeRef = useRef(onSizeChange);
  useEffect(() => { onPositionChangeRef.current = onPositionChange; });
  useEffect(() => { onSizeChangeRef.current = onSizeChange; });

  // Track boundary element dimensions via ResizeObserver.
  // This fires on first layout (replacing the old setTimeout hack) and again
  // any time the panel resizes — e.g. when the browser window is resized.
  useLayoutEffect(() => {
    const boundary = boundaryRef.current;
    if (!boundary) return;
    let rafId: number;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      rafId = requestAnimationFrame(() => {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) setBoundarySize({ width, height });
      });
    });
    observer.observe(boundary);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, [boundaryRef]);

  // Resolve and clamp position/size whenever initial values or boundary dimensions change.
  // Positions are always stored and reported as percentage strings so they remain
  // correct across panel resizes — the next ResizeObserver tick re-resolves them
  // to the new pixel values automatically.
  useEffect(() => {
    const { width, height } = boundarySize;
    if (width === 0 || height === 0) return;

    const resolvedW = resolveValue(initialSize.width, width);
    const resolvedH = resolveValue(initialSize.height, height);
    const clampedWidth = Math.min(resolvedW, width);
    const clampedHeight = Math.min(resolvedH, height);

    const resolvedX = resolveValue(initialPosition.x, width);
    const resolvedY = resolveValue(initialPosition.y, height);
    const clampedX = Math.max(0, Math.min(resolvedX, width - clampedWidth));
    const clampedY = Math.max(0, Math.min(resolvedY, height - clampedHeight));

    setPosition({ x: clampedX, y: clampedY });
    setSize({ width: clampedWidth, height: clampedHeight });

    // Only notify parent if:
    //   (a) the stored values were raw pixels (not %) — convert them to %, or
    //   (b) clamping actually moved the element — report the corrected position.
    // This prevents a cascade of spurious state updates on every resize event
    // when positions are already stored as percentages and nothing changed.
    const xClamped = Math.abs(resolvedX - clampedX) > 0.5;
    const yClamped = Math.abs(resolvedY - clampedY) > 0.5;
    const wClamped = Math.abs(resolvedW - clampedWidth) > 0.5;
    const hClamped = Math.abs(resolvedH - clampedHeight) > 0.5;

    if (!isPct(initialPosition.x) || !isPct(initialPosition.y) || xClamped || yClamped) {
      onPositionChangeRef.current({
        x: toPct(clampedX, width),
        y: toPct(clampedY, height),
      });
    }
    if (!isPct(initialSize.width) || !isPct(initialSize.height) || wClamped || hClamped) {
      onSizeChangeRef.current({
        width: toPct(clampedWidth, width),
        height: toPct(clampedHeight, height),
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPosition, initialSize, boundarySize]);


  const handleDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!elementRef.current || disableDrag) return;
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

      const overlapFactor = 0.5;
      const minX = -size.width * overlapFactor;
      const maxX = boundaryRect.width - size.width * (1 - overlapFactor);
      const minY = -size.height * overlapFactor;
      const maxY = boundaryRect.height - size.height * (1 - overlapFactor);

      newX = Math.max(minX, Math.min(newX, maxX));
      newY = Math.max(minY, Math.min(newY, maxY));

      setPosition({ x: newX, y: newY });
      // Report as percentages so positions survive panel resizes.
      onPositionChangeRef.current({
        x: toPct(newX, boundaryRect.width),
        y: toPct(newY, boundaryRect.height),
      });
    }

    if (isResizing) {
      if (!boundaryRef.current) return;

      const boundaryRect = boundaryRef.current.getBoundingClientRect();
      const dx = e.clientX - resizeStartInfo.current.x;
      const dy = e.clientY - resizeStartInfo.current.y;

      let newWidth = resizeStartInfo.current.width + dx;
      let newHeight = resizeStartInfo.current.height + dy;

      newWidth = Math.max(50, Math.min(newWidth, boundaryRect.width - position.x));
      newHeight = Math.max(40, Math.min(newHeight, boundaryRect.height - position.y));

      setSize({ width: newWidth, height: newHeight });
      // Report as percentages so sizes survive panel resizes.
      onSizeChangeRef.current({
        width: toPct(newWidth, boundaryRect.width),
        height: toPct(newHeight, boundaryRect.height),
      });
    }
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
        touchAction: 'none',
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
