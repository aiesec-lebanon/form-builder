import * as React from 'react';
import { cx } from './utils';

type RatioStyle = React.CSSProperties & { '--_ratio'?: string };

/** The official AIESEC watermark (AIESEC-Human-Watermark.ai, logos.aiesec.org): the white Human on an AIESEC Blue tab. */
function Watermark() {
  return (
    <svg className="ae-watermark" viewBox="155.5 48.75 308.5 501.75" aria-hidden="true" focusable="false">
      <path style={{ fill: 'var(--ae-white)' }} d="M419 506.5H188v-356h231Zm0 0" />
      <path style={{ fill: 'var(--ae-brand)' }} d="M360.95 475.3c-4.74 2.36-7.27 2.84-9.06 1.93-2.79-1.4-3.18-9.32-5.07-12.75-10.7-19.4-16.66-29.69-20.32-41.1-8.12-15.16-25.99-46.26-29.46-56.95-4.37 10.74-11.77 36.03-18.02 46.91-6 10.48-26.96 39.3-28.87 43.17-.53 1.08-1.2 2.28-1.05 3.85.3 3.35 2.41 9.41 5.4 13.12.59.74 5.96 3.25 5.72 4.71-.44 2.74-5.17 2.78-7.74 2.44-3.75-.5-9.03-5.64-9.98-6.48-1.84-1.63-8.57-7.22-11.9-11.2-6.2-7.4 2.74-13.65 4.49-15.92 10.13-13.19 15.86-33.1 26.23-43.98 2.4-10.77 4.53-25.63 5.57-37.62.75-8.56.83-13.22 1.7-18.47 1.92-11.6 4.46-19.84 4.46-19.84.31-3.87 1.16-27.3 1.16-27.3s-12.9 35.22-13.63 43.05c-.28 2.95-.05 8.99-2.23 13.22-2.06 4.02-12.39 6.5-13.2-2.84-.4-4.64.99-9.4 3.7-13.87 3.8-6.27 6.36-31.54 11.26-47.97 3.15-10.54 7.36-28.55 12.02-36.21 5.97-9.83 12.6-13.7 15.14-16.64 1.84-2.13 2.97-9.93 3.16-11.49.16-1.3.01-3.97 0-5.3-.06-4.72-2.06-8.16 0-17.45 1.63-7.38 10.02-11.76 14.46-11.76 11.56 0 16.6 7.26 17.46 15.55 1.01 9.7-3.5 26-11.5 24.55-4.95-.9-4.42 9.32-4.46 11.5-.06 2.86 1.38 6.6 2.84 12.4 2.78 11.1 4.9 36.8 5.24 41.12 0 0 6.42 6.02 7.88 7.6 2.24 2.42 19.82 18.22 21.9 19.94 3.05 2.53 8.43 4.54 10 5.6 5.32 3.66 3.73 10.16 1.71 11.43-4.16 2.64-10.23 2.76-12.38-.8-.5-.83-2.98-4.97-4.56-6.8-4.9-5.65-16.62-12.76-20.07-14.96-.93-.6-5.06-2.26-5.06-2.26l-.17 13c9.84 20.72 23.76 68.46 26.53 74.28 4.98 10.47 13.9 44.37 22.55 53.85 2.18 2.38 18.45 1.39 20.97 1.22 2.38-.15 8.12 1.48 8.12 4.4 0 3.3-17.22 4.27-30.94 11.11M155.73 48.86v462.08a39.43 39.43 0 0 0 39.43 39.42h229.36a39.43 39.43 0 0 0 39.43-39.42V48.86Zm0 0" />
    </svg>
  );
}

export interface ImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'children'> {
  /** Describe what the photo shows; `""` only when purely decorative. */
  alt: string;
  /** CSS aspect ratio. Default "16 / 9". */
  ratio?: string;
  caption?: React.ReactNode;
  /** The official AIESEC watermark (white Human on an AIESEC Blue tab), top right. Only on AIESEC's own channels. */
  watermark?: boolean;
  /** Square corners (for full-bleed heroes). Default: `ae-radius-xl` corners. */
  square?: boolean;
  /** Your own image element instead of <img>, e.g. next/image with `fill`. */
  children?: React.ReactNode;
}

/** A photo in a rounded frame with an optional caption and AIESEC watermark. Lazy-loads by default. */
export function Image({ alt, ratio = '16 / 9', caption, watermark = false, square = false, className, children, ...rest }: ImageProps) {
  return (
    <figure className={cx('ae-media', square && 'ae-media--square', className)}>
      <div className="ae-media__frame" style={{ '--_ratio': ratio } as RatioStyle}>
        {children ?? <img alt={alt} loading="lazy" decoding="async" {...rest} />}
        {watermark && <Watermark />}
      </div>
      {caption && <figcaption className="ae-media__caption ae-body-sm">{caption}</figcaption>}
    </figure>
  );
}

export interface VideoTrack {
  src: string;
  /** BCP 47 language, e.g. "en", "ar", "fr". */
  srclang: string;
  label: string;
  default?: boolean;
}

export interface VideoProps extends Omit<React.VideoHTMLAttributes<HTMLVideoElement>, 'children'> {
  src: string;
  /** Accessible name of the player, e.g. "Global Volunteer in Brazil: Maya's story". */
  title: string;
  /** Caption files (WebVTT). Required for videos with speech. */
  tracks?: VideoTrack[];
  /** CSS aspect ratio. Default "16 / 9". */
  ratio?: string;
  caption?: React.ReactNode;
}

/** A native video player in the media frame: no autoplay, captions supported. */
export function Video({ src, title, tracks = [], ratio = '16 / 9', caption, className, ...rest }: VideoProps) {
  return (
    <figure className={cx('ae-media', className)}>
      <div className="ae-media__frame" style={{ '--_ratio': ratio } as RatioStyle}>
        <video src={src} aria-label={title} controls preload="metadata" playsInline {...rest}>
          {tracks.map((t) => (
            <track key={t.src} kind="captions" src={t.src} srcLang={t.srclang} label={t.label} default={t.default} />
          ))}
        </video>
      </div>
      {caption && <figcaption className="ae-media__caption ae-body-sm">{caption}</figcaption>}
    </figure>
  );
}
