'use client';

import { useEffect, useState } from 'react';

function getRemaining(expiresAt: string, now: number) {
  const remainingMs = new Date(expiresAt).getTime() - now;
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return 'Expired';

  const totalMinutes = Math.ceil(remainingMs / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `Expires in ${days}d ${hours}h`;
  if (hours > 0) return `Expires in ${hours}h ${minutes}m`;
  return `Expires in ${minutes}m`;
}

export default function ExpiryCountdown({ expiresAt }: { expiresAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!expiresAt) return <span>No expiry set</span>;

  return (
    <time dateTime={expiresAt} aria-live="polite">
      {getRemaining(expiresAt, now)} · {new Date(expiresAt).toLocaleDateString()}
    </time>
  );
}
