'use client';

import { useState, useEffect } from 'react';
import TipPageView from '@/components/TipPageView';
import type { Creator, Tip } from '@/providers/CreatorProvider';

export default function TipPageClient({ username }: { username: string }) {
  const [creatorInfo, setCreatorInfo] = useState<Creator | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/profile?username=${username}`)
      .then((r) => {
        if (!r.ok) { setNotFound(true); return null; }
        return r.json();
      })
      .then((data) => { if (data) setCreatorInfo(data); });
  }, [username]);

  const handleAddTip = async (tip: Tip) => {
    await fetch('/api/tips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tip),
    });
  };

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="font-display text-lg font-bold">Creator not found</p>
        <p className="text-sm text-muted-foreground">@{username} has not registered yet.</p>
      </div>
    );
  }

  if (!creatorInfo) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <TipPageView creatorInfo={creatorInfo} onAddTip={handleAddTip} />
    </div>
  );
}
