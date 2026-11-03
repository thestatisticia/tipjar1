'use client';

import { use, useState, useEffect } from 'react';
import TipPageView from '@/components/TipPageView';
import type { Creator, Tip } from '@/providers/CreatorProvider';

export default function WidgetPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const [creatorInfo, setCreatorInfo] = useState<Creator | null>(null);

  useEffect(() => {
    fetch(`/api/profile?username=${username}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setCreatorInfo(data); });
  }, [username]);

  const handleAddTip = async (tip: Tip) => {
    const response = await fetch('/api/tips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tip),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not save your tip activity.');
  };

  if (!creatorInfo) return null;

  return (
    <div className="min-h-screen w-full bg-background p-3">
      <TipPageView creatorInfo={creatorInfo} onAddTip={handleAddTip} isWidget={true} />
    </div>
  );
}
