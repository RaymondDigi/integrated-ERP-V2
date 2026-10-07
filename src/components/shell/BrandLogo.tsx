import React from 'react';

/** The two interlocking forms represent connected modules. Transparent outside the rounded tile. */
export const BrandMark: React.FC<{ size?: number; className?: string }> = ({ size = 36, className = '' }) => (
  <svg
    className={`brand-mark ${className}`}
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
  >
    <rect width="64" height="64" rx="17" fill="#153E33" />
    <path d="M17 36V24C17 19.0294 21.0294 15 26 15H43V25H28V36H17Z" fill="#8BE3B3" />
    <path d="M47 28V40C47 44.9706 42.9706 49 38 49H21V39H36V28H47Z" fill="#EDF8ED" />
  </svg>
);

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  /** Hide the wordmark (mark only), e.g. on very small screens. */
  compact?: boolean;
  /** Force light-on-dark colours regardless of theme. */
  onDark?: boolean;
  className?: string;
}

const MARK_SIZE = { sm: 30, md: 36, lg: 48 };

export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 'md', compact = false, onDark = false, className = '' }) => (
  <span
    className={`brand-lockup brand-${size} ${onDark ? 'brand-on-dark' : ''} ${compact ? 'brand-compact' : ''} ${className}`}
    role="img"
    aria-label="Integrated Workforce"
  >
    <BrandMark size={MARK_SIZE[size]} />
    <span className="brand-wordmark" aria-hidden="true">
      integrated<span className="brand-period">.</span>
      <span className="brand-caption">WORKFORCE</span>
    </span>
  </span>
);
