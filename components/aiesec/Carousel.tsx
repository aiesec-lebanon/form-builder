'use client';
import * as React from 'react';
import { Button } from './Button';
import { Icon } from './icons';
import { cx } from './utils';

export interface CarouselProps {
  /** Names the carousel, e.g. "Volunteer stories". */
  label: string;
  /** One node per slide (an Image, a Card, a quote). */
  slides: React.ReactNode[];
  /** Spoken slide name. Default "1 of 5". */
  slideLabel?: (index: number, total: number) => string;
  className?: string;
}

/** A swipeable row of slides with previous/next and dot controls. Never auto-advances. */
export function Carousel({ label, slides, slideLabel = (i, n) => `${i + 1} of ${n}`, className }: CarouselProps) {
  const track = React.useRef<HTMLDivElement>(null);
  const [index, setIndex] = React.useState(0);
  const total = slides.length;

  React.useEffect(() => {
    const root = track.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setIndex(Number((e.target as HTMLElement).dataset.index));
      },
      { root, threshold: 0.6 },
    );
    Array.from(root.children).forEach((child) => io.observe(child));
    return () => io.disconnect();
  }, [total]);

  const go = (i: number) => {
    const target = track.current?.children[(i + total) % total] as HTMLElement | undefined;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest', inline: 'start' });
  };

  return (
    <section className={cx('ae-carousel', className)} aria-roledescription="carousel" aria-label={label}>
      <div ref={track} className="ae-carousel__track" tabIndex={0}>
        {slides.map((slide, i) => (
          <div key={i} className="ae-carousel__slide" role="group" aria-roledescription="slide" aria-label={slideLabel(i, total)} data-index={i}>
            {slide}
          </div>
        ))}
      </div>
      {total > 1 && (
        <div className="ae-carousel__controls">
          <div className="ae-carousel__dots">
            {slides.map((_, i) => (
              <button key={i} type="button" className="ae-carousel__dot" aria-label={`Go to slide ${i + 1}`} aria-current={i === index ? 'true' : undefined} onClick={() => go(i)} />
            ))}
          </div>
          <div className="ae-carousel__nav">
            <Button size="sm" iconOnly aria-label="Previous slide" onClick={() => go(index - 1)}>
              <Icon name="chevron-left" size={20} className="ae-icon--flip" />
            </Button>
            <Button size="sm" iconOnly aria-label="Next slide" onClick={() => go(index + 1)}>
              <Icon name="chevron-right" size={20} className="ae-icon--flip" />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
