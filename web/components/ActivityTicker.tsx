'use client';

import { useEffect, useRef, useState } from 'react';
import { Activity, CircleAlert } from 'lucide-react';

interface ActivityItem {
  id: string;
  message: string;
}

export default function ActivityTicker() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [error, setError] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [paused, setPaused] = useState(false);
  const tickerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<Animation | null>(null);

  useEffect(() => {
    let active = true;
    const loadActivity = async () => {
      try {
        const response = await fetch('/api/public/activity-feed');
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load live community activity.');
        if (active) {
          setItems(data as ActivityItem[]);
          setError(false);
        }
      } catch {
        if (active) setError(true);
      }
    };

    void loadActivity();
    const interval = window.setInterval(() => void loadActivity(), 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = () => setReducedMotion(motionPreference.matches);
    updateMotionPreference();
    motionPreference.addEventListener('change', updateMotionPreference);
    return () => motionPreference.removeEventListener('change', updateMotionPreference);
  }, []);

  useEffect(() => {
    const ticker = tickerRef.current;
    if (!ticker) return;

    const updateAnimation = () => {
      const segment = ticker.firstElementChild;
      if (!(segment instanceof HTMLElement)) return;
      const duration = Math.max(1, (segment.getBoundingClientRect().width * 2 / 32) * 1000);
      if (animationRef.current?.effect?.getTiming().duration === duration) return;

      animationRef.current?.cancel();
      animationRef.current = ticker.animate(
        [
          { transform: 'translate3d(0, 0, 0)' },
          { transform: 'translate3d(-50%, 0, 0)' },
        ],
        { duration, easing: 'linear', iterations: Infinity },
      );
    };

    updateAnimation();
    const resizeObserver = new ResizeObserver(updateAnimation);
    resizeObserver.observe(ticker);
    if (ticker.firstElementChild) resizeObserver.observe(ticker.firstElementChild);
    return () => {
      resizeObserver.disconnect();
      animationRef.current?.cancel();
      animationRef.current = null;
    };
  }, [items]);

  useEffect(() => {
    const animation = animationRef.current;
    if (!animation) return;
    if (reducedMotion || paused) animation.pause();
    else animation.play();
  }, [paused, reducedMotion]);

  return (
    <section
      aria-label="Live community activity"
      className="glass-panel overflow-hidden border-b border-line/70"
    >
      <div className="mx-auto flex h-11 w-full max-w-[min(1680px,94vw)] items-center gap-4 px-6 2xl:px-10 max-lg:max-w-6xl max-lg:px-5">
        <span className="inline-flex shrink-0 items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-success">
          {error ? <CircleAlert size={14} /> : <Activity size={14} />}
          {error ? 'Updates unavailable' : 'Community updates'}
        </span>
        <div className="min-w-0 flex-1 overflow-hidden">
          {error ? (
            <p role="status" className="truncate text-xs text-muted-foreground">
              Live community activity is temporarily unavailable.
            </p>
          ) : items.length === 0 ? (
            <p role="status" className="truncate text-xs text-muted-foreground">
              Verified task, campaign, and daily reward updates will appear here.
            </p>
          ) : (
            <div
              ref={tickerRef}
              className="activity-marquee flex w-max items-center"
              style={{
                backfaceVisibility: 'hidden',
                willChange: reducedMotion ? 'auto' : 'transform',
              }}
              onMouseEnter={() => setPaused(true)}
              onMouseLeave={() => setPaused(false)}
              aria-live="off"
            >
              {Array.from({ length: 4 }, (_, copy) => (
                <div
                  key={copy}
                  aria-hidden={copy > 0}
                  className="flex shrink-0 items-center"
                >
                  {items.map((item) => (
                    <span
                      key={`${copy}:${item.id}`}
                      className="mx-6 inline-flex items-center gap-2 whitespace-nowrap text-xs text-foreground/85"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                      {item.message}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
