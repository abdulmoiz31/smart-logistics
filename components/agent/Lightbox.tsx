'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface LightboxProps {
  urls: string[];
  index: number;
  onClose: () => void;
  onNavigate: (i: number) => void;
  label: string;
  onRefreshUrls?: () => Promise<string[]>;
}

export function Lightbox({ urls, index, onClose, onNavigate, label, onRefreshUrls }: LightboxProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [refreshed, setRefreshed] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const currentUrl = urls[index];

  const goPrev = useCallback(() => {
    onNavigate(index > 0 ? index - 1 : urls.length - 1);
    setRefreshError(false);
  }, [index, onNavigate, urls.length]);

  const goNext = useCallback(() => {
    onNavigate(index < urls.length - 1 ? index + 1 : 0);
    setRefreshError(false);
  }, [index, onNavigate, urls.length]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goPrev();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goNext();
      } else if (event.key === 'Tab') {
        trapFocus(event);
      }
    }

    function trapFocus(event: KeyboardEvent) {
      const container = dialogRef.current;
      if (!container) return;
      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [goNext, goPrev, onClose]);

  async function handleImageError() {
    if (refreshed || !onRefreshUrls) return;
    try {
      await onRefreshUrls();
      setRefreshed(true);
    } catch {
      setRefreshError(true);
    }
  }

  const transitionClass = reducedMotion ? '' : 'transition-opacity duration-200';

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 ${transitionClass}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="relative flex max-h-[90vh] max-w-[90vw] flex-col items-center">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="absolute -top-10 right-0 rounded-lg px-2 py-1 text-sm font-bold text-white/90 hover:text-white focus:outline focus:outline-2 focus:outline-white"
        >
          Close
        </button>

        {refreshError ? (
          <div className="rounded-xl bg-white/10 p-6 text-center text-white">
            <p className="font-semibold">This photo link expired.</p>
            <p className="mt-1 text-sm text-white/80">Reload the page to refresh the images.</p>
          </div>
        ) : (
          <img
            src={currentUrl}
            alt={`Photo ${index + 1} of ${urls.length}`}
            className="max-h-[90vh] max-w-[90vw] object-contain"
            onError={handleImageError}
          />
        )}

        <p className="mt-3 text-sm font-medium text-white/90">
          {index + 1} of {urls.length}
        </p>

        {urls.length > 1 && (
          <div className="mt-4 flex gap-4">
            <button
              type="button"
              onClick={goPrev}
              className="rounded-lg bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/20 focus:outline focus:outline-2 focus:outline-white"
            >
              ← Previous
            </button>
            <button
              type="button"
              onClick={goNext}
              className="rounded-lg bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/20 focus:outline focus:outline-2 focus:outline-white"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
