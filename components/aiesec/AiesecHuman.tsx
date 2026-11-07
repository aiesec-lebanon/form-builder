import * as React from 'react';

/** The AIESEC Human, from the official AIESEC-Human-White.ai (logos.aiesec.org). */
const HUMAN_VIEWBOX = '335.5 133.75 529 932.5';
const HUMAN_PATH =
  'M838.06 998.22c-8.14.53-60.77 3.74-67.8-3.95-28-30.67-56.85-140.3-72.96-174.2-8.95-18.82-53.97-173.23-85.8-240.23l.54-42.06s13.36 5.38 16.36 7.3c11.18 7.13 49.07 30.1 64.95 48.42 5.1 5.9 13.1 19.28 14.73 21.98 6.98 11.5 26.58 11.1 40.04 2.58 6.54-4.13 11.69-25.15-5.54-36.95-5.08-3.47-22.47-9.95-32.33-18.13-6.72-5.57-63.6-56.66-70.83-64.5-4.71-5.12-25.5-24.61-25.5-24.61-1.1-13.98-7.96-97.08-16.95-132.96-4.7-18.78-9.37-30.87-9.18-40.1.15-7.1-1.58-40.15 14.41-37.24 25.88 4.72 40.5-48.03 37.22-79.4-2.79-26.8-19.1-50.3-56.5-50.3-14.34 0-41.49 14.17-46.77 38.02-6.65 30.06-.19 41.18 0 56.48.06 4.28.52 12.88 0 17.14-.6 5.03-4.25 30.26-10.2 37.15-8.22 9.5-29.67 22.01-48.98 53.8-15.06 24.8-28.68 83.04-38.87 117.15-15.87 53.15-24.16 134.88-36.44 155.16-8.76 14.47-13.23 29.87-11.94 44.85 2.62 30.21 36 22.22 42.69 9.2 7.03-13.68 6.3-33.2 7.2-42.78 2.34-25.31 44.09-139.24 44.09-139.24s-2.74 75.78-3.76 88.32c0 0-8.2 26.67-14.42 64.17-2.81 16.99-3.08 32.06-5.48 59.72-3.38 38.81-10.28 86.87-18.03 121.72-33.54 35.2-52.09 99.59-84.85 142.23-5.65 7.34-34.59 27.6-14.54 51.53 10.79 12.87 32.56 30.94 38.5 36.2 3.1 2.73 20.18 19.33 32.28 20.96 8.31 1.12 23.63.97 25.06-7.88.77-4.73-16.6-12.86-18.52-15.23-9.67-12-16.49-31.61-17.47-42.45-.47-5.1 1.7-8.97 3.41-12.45 6.17-12.53 73.97-105.75 93.4-139.62 20.18-35.22 44.14-117 58.27-151.74 11.22 34.56 69 135.16 95.3 184.2 11.81 36.91 31.1 70.16 65.72 132.96 6.1 11.06 7.38 36.68 16.4 41.23 5.8 2.92 13.96 1.38 29.31-6.28 44.36-22.14 100.08-25.27 100.08-35.95 0-9.43-18.57-14.71-26.3-14.22';
const RATIO = 529.0 / 932.5;

export interface AiesecHumanProps extends Omit<React.SVGProps<SVGSVGElement>, 'children'> {
  /** Height in px; the width follows the mark's proportions. Default 24. */
  size?: number;
  /** The Blue Book allows the Human only in AIESEC Blue or white. Default `blue`. */
  tone?: 'blue' | 'white';
  /** Accessible name. Omit when decorative (then aria-hidden). */
  title?: string;
}

/** The AIESEC Human: the brand icon for favicons, avatars, watermarks and small spaces. */
export function AiesecHuman({ size = 24, tone = 'blue', title, style, ...rest }: AiesecHumanProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={HUMAN_VIEWBOX}
      width={Math.round(size * RATIO)}
      height={size}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      style={{ fill: tone === 'white' ? 'var(--ae-white)' : 'var(--ae-brand)', flex: 'none', ...style }}
      {...rest}
    >
      <path d={HUMAN_PATH} />
    </svg>
  );
}
