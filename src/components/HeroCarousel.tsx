import { useEffect, useState, type ReactNode } from 'react';
import clsx from 'clsx';

// Every image dropped into src/assets/hero is picked up automatically (sorted by file name).
const found = import.meta.glob('/src/assets/hero/*.{webp,jpg,jpeg,png,avif}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const HERO_IMAGES: string[] = Object.keys(found).sort().map((k) => found[k]);

/** Full-bleed rotating background. Loads only the current and next image to save mobile data. */
export function HeroCarousel({ children, interval = 6500 }: { children: ReactNode; interval?: number }) {
  const n = HERO_IMAGES.length;
  const [idx, setIdx] = useState(0);
  const [seen, setSeen] = useState<Set<number>>(() => new Set([0, n > 1 ? 1 : 0]));
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (n < 2 || paused) return;
    const t = setInterval(() => { if (!document.hidden) setIdx((i) => (i + 1) % n); }, interval);
    return () => clearInterval(t);
  }, [n, paused, interval]);

  useEffect(() => { setSeen((s) => new Set(s).add(idx).add((idx + 1) % n)); }, [idx, n]);

  return (
    <section className="relative isolate overflow-hidden bg-brand-900" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="absolute inset-0 -z-10">
        {n === 0 ? (
          <div className="h-full w-full bg-gradient-to-br from-brand-900 via-brand-800 to-crimson-600">
            <div className="h-full w-full bg-[radial-gradient(circle_at_75%_30%,rgba(224,176,74,0.35),transparent_55%)]" />
          </div>
        ) : HERO_IMAGES.map((src, i) => seen.has(i) && (
          <img key={src} src={src} alt="" aria-hidden="true" {...{ fetchpriority: i === 0 ? 'high' : 'low' }} decoding="async"
            className={clsx('absolute inset-0 h-full w-full object-cover transition-opacity duration-[1400ms] ease-in-out', i === idx ? 'opacity-100 hero-zoom' : 'opacity-0')} />
        ))}
        <div className="absolute inset-0 bg-gradient-to-r from-brand-900/90 via-brand-900/60 to-brand-900/10" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-brand-900/80 to-transparent" />
      </div>

      {children}

      {n > 1 && (
        <div className="absolute bottom-5 right-4 flex gap-2 md:right-8" role="tablist" aria-label="Hero images">
          {HERO_IMAGES.map((_, i) => (
            <button key={i} role="tab" aria-selected={i === idx} aria-label={`Show photo ${i + 1}`} onClick={() => setIdx(i)}
              className={clsx('h-2 rounded-full transition-all', i === idx ? 'w-7 bg-gold-400' : 'w-2 bg-white/50 hover:bg-white/80')} />
          ))}
        </div>
      )}
    </section>
  );
}
