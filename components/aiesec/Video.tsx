'use client';
import * as React from 'react';
import { Icon } from './icons';
import type { RatioStyle } from './Media';
import { cx } from './utils';

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

/** A video in the media frame: the poster with one play button until started, then the native player. Never autoplays; captions supported. */
export function Video({ src, title, tracks = [], ratio = '16 / 9', caption, className, ...rest }: VideoProps) {
  const ref = React.useRef<HTMLVideoElement>(null);
  const [started, setStarted] = React.useState(false);

  const start = () => {
    setStarted(true);
    ref.current?.focus();
    ref.current?.play().catch(() => undefined);
  };

  return (
    <figure className={cx('ae-media', className)}>
      <div className="ae-media__frame" style={{ '--_ratio': ratio } as RatioStyle}>
        <video ref={ref} src={src} aria-label={title} controls={started} preload="metadata" playsInline {...rest}>
          {tracks.map((t) => (
            <track key={t.src} kind="captions" src={t.src} srcLang={t.srclang} label={t.label} default={t.default} />
          ))}
        </video>
        {!started && (
          <button type="button" className="ae-video__play" onClick={start}>
            <span className="ae-video__play-icon">
              <Icon name="play" size={24} />
            </span>
            <span className="ae-sr-only">Play video: {title}</span>
          </button>
        )}
      </div>
      {caption && <figcaption className="ae-media__caption ae-body-sm">{caption}</figcaption>}
    </figure>
  );
}
