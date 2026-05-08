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

  // Stable ref to the latest onUpdate callback — prevents handlePointerMove from
  // being recreated (and the document listener from being re-attached) on every
  // parent re-render during an active tail drag.
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => { onUpdateRef.current = onUpdate; });

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let animationFrameId: number;
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        animationFrameId = requestAnimationFrame(() => {
          setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
        });
      }
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, []);

  const resolvePosition = useCallback((pos: ElementPosition, w: number, h: number) => {
    const resolve = (val: string | number, max: number) =>
      typeof val === 'string' && val.endsWith('%') ? (parseFloat(val) / 100) * max : Number(val);
    return { x: resolve(pos.x, w), y: resolve(pos.y, h) };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<SVGCircleElement>) => {
    if (!tailPosition) return;
    // Capture so pointermove/pointerup keep firing even outside the SVG element.
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;
    const { width, height } = dimensions;
    const currentTailPos = resolvePosition(tailPosition, width, height);
    dragStart.current = {
      x: (e.clientX - containerRect.left) - currentTailPos.x,
      y: (e.clientY - containerRect.top) - currentTailPos.y,
    };
    e.preventDefault();
    e.stopPropagation();
  };

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!isDragging) return;
    const { width, height } = dimensions;
    if (width === 0 || height === 0) return;
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;
    let newX = (e.clientX - containerRect.left) - dragStart.current.x;
    let newY = (e.clientY - containerRect.top) - dragStart.current.y;

    // Keep the tail tip OUTSIDE the bubble body so the path never inverts.
    // If the user drags it inside, snap it to the nearest edge + a small overshoot.
    const overshoot = 24;
    const inside = newX > 0 && newX < width && newY > 0 && newY < height;
    if (inside) {
      const dL = newX;
      const dR = width - newX;
      const dT = newY;
      const dB = height - newY;
      const min = Math.min(dL, dR, dT, dB);
      if (min === dL)      newX = -overshoot;
      else if (min === dR) newX = width + overshoot;
      else if (min === dT) newY = -overshoot;
      else                 newY = height + overshoot;
    }

    onUpdateRef.current({ tailPosition: { x: `${(newX / width) * 100}%`, y: `${(newY / height) * 100}%` } });
  // onUpdateRef is a stable ref — removing it from deps prevents handlePointerMove
  // from being recreated on every drag-induced re-render (which was re-attaching the
  // document listener on every pointermove event).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging, dimensions]);

  const handlePointerUp = useCallback(() => setIsDragging(false), []);

  useEffect(() => {
    if (isDragging) {
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
  }, [isDragging, handlePointerMove, handlePointerUp]);

  const handleInvertColors = () => onUpdate({ invertedColors: !invertedColors });

  /**
   * Builds a speech-bubble SVG path where the tail is INTEGRATED into the
   * body outline — no separate closed triangle, no internal stroke seam.
   *
   * The algorithm finds which edge (top / right / bottom / left) the ray from
   * the bubble centre to the tail tip exits through, computes the intersection
   * point on that edge, then walks the rounded-rectangle path and "detours"
   * through the tail at that edge.
   */
  const getSpeechBubblePath = (w: number, h: number, tailX: number, tailY: number): string => {
    const rx = Math.min(w * 0.12, 16);
    const ry = Math.min(h * 0.12, 16);
    const hw = 14; // half-width of tail base

    const cx = w / 2;
    const cy = h / 2;
    const dx = tailX - cx;
    const dy = tailY - cy;

    // Normalise direction by half-extents to find dominant edge.
    const normDx = dx / cx;  // ±1 at the left/right edge
    const normDy = dy / cy;  // ±1 at the top/bottom edge

    // Minimum padding so the tail base stays on the straight (non-arc) part
    const pad = rx + hw + 4;

    if (Math.abs(normDy) >= Math.abs(normDx)) {
      // ── Tail exits through top or bottom ─────────────────────────────────
      const exitY = dy >= 0 ? h : 0;
      // x-coordinate where the centre→tip ray crosses that horizontal edge
      let bx = dy !== 0 ? cx + dx * (exitY - cy) / dy : cx;
      bx = Math.max(pad, Math.min(w - pad, bx));

      if (dy >= 0) {
        // Bottom exit
        return [
          `M ${rx} 0`, `H ${w - rx}`,
          `A ${rx} ${ry} 0 0 1 ${w} ${ry}`,
          `V ${h - ry}`,
          `A ${rx} ${ry} 0 0 1 ${w - rx} ${h}`,
          `H ${bx + hw}`,
          `L ${tailX} ${tailY}`,
          `L ${bx - hw} ${h}`,
          `H ${rx}`,
          `A ${rx} ${ry} 0 0 1 0 ${h - ry}`,
          `V ${ry}`,
          `A ${rx} ${ry} 0 0 1 ${rx} 0 Z`,
        ].join(' ');
      } else {
        // Top exit
        return [
          `M ${rx} 0`,
          `H ${bx - hw}`,
          `L ${tailX} ${tailY}`,
          `L ${bx + hw} 0`,
          `H ${w - rx}`,
          `A ${rx} ${ry} 0 0 1 ${w} ${ry}`,
          `V ${h - ry}`,
          `A ${rx} ${ry} 0 0 1 ${w - rx} ${h}`,
          `H ${rx}`,
          `A ${rx} ${ry} 0 0 1 0 ${h - ry}`,
          `V ${ry}`,
          `A ${rx} ${ry} 0 0 1 ${rx} 0 Z`,
        ].join(' ');
      }
    } else {
      // ── Tail exits through left or right ─────────────────────────────────
      const exitX = dx >= 0 ? w : 0;
      let by = dx !== 0 ? cy + dy * (exitX - cx) / dx : cy;
      by = Math.max(pad, Math.min(h - pad, by));

      if (dx >= 0) {
        // Right exit
        return [
          `M ${rx} 0`, `H ${w - rx}`,
          `A ${rx} ${ry} 0 0 1 ${w} ${ry}`,
          `V ${by - hw}`,
          `L ${tailX} ${tailY}`,
          `L ${w} ${by + hw}`,
          `V ${h - ry}`,
          `A ${rx} ${ry} 0 0 1 ${w - rx} ${h}`,
          `H ${rx}`,
          `A ${rx} ${ry} 0 0 1 0 ${h - ry}`,
          `V ${ry}`,
          `A ${rx} ${ry} 0 0 1 ${rx} 0 Z`,
        ].join(' ');
      } else {
        // Left exit
        return [
          `M ${rx} 0`, `H ${w - rx}`,
          `A ${rx} ${ry} 0 0 1 ${w} ${ry}`,
          `V ${h - ry}`,
          `A ${rx} ${ry} 0 0 1 ${w - rx} ${h}`,
          `H ${rx}`,
          `A ${rx} ${ry} 0 0 1 0 ${h - ry}`,
          `V ${by + hw}`,
          `L ${tailX} ${tailY}`,
          `L 0 ${by - hw}`,
          `V ${ry}`,
          `A ${rx} ${ry} 0 0 1 ${rx} 0 Z`,
        ].join(' ');
      }
    }
  };

  const getThoughtBubblePath = (w: number, h: number) => {
    const rx = Math.min(w * 0.15, 25);
    const ry = Math.min(h * 0.15, 25);
    return `M${rx},0 H${w - rx} A${rx},${ry} 0 0 1 ${w},${ry} V${h - ry} A${rx},${ry} 0 0 1 ${w - rx},${h} H${rx} A${rx},${ry} 0 0 1 0,${h - ry} V${ry} A${rx},${ry} 0 0 1 ${rx},0 Z`;
  };

  const renderBubble = () => {
    const { width, height } = dimensions;
    if (width === 0 || height === 0) return null;

    const fill   = invertedColors ? 'black' : 'white';
    const stroke = 'black';

    if (role === 'thought') {
      const path = getThoughtBubblePath(width, height);
      const dotCx = width / 2;
      const dotCy = height * 0.9;
      return (
        <>
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
            <path d={path} strokeWidth={4} stroke={stroke} fill={fill} />
            <circle cx={dotCx} cy={dotCy + 10} r="5" strokeWidth={3} stroke={stroke} fill={fill} />
            <circle cx={dotCx - 8} cy={dotCy + 23} r="3" strokeWidth={2} stroke={stroke} fill={fill} />
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
      let resolvedTailPos = { x: width / 2, y: height * 1.2 };
      if (tailPosition) resolvedTailPos = resolvePosition(tailPosition, width, height);

      const path = getSpeechBubblePath(width, height, resolvedTailPos.x, resolvedTailPos.y);
      return (
        <>
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible" style={{ touchAction: 'none' }}>
            <path d={path} strokeWidth={4} stroke={stroke} fill={fill} />
            {/* Drag handle — visible on hover; pointer events enabled for mouse and touch */}
            <circle
              cx={resolvedTailPos.x}
              cy={resolvedTailPos.y}
              r="10"
              fill="rgba(0,0,0,0.45)"
              onPointerDown={handlePointerDown}
              className="cursor-move opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ touchAction: 'none' }}
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
