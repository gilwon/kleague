'use client';

import { useState } from 'react';

interface BadgeImgProps {
  badge?: string | null;
  fallbackBadge?: string | null;
  label: string;
  size?: number;
}

export default function BadgeImg({ badge, fallbackBadge, label, size = 44 }: BadgeImgProps) {
  const [stage, setStage] = useState(0); // 0=primary, 1=fallback, 2=text
  const src = stage === 0 ? badge : stage === 1 ? fallbackBadge : null;
  if (!src) {
    return (
      <span
        className="team-badge-fallback text-[10px] font-bold"
        style={{ width: size, height: size, minWidth: size }}
      >
        {label.slice(0, 2)}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={label}
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: 'contain', minWidth: size }}
      onError={() => setStage((s) => s + 1)}
    />
  );
}
