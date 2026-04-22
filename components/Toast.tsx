'use client';

import { useEffect } from 'react';

interface ToastProps {
  message: string | null;
  onClose: () => void;
}

export default function Toast({ message, onClose }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 px-5 py-3 rounded-xl bg-[var(--panel)] border border-[var(--border)] text-[var(--text)] shadow-2xl text-sm max-w-[90vw]">
      <span className="text-yellow-400 text-base">⚠</span>
      <span>{message}</span>
      <button
        onClick={onClose}
        className="ml-2 text-[var(--muted)] hover:text-[var(--text)] text-lg leading-none"
        aria-label="닫기"
      >
        ×
      </button>
    </div>
  );
}
