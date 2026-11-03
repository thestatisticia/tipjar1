'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Copy, Check, QrCode, Code, Link2, Download, ArrowRight } from 'lucide-react';
import { useCreator } from '@/providers/CreatorProvider';

export default function SharePage() {
  const { creator } = useCreator();
  const [copied, setCopied] = useState<'link' | 'widget' | null>(null);
  const [origin, setOrigin] = useState('');

  useEffect(() => setOrigin(window.location.origin), []);

  const tipLink = `${origin}/tip/${creator.username || 'username'}`;
  const widgetCode = `<iframe src="${origin}/widget/${creator.username || 'username'}" width="350" height="500" style="border:1px solid #e5e5e5;border-radius:16px;"></iframe>`;

  const copy = (text: string, which: 'link' | 'widget') => {
    navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleDownloadQR = () => {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(tipLink)}&format=png`;
    const link = document.createElement('a');
    link.href = qrUrl;
    link.download = `tip-qr-${creator.username || 'code'}.png`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="mx-auto flex max-w-3xl animate-fade-up flex-col gap-6">
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight">Share</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Put your tip jar everywhere your fans are.
        </p>
      </div>

      {!creator.username && (
        <Link
          href="/settings"
          className="flex items-center justify-between gap-4 rounded-xl border border-line bg-accent/15 px-5 py-4 transition-colors hover:bg-accent/25"
        >
          <div>
            <p className="text-sm font-semibold">Claim your username first</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Your link, QR code, and widget activate once you register a username in Settings.
            </p>
          </div>
          <ArrowRight size={16} className="shrink-0 text-muted-foreground" />
        </Link>
      )}

      {/* Tip link */}
      <section className="rounded-xl border border-line bg-card p-6">
        <div className="mb-4 flex items-center gap-2.5">
          <Link2 size={17} className="text-muted-foreground" />
          <h3 className="font-display text-[15px] font-semibold">Tip link</h3>
        </div>
        <div className="flex h-11 items-center gap-1 rounded-xl border border-line bg-background pl-3.5 pr-1">
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
            {creator.username ? tipLink : 'Set a username to activate your link'}
          </span>
          <button
            onClick={() => copy(tipLink, 'link')}
            disabled={!creator.username}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            {copied === 'link' ? <Check size={13} /> : <Copy size={13} />}
            {copied === 'link' ? 'Copied' : 'Copy'}
          </button>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-6 max-md:grid-cols-1">
        {/* QR code */}
        <section className="rounded-xl border border-line bg-card p-6">
          <div className="mb-4 flex items-center gap-2.5">
            <QrCode size={17} className="text-muted-foreground" />
            <h3 className="font-display text-[15px] font-semibold">QR code</h3>
          </div>
          <div className="flex items-center gap-4">
            <div className="shrink-0 rounded-xl border border-line bg-white p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(tipLink)}`}
                alt="Tipping QR code"
                className="h-24 w-24"
              />
            </div>
            <div className="min-w-0">
              <p className="truncate font-mono text-sm font-semibold">@{creator.username || 'username'}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Scan to tip in G$</p>
              <button
                onClick={handleDownloadQR}
                disabled={!creator.username}
                className="mt-3 flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold transition-colors hover:border-foreground/30 disabled:opacity-40"
              >
                <Download size={12} />
                Download
              </button>
            </div>
          </div>
        </section>

        {/* Embed widget */}
        <section className="rounded-xl border border-line bg-card p-6">
          <div className="mb-4 flex items-center gap-2.5">
            <Code size={17} className="text-muted-foreground" />
            <h3 className="font-display text-[15px] font-semibold">Embed widget</h3>
          </div>
          <pre className="mb-3 max-h-28 overflow-auto rounded-lg bg-muted p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all text-muted-foreground">
            {widgetCode}
          </pre>
          <button
            onClick={() => copy(widgetCode, 'widget')}
            disabled={!creator.username}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-line py-2 text-xs font-semibold transition-colors hover:border-foreground/30 disabled:opacity-40"
          >
            {copied === 'widget' ? <><Check size={13} />Copied</> : <><Copy size={13} />Copy HTML</>}
          </button>
        </section>
      </div>
    </div>
  );
}
