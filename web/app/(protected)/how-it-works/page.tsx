'use client';

import { ShieldCheck, Wallet, Zap } from 'lucide-react';

const STEPS = [
  {
    n: '01',
    title: 'Sign in & register',
    desc: 'Connect your wallet via Privy. Pick a username — it gets registered on the TipJarRegistry smart contract on Celo.',
  },
  {
    n: '02',
    title: 'Share your page',
    desc: 'Copy your tipping link or QR code and share it anywhere. Embed the iframe widget directly on your website.',
  },
  {
    n: '03',
    title: 'Earn peer-to-peer',
    desc: 'Fans send G$ directly from their wallet to yours, on-chain. Instant, transparent, and fee-free.',
  },
];

const HIGHLIGHTS = [
  {
    icon: Zap,
    title: 'Instant flow',
    desc: 'Tips move wallet-to-wallet in seconds so creators do not wait for payouts.',
  },
  {
    icon: Wallet,
    title: 'Creator owned funds',
    desc: 'TipJar never custodians money. Fans send directly to the creator wallet.',
  },
  {
    icon: ShieldCheck,
    title: 'Transparent by design',
    desc: 'Every tip is on-chain and verifiable on Celo for full transparency.',
  },
];

export default function HowItWorksPage() {
  return (
    <div className="mx-auto flex max-w-4xl animate-fade-up flex-col gap-8">
      <div>
        <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          How it works
        </span>
        <h2 className="mt-2 font-display text-3xl font-bold tracking-tight max-md:text-2xl">
          From signup to your first tip
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Direct creator support with G$ — Universal Basic Income on Celo.
        </p>
      </div>

      <div className="grid gap-4">
        {STEPS.map((s, i) => (
          <div
            key={s.n}
            className="grid grid-cols-[auto_1fr] gap-4 rounded-2xl border border-line bg-card p-5 max-md:grid-cols-1"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 font-mono text-xs font-bold text-accent">
                {s.n}
              </span>
              {i < STEPS.length - 1 && <span className="mt-8 hidden h-10 w-px bg-line md:block" />}
            </div>
            <div>
              <h3 className="font-display text-base font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-line bg-card p-6">
        <h3 className="font-display text-base font-semibold">Why creators trust TipJar</h3>
        <div className="mt-4 grid grid-cols-3 gap-3 max-md:grid-cols-1">
          {HIGHLIGHTS.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="rounded-xl border border-line bg-background p-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
                  <Icon size={16} />
                </div>
                <p className="mt-3 text-sm font-semibold">{item.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.desc}</p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
