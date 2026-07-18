import { type SVGProps } from 'react';

/**
 * Brand icon family derived from the Night Terminal Spark app icon
 * (design/icon-concepts/v3-h3b.svg): a card whose magnetic stripe is a
 * progress bar, with a gold spark at the fill terminal.
 *
 * BrandMark and EmptyCardsIcon follow lucide metrics (24-grid, 2px stroke)
 * so they sit alongside lucide-react icons without looking foreign.
 */

/** Line-style brand mark for nav and inline use. Card inherits currentColor;
 *  the progress fill uses the primary token and the spark the spark token. */
export function BrandMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect x="2" y="4.5" width="20" height="15" rx="3" />
      <path d="M6 10.5h12" className="text-muted-foreground/50" />
      <path d="M6 10.5h6" className="text-primary" />
      <path d="M6 15.5h4" className="text-muted-foreground/50" />
      <path
        d="M13.5 6.5 C13.9 9 15 10.1 17.5 10.5 C15 10.9 13.9 12 13.5 14.5 C13.1 12 12 10.9 9.5 10.5 C12 10.1 13.1 9 13.5 6.5 Z"
        className="text-spark"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

/** Full-colour miniature of the app icon (rounded tile) for hero spots. */
export function BrandTile(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 512 512" aria-hidden="true" {...props}>
      <defs>
        <linearGradient id="brand-tile-ember" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#D92D2D" />
          <stop offset="1" stopColor="#FF6A45" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="115" fill="#D92D2D" />
      <rect x="82" y="146" width="348" height="220" rx="36" fill="#1D1B20" />
      <rect x="118" y="204" width="276" height="48" rx="24" fill="#FFFFFF" opacity="0.14" />
      <rect x="118" y="204" width="168" height="48" rx="24" fill="url(#brand-tile-ember)" />
      <rect x="118" y="298" width="116" height="26" rx="13" fill="#FFFFFF" opacity="0.12" />
      <path
        d="M286 166 C292 206 308 222 348 228 C308 234 292 250 286 290 C280 250 264 234 224 228 C264 222 280 206 286 166 Z"
        fill="#F5B942"
      />
    </svg>
  );
}

/** Concave four-point spark; fills with currentColor so it can take
 *  text-spark (brand gold) or any contextual colour. */
export function SparkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 3 C12.9 8.4 15.6 11.1 21 12 C15.6 12.9 12.9 15.6 12 21 C11.1 15.6 8.4 12.9 3 12 C8.4 11.1 11.1 8.4 12 3 Z" />
    </svg>
  );
}

/** Empty-state mark: dashed card, empty track, hollow spark waiting at the
 *  start of the stripe — progress not started yet. */
export function EmptyCardsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect x="2" y="4.5" width="20" height="15" rx="3" strokeDasharray="3.2 3.2" />
      <path d="M10.5 10.5H18" opacity="0.4" />
      <path d="M6 15.5h4" opacity="0.4" />
      <path
        d="M7 7.5 C7.3 9.4 8.1 10.2 10 10.5 C8.1 10.8 7.3 11.6 7 13.5 C6.7 11.6 5.9 10.8 4 10.5 C5.9 10.2 6.7 9.4 7 7.5 Z"
        strokeWidth="1.5"
      />
    </svg>
  );
}
