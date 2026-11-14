import React, { useCallback, useEffect, useRef } from 'react';

interface BatchLinesTextareaProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeightPx?: number;
  maxHeightViewportRatio?: number;
  className?: string;
}

/**
 * Mobile-friendly auto-growing + manually resizable batch textarea:
 * - Uses full available width and generous line spacing (`leading-7`, `16px` mobile text to avoid Safari zoom)
 * - Auto-adjusts height smoothly to fit phrases up to `maxHeightViewportRatio * window.innerHeight`
 * - Switches cleanly to internal scrolling (`overflow-y-auto overscroll-contain`) when lines exceed max height
 * - Preserves manual vertical dragging (`resize-y`) if the user explicitly drags the bottom handle
 */
export const BatchLinesTextarea: React.FC<BatchLinesTextareaProps> = ({
  id,
  value,
  onChange,
  placeholder,
  minHeightPx = 210,
  maxHeightViewportRatio = 0.44,
  className = '',
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const manualHeightRef = useRef<number | null>(null);
  const pointerDownHeightRef = useRef<number | null>(null);

  const getMaxHeightPx = useCallback(() => {
    if (typeof window === 'undefined') return 420;
    return Math.max(minHeightPx + 60, Math.round(window.innerHeight * maxHeightViewportRatio));
  }, [maxHeightViewportRatio, minHeightPx]);

  const syncHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;

    const maxPx = getMaxHeightPx();
    if (manualHeightRef.current !== null) {
      const clampedManual = Math.max(minHeightPx, Math.min(manualHeightRef.current, Math.round(maxPx * 1.35)));
      el.style.height = `${clampedManual}px`;
      return;
    }

    el.style.height = 'auto';
    const nextHeight = Math.max(minHeightPx, Math.min(el.scrollHeight + 4, maxPx));
    el.style.height = `${nextHeight}px`;
  }, [getMaxHeightPx, minHeightPx]);

  useEffect(() => {
    syncHeight();
  }, [value, syncHeight]);

  useEffect(() => {
    const onResize = () => syncHeight();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [syncHeight]);

  return (
    <textarea
      ref={textareaRef}
      id={id}
      value={value}
      onChange={(e) => {
        if (!e.target.value.trim()) {
          manualHeightRef.current = null;
        }
        onChange(e.target.value);
      }}
      onPointerDown={() => {
        if (textareaRef.current) {
          pointerDownHeightRef.current = textareaRef.current.offsetHeight;
        }
      }}
      onPointerUp={() => {
        const el = textareaRef.current;
        if (!el || pointerDownHeightRef.current === null) return;
        const delta = Math.abs(el.offsetHeight - pointerDownHeightRef.current);
        pointerDownHeightRef.current = null;
        if (delta > 6) {
          manualHeightRef.current = el.offsetHeight;
        }
      }}
      placeholder={placeholder}
      spellCheck={false}
      style={{
        minHeight: `${minHeightPx}px`,
        maxHeight: `${Math.round(maxHeightViewportRatio * 100)}dvh`,
      }}
      className={`w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base sm:text-[15px] text-slate-900 leading-7 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 focus:outline-none resize-y overflow-y-auto overscroll-contain transition-colors ${className}`}
    />
  );
};
